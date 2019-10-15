"use strict";

const EventEmitter = require( "events" );

const Debug = require( "debug" )( "scull:shell" );
const LevelUp = require( "levelup" );

const { deepMerge } = require( "./lib/utils/object" );
const Address = require( "./lib/data/address" );
const Network = require( "./lib/network" );
const Node = require( "./lib/node" );
const Commands = require( "./lib/commands" );
const DB = require( "./lib/db" );
const LevelDown = require( "./lib/leveldown" );
const Iterator = require( "./lib/iterator" );


const DEFAULT_OPTIONS = require( "./lib/default-options" );

/**
 * Lists names of events of wrapped node controller to be forwarded and exposed
 * as events of shell instance for public use.
 *
 * @type {string[]}
 */
const IMPORTANT_NODE_EVENTS = [
	"warning",
	"new state",
	"heartbeat timeout",
	"leader",
	"rpc latency",
	"joined",
	"left",
	"electing",
	"elected",
	"new leader",
	"up-to-date"
];


/**
 * Implements shell exposing public API for controlling single node in cluster.
 *
 * @name Shell
 * @extends EventEmitter
 */
class Shell extends EventEmitter {
	/**
	 * @param {string|Address} id unique ID a.k.a. network address of node
	 * @param {object<string,*>} options options
	 */
	constructor( id, options = {} ) {
		super();

		const _id = Address( id );
		const _options = Object.freeze( deepMerge( {}, DEFAULT_OPTIONS, options || {} ) );

		Debug( "creating node %s with peers %j", _id, _options.peers );

		Object.defineProperties( this, {
			/**
			 * Provides address of node uniquely identifying it.
			 *
			 * @property {Address} id
			 * @readonly
			 */
			id: { value: _id },

			/**
			 * Describes node's customizations.
			 *
			 * @property {object<string,*>} options
			 * @readonly
			 */
			options: { value: _options }
		} );


		const db = new DB( _id, _options );
		const node = new Node( _id, db, _options );
		const commands = new Commands( node );

		Object.defineProperties( this, {
			/**
			 * Refers to node's LevelDB instance.
			 *
			 * @property {DB} db
			 * @readonly
			 */
			db: { value: db },

			/**
			 * Exposes reference on managed node itself.
			 *
			 * @property {Node} node
			 * @readonly
			 */
			node: { value: node },

			/**
			 * @property {Connections} connections
			 * @readonly
			 */
			connections: { value: node.connections },

			/**
			 * Manages writable queue of pending commands.
			 *
			 * @property {CommandQueue} commandQueue
			 * @readonly
			 */
			commandQueue: { value: commands.queue },

			/**
			 * @property {Commands} commands
			 * @readonly
			 */
			commands: { value: commands },

			/**
			 * Exposes current term of node.
			 *
			 * The node's term is an essential information in raft consensus
			 * protocol indicating what era of succeeding leaderships this node
			 * expects to be in. If any node in cluster is indicating a later
			 * era by using a higher term value this node is considering itself
			 * outdated.
			 *
			 * @property {int} term
			 * @readonly
			 */
			term: { get: () => node.term }
		} );


		this._implicitNetwork = false;
		this._startState = "stopped";


		// propagate events of wrapped instanceof Node
		IMPORTANT_NODE_EVENTS.forEach( event => node.on( event, this.emit.bind( this, event ) ) );
	}


	// ------ Start and stop

