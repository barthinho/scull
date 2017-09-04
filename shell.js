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
const importantStateEvents = [
	'warning',
	'new state',
	'heartbeat timeout',
	'election timeout', // deprecated
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
	 *
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
		importantStateEvents.forEach( event => node.on( event, this.emit.bind( this, event ) ) );
	}


	// ------ Start and stop

	/**
	 * Starts current node by connecting to network and loading previously
	 * persisted state of node from its local database.
	 *
	 * @param {function(error:Error)} callback gets invoked on node having started
	 */
	start( callback ) {
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
					err => {
						Debug( '%s: done starting', id );

						if ( err ) {
							this._startState = 'stopped';
						} else {
							this._startState = 'started';
							this.emit( 'started' );
						}

						this.node.transition( 'follower' );

						callback( err );
					} );
				break;

			case 'started' :
				process.nextTick( callback );
				break;

			case 'starting' :
				this.once( 'started', callback );
				break;
		}
	}

	/**
	 * Disconnects current node from network
	 * @param cb
	 */
	stop( cb ) {
		this.node.stop();
		this.connections.stop();

		this._startState = 'stopped';

		if ( this._network ) {
			this.emit( 'finish', this._network );

			this._network = undefined;

			if ( this._implicitNetwork ) {
				this._implicitNetwork.active.end();
				this._implicitNetwork.passive.emit( 'finish' );

				if ( cb ) {
					return this._implicitNetwork.passive.once( 'closed', cb );
				}

				this._implicitNetwork = undefined;
			}
		}

		if ( cb ) {
			process.nextTick( cb );
		}
	}

	_startNetwork( cb ) {
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


		if ( cb ) {
			if ( network.passive.listening() ) {
				process.nextTick( cb );
			} else {
				network.passive.once( 'listening', () => { cb(); } );
			}
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

	_loadPersistedState( cb ) {
		this.db.load( ( err, results ) => {
			if ( err ) {
				cb( err );
			} else {
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

				cb();
			}
		} );
	}

	// ------ Topology

	join( address, done ) {
		Debug( '%s: joining %s', this.id, address );

		this.start( err => {
			if ( err ) {
				done( err );
			} else {
				this.node.join( address, done );
			}
		} );
	}

	leave( address, done ) {
		Debug( '%s: leaving %s', this.id, address );

		this.start( err => {
			if ( err ) {
				done( err );
			} else {
				this.node.leave( address, done );
			}
		} );
	}

	// ------ Commands

	command( command, options, callback ) {
		if ( typeof options === 'function' ) {
			callback = options;
			options = {};
		}

		if ( this.is( 'leader' ) ) {
			this.commandQueue.write( { command, options, callback } );
		} else {
			// not a leader: bypass queue and forward command to current leader
			this.node.command( command, options, callback );
		}
	}

	readConsensus( callback ) {
		this.node.readConsensus( callback );
	}

	/**
	 * Waits for consensus confirmed by majority of current nodes in cluster,
	 * but always demanding consensus from provided peers.
	 *
	 * @param {string|string[]} peers list of peers demanding consensus confirmation from explicitly
	 * @param {function(error:Error)} callback
	 */
	waitFor( peers, callback ) {
		if ( !Array.isArray( peers ) ) {
			peers = [peers];
		}

		this.node.waitFor( peers.map( peer => Address( peer ).toString() ), callback );
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

	peers( done ) {
		this.node.fetchPeers( this._network, done );
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
