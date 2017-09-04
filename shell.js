'use strict';

const EventEmitter = require( 'events' );

const Debug = require( 'debug' )( 'skiff.shell' );
const Merge = require( 'deepmerge' );
const Async = require( 'async' );
const Levelup = require( 'levelup' );

const Connections = require( './lib/data/connections' );
const Address = require( './lib/data/address' );
const Network = require( './lib/network' );
const IncomingDispatcher = require( './lib/incoming-dispatcher' );
const Node = require( './lib/node' );
const CommandQueue = require( './lib/command-queue' );
const Commands = require( './lib/commands' );
const DB = require( './lib/db' );
const Leveldown = require( './lib/leveldown' );
const Iterator = require( './lib/iterator' );

const defaultOptions = require( './lib/default-options' );

/**
 * Lists names of events of wrapped node controller to be forwarded and exposed
 * as events of shell instance for public use.
 *
 * @type {string[]}
 */
const importantNodeEvents = [
	'warning',
	'new state',
	'heartbeat timeout',
	'leader',
	'rpc latency',
	'joined',
	'left',
	'electing',
	'elected',
	'new leader',
	'up-to-date',
];


/**
 * Implements shell exposing public API of skiff as a module.
 *
 * @type {Shell}
 * @name Shell
 * @property {Address} id
 * @property {object<string,*>} options
 * @property {DB} db
 * @property {Dispatcher} dispatcher
 * @property {Node} node
 * @property {Connections} connections
 * @property {CommandQueue} commandQueue
 * @property {Commands} commands
 */
class Shell extends EventEmitter {
	/**
	 * @param {string|Address} id unique ID a.k.a. network address of node
	 * @param {object<string,*>} options
	 */
	constructor( id, options = {} ) {
		super();

		id = Address( id );
		options = Object.freeze( Merge( defaultOptions, options || {} ) );

		Debug( 'creating node %s with peers %j', id, options.peers );

		Object.defineProperties( this, {
			id: { value: id },
			options: { value: options },
		} );

		const db = new DB( options.location, id, options.db, options.levelup );
		const dispatcher = new IncomingDispatcher( { id } );
		const connections = new Connections( this, options.peers );
		const node = new Node( id, connections, dispatcher, db, this.peers.bind( this ), options );
		const commandQueue = new CommandQueue();
		const commands = new Commands( id, commandQueue, node );

		Object.defineProperties( this, {
			db: { value: db },
			dispatcher: { value: dispatcher },
			node: { value: node },
			connections: { value: connections },
			commandQueue: { value: commandQueue },
			commands: { value: commands },
		} );


		this._implicitNetwork = false;
		this._startState = 'stopped';


		// keep tracking stats on current node
		const stats = this._stats = {
			messagesReceived: 0,
			messagesSent: 0,
			rpcSent: 0,
			rpcReceived: 0,
			rpcReceivedByType: {
				'AppendEntries': 0,
				'RequestVote': 0,
				'InstallSnapshot': 0
			},
			rpcSentByType: {
				'AppendEntries': 0,
				'RequestVote': 0,
				'InstallSnapshot': 0
			}
		};

		node.on( 'message received', () => stats.messagesReceived++ );
		node.on( 'message sent', () => stats.messagesSent++ );
		node.on( 'rpc sent', type => {
			stats.rpcSent++;
			stats.rpcSentByType[type]++;
		} );
		node.on( 'rpc received', type => {
			stats.rpcReceived++;
			stats.rpcReceivedByType[type]++;
		} );


		// propagate events of wrapped instanceof Node
		importantNodeEvents.forEach( event => node.on( event, this.emit.bind( this, event ) ) );
	}


	// ------ Start and stop

	/**
	 * Starts current node by connecting to network and loading previously
	 * persisted state of node from its local database.
	 *
	 * @param {function(error:?Error=)} callback gets invoked on node having started
	 * @returns {Promise} resolved on node started (returned on omitting callback)
	 */
	start( callback = null ) {
		const promise = new Promise( ( resolve, reject ) => {
			const id = this.id;

			Debug( '%s: start state is %s', id, this._startState );

			switch ( this._startState ) {
				case 'stopped' :
					this._startState = 'starting';

					Debug( 'starting node %s', id );
					Async.parallel(
						[
							this._startNetwork.bind( this ),
							this._loadPersistedState.bind( this )
						],
						error => {
							Debug( '%s: done starting', id );

							this.node.transition( 'follower' );

							if ( error ) {
								this._startState = 'stopped';
								reject( error );
							} else {
								this._startState = 'started';
								this.emit( 'started' );
								resolve();
							}
						} );
					break;

				case 'started' :
					resolve();
					break;

				case 'starting' :
					this.once( 'started', resolve );
					break;
			}
		} );

		if ( callback ) {
			promise.then( () => callback(), callback );
		} else {
			return promise;
		}
	}