	/**
	 * Starts current node by connecting to network and loading previously
	 * persisted state of node from its local database.
	 *
	 * @param {Boolean} waitForElectionPassed set true to delay returned promise until leader election has passed in addition
	 * @returns {Promise} resolved on node started
	 */
	start( waitForElectionPassed = false ) {
		if ( !this._started ) {
			if ( this._stopping ) {
				throw new Error( "must not start while stopping node" );
			}

			this._elected = new Promise( resolve => {
				this.node.once( "elected", () => resolve() );
			} );

			this._started = new Promise( ( resolve, reject ) => {
				const id = this.id;

				Debug( "%s: start state is %s", id, this._startState );

				switch ( this._startState ) {
					case "stopped" :
						this._startState = "starting";

						Debug( "starting node %s", id );

						Promise.all( [
							this._startNetwork(),
							this._loadPersistedState()
						] )
							.then( () => {
								Debug( "%s: done starting", id );

								this.node.transition( "follower" );

								this._startState = "started";
								this.emit( "started" );
							}, error => {
								Debug( "%s: starting failed", id );

								this.node.transition( "follower" );

								this._startState = "stopped";

								throw error;
							} )
							.then( resolve )
							.catch( reject );
						break;

					case "started" :
						resolve();
						break;

					case "starting" :
						this.once( "started", () => resolve() );
						break;
				}
			} );
		}

		return waitForElectionPassed ? this._elected : this._started;
	}

	/**
	 * Disconnects current node from network.
	 *
	 * @returns {Promise} resolved on node stopped
	 */
	stop() {
		if ( !this._stopping ) {
			Debug( "%s: stopping node", this.id );

			if ( !this._started ) {
				return Promise.resolve();
			}

			this._stopping = new Promise( ( resolve, reject ) => {
				this.node.stop();
				this.connections.stop();

				this._startState = "stopped";

				if ( this._network ) {
					this.emit( "finish", this._network );

					this._network = undefined;

					const { _implicitNetwork } = this;
					if ( _implicitNetwork ) {
						const { transmitting, receiving } = _implicitNetwork;

						this._implicitNetwork = undefined;

						transmitting.end();
						receiving.end();

						receiving.server.onStopped.then( resolve ).catch( reject );
						return;
					}
				}

				resolve();
			} )
				.then( () => {
					this._started = this._elected = this._stopping = undefined;
				} );
		}

		return this._stopping;
	}

	/**
	 * Integrates controlled node with network.
	 *
	 * @returns {Promise} resolved on network integration has finished
	 */
	_startNetwork() {
		return new Promise( resolve => {
			const address = this.id.toSocketOptions();

			let network = this.options.network;
			if ( network ) {
				if ( !network.isPrepared() ) {
					throw new TypeError( "provided network is not prepared" );
				}
			} else {
				this._implicitNetwork = network = Network.createNetwork( this.id, {
					receiving: {
						server: deepMerge( {}, address, this.options.server ),
					}
				} );
			}


			const { receiving, transmitting } = network;
			const { node } = this;

			receiving.assignNodes( node.peers );
			transmitting.assignNodes( node.peers );

			const server = receiving.node( this.id );
			const client = transmitting.node( this.id );

			this._network = { transmitting, receiving };

			// pipe all incoming messages into dispatcher bound to wrapped node
			// - on receiving requests
			server.pipe( this.node.requestDispatcher, { end: false } );
			// - on receiving responses
			client.pipe( this.node.replyDispatcher, { end: false } );

			// pipe output streams of wrapped node into network sockets for actual
			// transmission
			node.requestOut.pipe( transmitting, { end: false } );
			node.responseOut.pipe( server, { end: false } );


			// expose connection state events on client-side socket
			const _boundConnect = this.emit.bind( this, "connect" );
			const _boundDisconnect = this.emit.bind( this, "disconnect" );

			transmitting.on( "connect", _boundConnect );
			transmitting.on( "disconnect", _boundDisconnect );

			this.once( "finish", () => {
				transmitting.removeListener( "connect", _boundConnect );
				transmitting.removeListener( "disconnect", _boundDisconnect );
			} );


			if ( network.receiving.isListening ) {
				resolve( network );
			} else {
				network.receiving.once( "listening", () => resolve( network ) );
			}
		} )
			.then( network => {
				this.node.emit( "network attached", network );
			} );
	}

