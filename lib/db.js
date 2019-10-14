"use strict";

const { join } = require( "path" );

const Debug = require( "debug" )( "scull.db" );
const SubLevel = require( "level-sublevel" );
const ConcatStream = require( "concat-stream" );
const LevelDown = require( "leveldown" );
const LevelUp = require( "levelup" );

const Address = require( "./data/address" );

const ALLOWED_TYPES = [ "put", "del" ];


/**
 * @typedef {object} BatchEntry
 * @property {string} [type] type of action, one out of "get", "put" or "del"
 * @property {string} key key of record to write
 * @property {string} [value] value of record to write
 * @property {string} prefix
 */

/**
 * Implements database backend for persisting three kinds of information:
 *
 * * the cluster's current **state**
 * * **meta** information on current cluster's node and its peers
 * * current node's copy of the **log** all node's of cluster keep consenting about
 *
 * @type {DB}
 * @name DB
 * @property {Address} id ID of node this database is used for
 * @property {object} options
 * @property {SubLevel} db
 * @property {LevelUp} levelUp
 * @property {LevelDown} levelDown
 * @property {LevelUp} log API for accessing part of database persisting log file
 * @property {LevelUp} meta API for accessing part of database persisting meta information
 * @property {LevelUp} state API for accessing part of database cluster's state
 */