	/**
	 * Disconnects current node from network.
	 *
	 * @param {function(error:?Error=)} callback gets invoked on node having stopped
	 * @returns {Promise} resolved on node stopped (returned on omitting callback)
	 */
	stop( callback = null ) {
		const promise = new Promise( resolve => {
			this.node.stop();
			this.connections.stop();

			this._startState = 'stopped';

			if ( this._network ) {
				this.emit( 'finish', this._network );

				this._network = undefined;

				if ( this._implicitNetwork ) {
					this._implicitNetwork.active.end();
					this._implicitNetwork.passive.emit( 'finish' );

					this._implicitNetwork.passive.once( 'closed', resolve );

					this._implicitNetwork = undefined;

					return;
				}
			}

			resolve();
		} );

		if ( callback ) {
			promise.then( () => callback(), callback );
		} else {
			return promise;
		}
	}

	/**
	 * Disconnects current node from network.
	 *
	 * @param {function(error:?Error=)} callback gets invoked on network having started
	 * @returns {Promise} resolved on network started (returned on omitting callback)
	 */
	_startNetwork( callback = null ) {
		const promise = new Promise( resolve => {
			const network = this._getNetworkConstructors();
			const node = this.node;

			const server = network.passive.node( this.id );
			const client = network.active.node( this.id );

			this._network = { active: client, passive: server };

			// pipe all incoming messages into dispatcher bound to wrapped node
			// - on receiving requests
			server.pipe( this.dispatcher, { end: false } );
			// - on receiving responses
			client.pipe( this.dispatcher, { end: false } );

			// pipe output streams of wrapped node into network sockets for actual
			// transmission
			node.requestOut.pipe( client, { end: false } );
			node.responseOut.pipe( server, { end: false } );


			// expose connection state events on client-side socket
			const _boundConnect = this.emit.bind( this, 'connect' );
			const _boundDisconnect = this.emit.bind( this, 'disconnect' );

			client.on( 'connect', _boundConnect );
			client.on( 'disconnect', _boundDisconnect );

			this.once( 'finish', network => {
				network.active.removeListener( 'connect', _boundConnect );
				network.active.removeListener( 'disconnect', _boundDisconnect );
			} );


			if ( network.passive.listening() ) {
				process.nextTick( resolve );
			} else {
				network.passive.once( 'listening', () => { resolve(); } );
			}
		} );

		if ( callback ) {
			promise.then( callback, callback );
		} else {
			return promise;
		}
	}

	_getNetworkConstructors() {
		const address = this.id.nodeAddress();

		let network = this.options.network;
		if ( !network ) {
			this._implicitNetwork = network = Network( {
				passive: {
					server: Merge( {
						port: address.port,
						host: address.address
					}, this.options.server )
				}
			} );
		}

		return network;
	}

	/**
	 * @param {function(error:?Error=)} callback gets invoked on having loaded persisted state
	 * @returns {Promise} resolved on persisted state loaded into node (returned on omitting callback)
	 * @protected
	 */
	_loadPersistedState( callback = null ) {
		const promise = this.db.load()
			.then( results => {
				this.node.log.restart( results.log );

				if ( results.meta.currentTerm ) {
					this.node.term = results.meta.currentTerm;
				}

				if ( results.meta.votedFor ) {
					this.node.votedFor = results.meta.votedFor;
				}

				if ( results.meta.peers ) {
					this.node.peers = results.meta.peers;
				}
			} );

		if ( callback ) {
			promise.then( () => callback(), callback );
		} else {
			return promise;
		}
	}

	// ------ Topology