	/**
	 * @returns {Promise} resolved on persisted state loaded into node
	 * @protected
	 */
	_loadPersistedState() {
		return this.db.load()
			.then( results => {
				Debug( "%s: loaded state from persistent database: %j", this.id, results );

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
	}

	// ------ Topology

	/**
	 * Registers node at given address to be joining cluster.
	 *
	 * @param {Address|string} address address of node to join the cluster
	 * @returns {Promise} resolved when finished
	 */
	join( address ) {
		Debug( "%s: joining %s", this.id, address );

		return this.start().then( () => this.node.join( address ) );
	}

	/**
	 * Removes node at given address from list of peering nodes in cluster.
	 *
	 * @param {Address|string} address address of node to leave the cluster
	 * @returns {Promise} resolved when finished
	 */
	leave( address ) {
		Debug( "%s: leaving %s", this.id, address );

		return this.start().then( () => this.node.leave( address ) );
	}

	// ------ Commands

	/**
	 * Perform arbitrary command in cluster.
	 *
	 * @param {object} command command to execute
	 * @param {object<string,*>} options options for executing command
	 * @returns {Promise} resolved when finished
	 */
	command( command, options = {} ) {
		if ( this.is( "leader" ) ) {
			return new Promise( ( resolve, reject ) => {
				this.commandQueue.write( {
					command, options, callback: ( error, result ) => {
						if ( error ) {
							reject( error );
						} else {
							resolve( result );
						}
					}
				} );
			} );
		}

		// not a leader: bypass queue and forward command to current leader
		return this.node.command( command, options );
	}

	/**
	 * Reads consensus from cluster, that is waiting for majority of cluster
	 * nodes to confirm leader's track on cluster's current state.
	 *
	 * @returns {Promise} resolved when finished
	 */
	readConsensus() {
		return this.node.readConsensus();
	}

	/**
	 * Waits for consensus confirmed by majority of current nodes in cluster,
	 * but always demanding consensus from provided peers.
	 *
	 * @param {string|string[]} peers list of peers demanding consensus confirmation from explicitly
	 * @returns {Promise} resolved when finished
	 */
	waitFor( peers ) {
		return this.node.waitFor( Array.isArray( peers ) ? peers : [peers] );
	}

	// ------- State

	/**
	 * Detects if current node is in selected state.
	 *
	 * @param {string} state one out of "leader", "follower", "candidate" or "weakened"
	 * @returns {boolean} indicates if node is in selected state currently
	 */
	is( state ) {
		return this.node.is( state );
	}

	/**
	 * Weakens node for duration given in milliseconds.
	 *
	 * @param {number} duration number of milliseconds to weaken node for
	 * @returns {void}
	 */
	weaken( duration ) {
		this.node.weaken( duration );
	}

	// -------- Level*

	/**
	 * Fetches LevelDOWN API for accessing state machine of cluster through this
	 * node.
	 *
	 * @returns {*} LevelDOWN API
	 */
	levelDown() {
		return new LevelDown( this.node, options => new Iterator( this, this.db.state, options ) );
	}

	/**
	 * Fetches LevelUP API for accessing state machine of cluster through this
	 * node.
	 *
	 * @param {object} options options
	 * @returns {*} LevelUP API
	 */
	levelUp( options ) {
		return LevelUp( this.id, Object.assign( {}, {
			db: () => this.levelDown(),
			valueEncoding: "json"
		}, options ) );
	}


	// -------- Stats

	/**
	 * Fetches statistical information on current node's network activities.
	 *
	 * @returns {NodeStats} provides counters regarding current node's activity
	 */
	stats() {
		return this.node.stats;
	}

	/**
	 * Fetches list of peers in cluster including statistical information on
	 * every peer from current leader node.
	 *
	 * @returns {Promise<Array>} resolved with list of peers
	 */
	peers() {
		return this.node.fetchPeers();
	}

	/**
	 * Fetches current entries of this node's backlog of actions to control
	 * cluster's state.
	 *
	 * @returns {LogEntry[]} lists recent log entries of local node
	 */
	logEntries() {
		return this.node.log.entries;
	}
}

/**
 * Creates manager for controlling single node of raft consensus cluster.
 *
 * @param {string|Address} id node's address (serving as its ID, too)
 * @param {object} options customizing options
 * @returns {Shell} created manager instance
 */
module.exports = function createNodeShell( id, options = {} ) {
	return new Shell( id, options );
};

module.exports.Shell = Shell;
module.exports.createNetwork = Network.createNetwork;
