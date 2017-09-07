'use strict';

const debug = require( 'debug' )( 'skiff.db' );
const Sublevel = require( 'level-sublevel' );
const Once = require( 'once' );
const async = require( 'async' );
const ConcatStream = require( 'concat-stream' );
const Leveldown = require( 'leveldown' );
const Levelup = require( 'levelup' );
const clearDB = require( './utils/clear-db' );
const join = require( 'path' ).join;

const ALLOWED_TYPES = ['put', 'del'];

/**
 * @type {DB}
 * @name DB
 */
module.exports = class DB {

	constructor( _location, id, db, options ) {
		Object.defineProperties( this, {
			id: { value: id },
		} );

		const dbName = id.toString().replace( /\//g, '_' ).replace( /\./g, '_' );
		const leveldown = db || Leveldown;
		const location = join( _location, dbName );
		this._levelup = new Levelup( location, Object.assign( {}, options, { db: leveldown } ) );
		this._leveldown = this._levelup.db;
		this.db = Sublevel( this._levelup );

		this.log = this.db.sublevel( 'log' );
		this.meta = this.db.sublevel( 'meta' );
		this.state = this.db.sublevel( 'state' );
		this.state.clear = clearDB;

		// for debugging purposes
		this.log.toJSON = function() { return 'log'; };
		this.meta.toJSON = function() { return 'meta'; };
		this.state.toJSON = function() { return 'state'; };
	}

	load() {
		return new Promise( ( resolve, reject ) => {
			async.parallel( {
				log: cb => {
					const s = this.log.createReadStream();
					s.once( 'error', cb );
					s.pipe( ConcatStream( entries => {
						cb( null, entries.sort( sortEntries ).map( fixLoadedEntry ) );
					} ) );
				},
				meta: cb => {
					async.parallel( {
						currentTerm: cb => this.meta.get( 'currentTerm', notFoundIsOk( cb ) ),
						votedFor: cb => this.meta.get( 'votedFor', notFoundIsOk( cb ) ),
						peers: cb => this.meta.get( 'peers', notFoundIsOk( cb ) )
					}, cb );
				}
			}, ( error, data ) => {
				if ( error ) {
					reject( error );
				} else {
					resolve( data );
				}
			} );
		} );

		function sortEntries( a, b ) {
			const keyA = a.key;
			const keyB = b.key;
			const keyAParts = keyA.split( ':' );
			const keyBParts = keyB.split( ':' );
			const aTerm = Number( keyAParts[0] );
			const bTerm = Number( keyBParts[0] );
			if ( aTerm !== bTerm ) {
				return aTerm - bTerm;
			}
			const aIndex = Number( keyAParts[1] );
			const bIndex = Number( keyBParts[1] );

			return aIndex - bIndex;
		}

		function notFoundIsOk( cb ) {
			return function( err, result ) {
				if ( err && err.message.match( /not found/i ) ) {
					cb();
				} else {
					cb( err, result );
				}
			};
		}
	}

	persist( node, done ) {
		debug( '%s: persisting state', this.id );
		this._getPersistBatch( node, ( err, batch ) => {
			if ( err ) {
				done( err );
			} else {
				this.db.batch( batch, done );
			}
		} );
	}

	/**
	 * Persists current log of cluster in database and performs requested
	 * command on cluster's state database afterwards or forwards topology
	 * commands to provided node.
	 *
	 * @param {Node} node reference on node providing log to persists and handling any topology command
	 * @param {object} command actual command to be performed
	 * @param {object<string,*>} options
	 * @returns {Promise}
	 */
	command( node, command, options ) {
		return new Promise( ( resolve, reject ) => {
			this._getPersistBatch( node, ( error, batch ) => {
				if ( error ) {
					return reject( error );
				}

				const isQuery = (command.type === 'get');
				const isTopology = (command.type === 'join' || command.type === 'leave');

				debug( '%s: going to apply batch: %j', this.id, batch );

				this.db.batch( batch, error => {
					debug( '%s: applied batch command err = %j', this.id, error );

					if ( error ) {
						return reject( error );
					}

					if ( isQuery ) {
						return this.state.get( command.key, ( error, result ) => {
							if ( error ) {
								reject( error );
							} else {
								resolve( result );
							}
						} );
					}

					if ( isTopology ) {
						node.applyTopologyCommand( command );
					}

					resolve();
				} );
			} );
		} );
	}

	/**
	 * Applies some given log entries to database.
	 *
	 * Entries describing commands regarding cluster topology are separated from
	 * those with commands for accessing current state of cluster as a database.
	 * Topology commands are then forward to provided callback for separate
	 * processing while state-related commands are applied to state database
	 * internally.
	 *
	 * @param {LogEntry[]} entries entries to be applied
	 * @param {function} applyTopology callback invoked for processing included topology commands
	 * @returns {Promise} resolved when finished
	 */
	applyEntries( entries, applyTopology ) {
		if ( entries.length ) {
			debug( '%s: applying entries %j', this.id, entries );
		}

		let dbCommands = [];
		const topologyCommands = [];

		entries.forEach( command => {
			if ( command.type === 'join' || command.type === 'leave' ) {
				topologyCommands.push( command );
			} else {
				dbCommands.push( command );
			}
		} );

		if ( topologyCommands.length ) {
			applyTopology( topologyCommands );
		}

		dbCommands = dbCommands.reduce( ( acc, command ) => acc.concat( command ), [] );

		const batch = dbCommands
			.filter( entry => ALLOWED_TYPES.indexOf( entry.type ) >= 0 )
			.map( entry => Object.assign( entry, { prefix: this.state } ) );

		if ( batch.length ) {
			return new Promise( ( resolve, reject ) => {
				this.db.batch( batch, error => {
					if ( error ) {
						reject( error );
					} else {
						resolve();
					}
				} );
			} );
		}

		return Promise.resolve();
	}

	_getPersistBatch( node, done ) {
		this._getPersistLog( node, ( err, _batch ) => {
			if ( err ) {
				done( err );
			} else {
				done( null, _batch.concat( this._getPersistMeta( node ) ) );
			}
		} );
	}

	_getPersistMeta( node ) {
		return [
			{
				key: 'currentTerm',
				value: node.term,
				prefix: this.meta
			},
			{
				key: 'votedFor',
				value: node.votedFor,
				prefix: this.meta
			}
		];
	}

	_getPersistLog( node, _done ) {
		debug( '%s: persisting log', this.id );
		const done = Once( _done );
		const entries = node.log.entries;
		const byKey = entries.reduce( ( acc, entry ) => {
			const key = `${entry.t}:${entry.i}`;
			acc[key] = entry.c;
			return acc;
		}, {} );
		debug( '%s: log by key: %j', this.id, byKey );
		const removeKeys = [];
		this.log.createKeyStream()
			.on( 'data', key => {
				if ( !byKey.hasOwnProperty( key ) ) {
					// remove key not present in the log any more
					removeKeys.push( key );
				} else {
					// remove entries already in the database
					delete byKey[key];
				}
			} )
			.once( 'error', done )
			.once( 'end', () => {
				debug( '%s: will remove keys: %j', this.id, byKey );
				const operations =
					removeKeys.map( removeKey => {
						return {
							type: 'del',
							key: removeKey,
							prefix: this.log
						};
					} )
						.concat( Object.keys( byKey ).map( key => {
							return {
								type: 'put',
								key: key,
								value: byKey[key],
								prefix: this.log
							};
						} ) );

				done( null, operations );
			} );
	}

	_commandToBatch( command ) {
		return (Array.isArray( command ) ? command : [command])
			.map( this._transformCommand.bind( this ) );
	}

	_transformCommand( command ) {
		return Object.assign( {}, command, { prefix: this.state } );
	}
};

function fixLoadedEntry( entry ) {
	const keyParts = entry.key.split( ':' );
	const term = Number( keyParts[0] );
	const index = Number( keyParts[1] );
	return {
		i: index,
		t: term,
		c: entry.value
	};
}