	/**
	 * Registers node at given address to be joining cluster.
	 *
	 * @param {Address|string} address address of node to join the cluster
	 * @param {function(error:?Error=)} done gets invoked on error or on success
	 * @returns {Promise} resolved when finished (returned on omitting callback)
	 */
	join( address, done = null ) {
		Debug( '%s: joining %s', this.id, address );

		const promise = this.start()
			.then( () => this.node.join( address ) );

		if ( done ) {
			promise.then( done, done );
		} else {
			return promise;
		}
	}

	/**
	 * Removes node at given address from list of peering nodes in cluster.
	 *
	 * @param {Address|string} address address of node to leave the cluster
	 * @param {function(error:?Error=)} done gets invoked on error or on success
	 * @returns {Promise} resolved when finished (returned on omitting callback)
	 */
	leave( address, done = null ) {
		Debug( '%s: leaving %s', this.id, address );

		const promise = this.start()
			.then( () => this.node.leave( address ) );

		if ( done ) {
			promise.then( done, done );
		} else {
			return promise;
		}
	}

	// ------ Commands

	/**
	 * Removes node at given address from list of peering nodes in cluster.
	 *
	 * @param {object} command command to execute
	 * @param {object<string,*>} options options for executing command
	 * @param {function(error:?Error=)} callback gets invoked on error or on success
	 * @returns {Promise} resolved when finished (returned on omitting callback)
	 */
	command( command, options = {}, callback = null ) {
		if ( typeof options === 'function' ) {
			callback = options;
			options = {};
		}

		let promise;

		if ( this.is( 'leader' ) ) {
			promise = new Promise( ( resolve, reject ) => {
				this.commandQueue.write( { command, options, callback: ( error, result ) => {
					if ( error ) {
						reject( error );
					} else {
						resolve( result );
					}
				} } );
			} );
		} else {
			// not a leader: bypass queue and forward command to current leader
			promise = this.node.command( command, options );
		}

		if ( callback ) {
			promise.then( callback, callback );
		} else {
			return promise;
		}
	}

	/**
	 * Reads consensus from cluster, that is waiting for majority of cluster
	 * nodes to confirm leader's track on cluster's current state.
	 *
	 * @param {function(error:?Error=)} callback gets invoked on error or on success
	 * @returns {Promise} resolved when finished (returned on omitting callback)
	 */
	readConsensus( callback = null ) {
		const promise = this.node.readConsensus();

		if ( callback ) {
			promise.then( callback, callback );
		} else {
			return promise;
		}
	}

	/**
	 * Waits for consensus confirmed by majority of current nodes in cluster,
	 * but always demanding consensus from provided peers.
	 *
	 * @param {string|string[]} peers list of peers demanding consensus confirmation from explicitly
	 * @param {function(error:?Error=)} callback gets invoked on error or on success
	 * @returns {Promise} resolved when finished (returned on omitting callback)
	 */
	waitFor( peers, callback = null ) {
		if ( !Array.isArray( peers ) ) {
			peers = [peers];
		}

		const promise = this.node.waitFor( peers.map( peer => Address( peer ).toString() ) );

		if ( callback ) {
			promise.then( callback, callback );
		} else {
			return promise;
		}
	}

	// ------- State

	is( state ) {
		return this.node.is( state );
	}

	weaken( duration ) {
		this.node.weaken( duration );
	}

	// -------- Level*

	leveldown() {
		return new Leveldown( this );
	}

	levelup( options ) {
		return Levelup( this.id, Object.assign( {}, {
			db: this.leveldown.bind( this ),
			valueEncoding: 'json'
		}, options ) );
	}

	iterator( options ) {
		return new Iterator( this, this.db.state, options );
	}


	// -------- Stats

	stats() {
		return this._stats;
	}

	/**
	 * Fetches list of peers in cluster including statistical information on
	 * every peer from current leader node.
	 *
	 * @param {function(error:?Error=, peers:Array=)} done gets invoked on error or on success
	 * @returns {Promise<Array>} resolved with list of peers (returned on omitting callback)
	 */
	peers( done = null ) {
		const promise = this.node.fetchPeers( this._network );

		if ( done ) {
			promise.then( done, done );
		} else {
			return promise;
		}
	}

	term() {
		return this.node.term;
	}

	logEntries() {
		return this.node.log.entries;
	}
}

module.exports = function createNodeShell( id, options = {} ) {
	return new Shell( id, options );
};

module.exports.createNetwork = function createNetwork( options = {} ) {
	return Network( options );
};