module.exports = class DB {
	/**
	 * @param {string|Address} id ID of node this database is used for
	 * @param {object} options options customizing database
	 */
	constructor( id, options ) {
		const address = Address( id );

		// qualify LevelDown database instance to use
		let levelDown;

		if ( options.db || options.database ) {
			levelDown = options.db || options.database;
		} else {
			if ( !options.location ) {
				throw new TypeError( "missing pathname of folder to contain file-based leveldown database" );
			}

			levelDown = LevelDown( join( options.location, address.toString().replace( /[/.]/g, "_" ) ) );
		}

		// create wrapped LevelUp interface
		const levelUp = LevelUp( levelDown );

		Object.defineProperties( this, {
			/**
			 * Exposes ID of node this database is used for.
			 *
			 * @name DB#id
			 * @property {Address}
			 * @readonly
			 */
			id: { value: address },
			db: { value: SubLevel( levelUp ) },
			levelUp: { value: levelUp },
			levelDown: { value: levelDown },
		} );

		Object.defineProperties( this, {
			log: {
				value: Object.assign( this.db.sublevel( "log" ), {
					toJSON: () => "log",
				} )
			},
			meta: {
				value: Object.assign( this.db.sublevel( "meta" ), {
					toJSON: () => "meta",
				} )
			},
			state: {
				value: Object.assign( this.db.sublevel( "state" ), {
					toJSON: () => "state",
					clear: () => new Promise( ( resolve, reject ) => {
						const batch = [];

						this.createKeyStream()
							.on( "error", error => reject( error ) )
							.on( "data", key => batch.push( { type: "del", key } ) )
							.on( "end", () => {
								this.batch( batch, error => {
									if ( error ) {
										reject( error );
									} else {
										resolve();
									}
								} );
							} );
					} ),
				} )
			},
		} );
	}

	/**
	 * Loads log file and meta information from database for being managed in
	 * runtime memory while node is running.
	 *
	 * @returns {Promise<{log:object, meta:object}>} promises current data loaded from DB backend
	 */
	load() {
		return Promise.all( [
			new Promise( ( resolve, reject ) => {
				const stream = this.log.createReadStream();

				stream.once( "error", reject );
				stream.pipe( ConcatStream( entries => {
					const numEntries = entries.length;
					const sorted = new Array( numEntries );

					for ( let read = 0; read < numEntries; read++ ) {
						const { key, value } = entries[read];
						const keyParts = key.split( ":" );

						const term = parseInt( keyParts[0] ) || 0;
						const index = parseInt( keyParts[1] ) || 0;

						sorted[read] = { t: term, i: index, c: value };
					}

					sorted.sort( ( left, right ) => {
						if ( left.t !== right.t ) {
							return left.t - right.t;
						}

						return left.i - right.i;
					} );

					resolve( sorted );
				} ) );
			} ),
			new Promise( ( resolve, reject ) => this.meta.get( "currentTerm", notFoundIsOk( resolve, reject ) ) ),
			new Promise( ( resolve, reject ) => this.meta.get( "votedFor", notFoundIsOk( resolve, reject ) ) ),
			new Promise( ( resolve, reject ) => this.meta.get( "peers", notFoundIsOk( resolve, reject ) ) ),
		] )
			.then( ( [ log, currentTerm, votedFor, peers ] ) => ( { log, meta: { currentTerm, votedFor, peers } } ) );

		/**
		 * Generates function suitable as callback on accessing database API
		 * invoking
		 *
		 * * `doneFn` with result `undefined` when selected key was not found
		 * * `failFn` with error provided by database on any other error
		 * * `doneFn` with value actually retrieved from database
		 *
		 * @param {function(result:(undefined|string))} doneFn callback invoked on success
		 * @param {function(error:Error)} failFn callback invoked on failure
		 * @returns {function} callback for handling results of asynchronous DB access
		 */
		function notFoundIsOk( doneFn, failFn ) {
			return function( error, result ) {
				if ( error && !error.message.match( /not found/i ) ) {
					failFn( error, result );
				} else {
					doneFn();
				}
			};
		}
	}

	/**
	 * Persists provided node's meta information and log to database.
	 *
	 * @param {Node} node controller of node to persist
	 * @returns {Promise} promises node's state persisted to database
	 */
	persist( node ) {
		return this._getPersistBatch( node );
	}

	/**
	 * Persists current log of cluster in database and performs requested
	 * command on cluster's state database afterwards or forwards topology
	 * commands to provided node.
	 *
	 * @param {Node} node reference on node providing log to persists and handling any topology command
	 * @param {object} command actual command to be performed
	 * @returns {Promise} promises DB commands processed
	 */
	command( node, command ) {
		return this._getPersistBatch( node )
			.then( batch => { // eslint-disable-line consistent-return
				if ( batch.length > 0 ) {
					Debug( "%s: applying batch: %j", this.id, batch );

					return new Promise( ( resolve, reject ) => {
						this.db.batch( batch, batchError => {
							if ( batchError ) {
								Debug( "%s: applied batch command err = %j", this.id, batchError );
								reject( batchError );
								return;
							}

							Debug( "%s: applied batch", this.id );

							resolve();
						} );
					} );
				}
			} )
			.then( () => { // eslint-disable-line consistent-return
				switch ( command.type ) {
					case "get" :
						return new Promise( ( resolve, reject ) => {
							this.state.get( command.key, ( getError, result ) => {
								if ( getError ) {
									reject( getError );
								} else {
									resolve( result );
								}
							} );
						} );

					case "join" :
					case "leave" :
						node.applyTopologyCommand( command );
						break;
				}
			} );
	}

	/**
	 * Applies some given log entries to database.
	 *
	 * Entries describing commands regarding cluster topology are separated from
	 * those with commands affecting current state of cluster as a database.
	 * Topology commands are then forwarded to provided callback for separate
	 * processing while state-related commands are applied to state database
	 * internally.
	 *
	 * @param {LogEntry[]} entries entries to be applied
	 * @param {function} applyTopology callback invoked for processing included topology commands
	 * @returns {Promise} resolved when finished
	 */
	applyEntries( entries, applyTopology ) {
		if ( entries.length ) {
			Debug( "%s: applying entries %j", this.id, entries );

			let dbCommands = [];
			const topologyCommands = [];

			entries.forEach( command => {
				switch ( command.type ) {
					case "join" :
					case "leave" :
						topologyCommands.push( command );
						break;

					default :
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
						dbCommands.push( batch.length );
						if ( error ) {
							reject( error );
						} else {
							resolve();
						}
					} );
				} );
			}
		}

		return Promise.resolve();
	}

	/**
	 * Creates batch for writing log file and meta information of provided node
	 * to database.
	 *
	 * @param {Node} node controller of cluster node
	 * @returns {Promise<array>} promises batch
	 * @private
	 */
	_getPersistBatch( node ) {
		return this._getPersistLog( node, this._getPersistMeta( node ) );
	}

	/**
	 * Generates batch of actions for persisting meta information on provided
	 * node.
	 *
	 * @param {Node} node controller of node
	 * @returns {BatchEntry[]} batch of entries to be written to database
	 * @private
	 */
	_getPersistMeta( node ) {
		return [
			{
				key: "currentTerm",
				value: node.term,
				prefix: this.meta
			},
			{
				key: "votedFor",
				value: node.votedFor,
				prefix: this.meta
			}
		];
	}

	/**
	 * Creates batch for adjusting persisted log entries to match current
	 * volatile log of provided node.
	 *
	 * @note This adjustment involves writing entries as well as deleting some.
	 *
	 * @param {Node} node controller of node
	 * @param {BatchEntry[]} metaBatch batch of actions related to persisting meta information to be incorporated into batch resulting here
	 * @returns {Promise<array>} promises batch of entries to be written to log database
	 * @private
	 */
	_getPersistLog( node, metaBatch ) {
		return new Promise( ( resolve, reject ) => {
			const logEntries = node.log.entries;

			Debug( "%s: persisting up to %d log entries", this.id, logEntries.length );

			// convert ordered list of log entries into unordered object with
			// key-value pairs suitable for writing to database
			const byKey = logEntries.reduce( ( acc, entry ) => {
				const key = `${entry.t}:${entry.i}`;
				acc[key] = entry.c;
				return acc;
			}, {} );


			// read existing log entries from database to find all those
			// * not in volatile log anymore to remove them from database either
			// * written to database before to be skipped this time
			const removeKeys = [];

			this.log.createKeyStream()
				.on( "data", key => {
					if ( byKey.hasOwnProperty( key ) ) {
						// don't batch entries written to database before
						delete byKey[key];
					} else {
						// key vanished in volatile log -> remove from database, too
						removeKeys.push( key );
					}
				} )
				.once( "error", reject )
				.once( "end", () => {
					const writeKeys = Object.keys( byKey );

					Debug( "%s: removing %d persisted log entries: %j", this.id, removeKeys.length, removeKeys );
					Debug( "%s: writing %d persisted log entries: %j", this.id, writeKeys.length, writeKeys );

					// create resulting batch of sufficient size
					const length = writeKeys.length + removeKeys.length + metaBatch.length;
					const batch = new Array( length );

					let write = 0;

					// describe actions for writing keys
					for ( let i = 0, l = writeKeys.length; i < l; i++ ) {
						const key = writeKeys[i];

						batch[write++] = {
							type: "put",
							key: key,
							value: byKey[key],
							prefix: this.log
						};
					}

					// describe actions for removing keys
					for ( let i = 0, l = removeKeys.length; i < l; i++ ) {
						batch[write++] = {
							type: "del",
							key: removeKeys[i],
							prefix: this.log
						};
					}

					// append actions as given for managing meta information
					for ( let i = 0, l = metaBatch.length; i < l; i++ ) {
						batch[write++] = metaBatch[i];
					}

					resolve( batch );
				} );
		} );
	}

	/**
	 * Converts list of commands into batch of entries to be written to database.
	 *
	 * @param {object|object[]} command one or more commands to be written
	 * @returns {object[]} batch of entries ready for writing to database
	 * @protected
	 */
	_commandToBatch( command ) {
		const source = Array.isArray( command ) ? command : [ command ];
		const numEntries = source.length;
		const prefixed = new Array( numEntries );

		for ( let i = 0; i < numEntries; i++ ) {
			prefixed[i] = Object.assign( {}, source[i], { prefix: this.state } );
		}

		return prefixed;
	}
};
