"use strict";

const EventEmitter = require( "events" );

const Debug = require( "debug" );
const LevelUp = require( "levelup" );

const { deepMerge } = require( "./utils/object" );
const Address = require( "./data/address" );
const Node = require( "./node" );
const Database = require( "./db" );
const LevelDown = require( "./leveldown" );
const Iterator = require( "./iterator" );


const DebugLog = Debug( "scull:shell" );


const DEFAULT_OPTIONS = require( "./default-options" );

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
	 * @param {string|Address} id address of current node's listener (used for identification as well)
	 * @param {object<string,*>} options customization of node's behaviour
	 */
	constructor( id, options = {} ) {
		super();

		const _id = Address( id );
		const _options = Object.freeze( deepMerge( {}, DEFAULT_OPTIONS, options || {} ) );

		if ( !/^\s*(?:no?|0|off|false)\s*$/i.test( process.env.LOG_ERRORS ) ) {
			Debug.enable( "scull:error" );
		}

		DebugLog( "creating node %s with peers %j", _id, _options.peers );

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


		const db = new Database( _id, _options );
		const node = new Node( _id, db, _options );

		Object.defineProperties( this, {
			/**
			 * Refers to node's LevelDB instance.
			 *
			 * @property {Database} db
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
			term: { get: () => node.term },

			/**
			 * Enqueues commands to be executed by current node leading cluster.
			 *
			 * @name Shell#_commands
			 * @property {Array}
			 * @readonly
			 * @protected
			 */
			_commands: { value: [] },
		} );


		this._startState = "stopped";


		// propagate events of wrapped node
		IMPORTANT_NODE_EVENTS.forEach( event => node.on( event, ( ...args ) => this.emit( event, ...args ) ) );
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
		if ( !this._starting ) {
			if ( this._stopping ) {
				return this._stopping
					.then( () => this.start( waitForElectionPassed ) );
			}

			this._elected = new Promise( resolve => {
				this.node.once( "elected", resolve );
			} );

			this._starting = this.node.start()
				.then( () => new Promise( ( resolve, reject ) => {
					const id = this.id;

					DebugLog( "%s: start state is %s", id, this._startState );

					switch ( this._startState ) {
						case "stopped" :
							this._startState = "starting";

							DebugLog( "starting node %s", id );

							Promise.all( [
								this.node.network.start(),
								this.db.load()
									.then( results => {
										DebugLog( "%s: loaded state from persistent database: %j", this.id, results );

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
									} ),
							] )
								.then( () => {
									DebugLog( "%s: done starting", id );

									this.node.transition( "follower" );

									this._startState = "started";
									this.emit( "started" );
								}, error => {
									DebugLog( "%s: starting failed", id );

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
				} ) );
		}

		return waitForElectionPassed ? this._elected : this._starting;
	}

	/**
	 * Disconnects current node from network.
	 *
	 * @returns {Promise} resolved on node stopped
	 */
	stop() {
		if ( !this._stopping ) {
			DebugLog( "%s: stopping node", this.id );

			if ( !this._starting ) {
				return this.db.close();
			}

			this._stopping = this.node.stop()
				.then( () => this.db.close() )
				.then( () => {
					this._startState = "stopped";
					this._starting = this._elected = this._stopping = undefined;
				} );
		}

		return this._stopping;
	}

	/**
	 * Registers node at given address to be joining cluster.
	 *
	 * @param {Address|string} address address of node to join the cluster
	 * @returns {Promise} resolved when finished
	 */
	join( address ) {
		DebugLog( "%s: joining %s", this.id, address );

		return this.start().then( () => this.node.join( address ) );
	}

	/**
	 * Removes node at given address from list of peering nodes in cluster.
	 *
	 * @param {Address|string} address address of node to leave the cluster
	 * @returns {Promise} resolved when finished
	 */
	leave( address ) {
		DebugLog( "%s: leaving %s", this.id, address );

		return this.start().then( () => this.node.leave( address ) );
	}

	/**
	 * Perform arbitrary command in cluster.
	 *
	 * @param {AbstractCommand} command command to be executed
	 * @returns {Promise} resolved when finished
	 */
	command( command ) {
		return this.node.command( command );
	}

	/**
	 * Reads consensus from cluster, that is waiting for majority of cluster
	 * nodes to confirm leader's track on cluster's current state.
	 *
	 * @returns {Promise} resolved when finished
	 */
	seekConsensus() {
		return this.node.seekConsensus();
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

	/**
	 * Fetches LevelDOWN API for accessing state machine of cluster through this
	 * node.
	 *
	 * @returns {*} LevelDOWN API
	 */
	levelDown() {
		if ( !this._levelDown ) {
			this._levelDown = new LevelDown( this.node, options => new Iterator( this.node, this.db.state, options ) );
		}

		return this._levelDown;
	}

	/**
	 * Fetches LevelUP API for accessing state machine of cluster through this
	 * node.
	 *
	 * @param {object} options options
	 * @returns {*} LevelUP API
	 */
	levelUp( options ) {
		return new LevelUp( this.levelDown(), Object.assign( {}, {
			valueEncoding: "json"
		}, options ) );
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
}

Shell.Commands = require( "./commands" );

module.exports = Shell;
