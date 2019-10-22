"use strict";

const EventEmitter = require( "events" );
const Utility = require( "util" );

const Debug = require( "debug" );

const Nodes = require( "./data/nodes" );
const Address = require( "./data/address" );
const States = require( "./states" );
const Log = require( "./log" );
const { RPCNetwork } = require( "./rpc/network" );
const AbstractCommand = require( "./commands/abstract" );
const NodeCommands = require( "./commands" );


const importantStateEvents = ["heartbeat timeout"];

const ErrorLog = Debug( "scull:error" );
const DebugLog = Debug( "scull:node:debug" );
const ConsensusLog = Debug( "scull:consensus" );
const CommandLog = Debug( "scull:command" );


/**
 * @typedef {object} NodeInformation
 * @property {string} id unique ID/address of node in cluster
 * @property {boolean} leader true if node is cluster's leader currently
 * @property {?boolean} connected true if node is currently connected to leader
 */

/**
 * Implements single node in cluster.
 *
 * @name Node
 * @extends EventEmitter
 * @property {?NodeState} _state implementation of node's current state-specific behaviour
 * @property {?string} _stateName name of current state of node
 */
class Node extends EventEmitter {
	/**
	 * @param {Address|string} id network address of node serving as ID as well
	 * @param {Database} db reference on database containing persistent log and state of node
	 * @param {object} options options customizing behaviour of node
	 */
	constructor( id, db, options ) {
		super();

		let term = 0;
		let votedFor = null;

		const peers = new Nodes( ( options || {} ).peers || [], id )
			.on( "added", address => {
				this._state.updatePeers( peers, { add: address } );
				this.emit( "joined", address );
			} )
			.on( "removed", address => {
				this._state.updatePeers( peers, { remove: address } );
				this.emit( "left", address );
			} );


		Object.defineProperties( this, {
			/**
			 * Uniquely identifies current node (using its network address).
			 *
			 * @name Node#id
			 * @property {Address}
			 * @readonly
			 */
			id: { value: id },

			/**
			 * Provides options used to customize current node.
			 *
			 * @name Node#options
			 * @property {object<string,*>}
			 * @readonly
			 */
			options: { value: Object.freeze( options || {} ) },
		} );

		Object.defineProperties( this, {
			/**
			 * Provides database connection of current node.
			 *
			 * @name Node#db
			 * @property {Database}
			 * @readonly
			 */
			db: { value: db },

			/**
			 * Refers to log manager of current node.
			 *
			 * @name Node#log
			 * @property {Log}
			 * @readonly
			 */
			log: { value: new Log( this, options ) },

			/**
			 * Selects current term of this node.
			 *
			 * @name Node#term
			 * @property {int}
			 */
			term: {
				get: () => term,
				set: value => {
					if ( typeof value !== "number" ) {
						throw new TypeError( `term needs to be a number and was ${value}` );
					}

					if ( value < term ) {
						throw new TypeError( `reducing term rejected` );
					}

					if ( value > term ) {
						votedFor = null;
						term = value;
					}
				}
			},

			/**
			 * Provides address of peer node this node has voted for in leader
			 * election of current term.
			 *
			 * @name Node#votedFor
			 * @property {?Address}
			 */
			votedFor: {
				get: () => votedFor,
				set: peer => {
					if ( !peer ) {
						throw new TypeError( "resetting vote for leader w/o switching term rejected" );
					}

					if ( votedFor ) {
						throw new TypeError( "switching vote for leader w/o switching term rejected" );
					}

					ConsensusLog( `${id}: setting voted for to ${peer}` );
					votedFor = Address( peer );
				}
			},

			/**
			 * Provides addresses of currently known peer nodes.
			 *
			 * @note By assigning list of addresses here internal managers are
			 *       updated implicitly.
			 *
			 * @name Node#peers
			 * @property {Nodes}
			 * @readonly
			 */
			peers: { value: peers },

			/**
			 * Refers to network this node is attached to.
			 *
			 * @name Node#_network
			 * @property {RPCNetwork}
			 * @readonly
			 * @protected
			 */
			network: { value: new RPCNetwork( id, options ) },
		} );


		this._starting = null;
		this._stopping = null;
		this._electing = false;
		this._pristine = true;
		this._leaderId = undefined;

		this._stateName = null;
		this._state = null;

		this._handlingRequest = null;
		this._weakUntil = Date.now();

		this._leaving = [];
		this._commandQueue = [];


		DebugLog( `id: ${this.id.toString()}` );
		DebugLog( `peers: ${this.peers}` );
	}

	/**
	 * Starts node by establishing its network integration and enabling its
	 * listener for incoming requests.
	 *
	 * @returns {Promise<Node>} promises current node started
	 */
	start() {
		if ( !this._starting ) {
			if ( this._stopping ) {
				return Promise.reject( new Error( "no support for restarting stopped node" ) );
			}

			this._starting = this.network.start()
				.then( network => {
					network.receiver.on( "rpc", ( peer, action, params, doneFn ) => {
						if ( this._stopping ) {
							doneFn( new Error( "node has been stopped" ) );
						} else {
							const promise = this.updateOnRequest( peer, action, params );
							if ( promise instanceof Promise ) {
								promise
									.then( result => doneFn( null, result ) )
									.catch( doneFn );
							} else {
								this.handleRequest( peer, action, params )
									.then( result => doneFn( null, result ) )
									.catch( error => {
										ErrorLog( `${this.id}: request from ${peer} for "${action}" with %j: ${error.message}`, params );

										doneFn( error );
									} );
							}
						}
					} );

					return this;
				} )
				.catch( error => {
					ErrorLog( `${this.id}: setting up network failed: ${error.message}` );
				} );
		}

		return this._starting;
	}

	/**
	 * Stops current node.
	 *
	 * @note This method is used to shut down the node releasing all its
	 *       resources.
	 *
	 * @returns {Promise} promises node stopped
	 */
	stop() {
		if ( !this._stopping ) {
			if ( this._starting ) {
				return this._starting.then( () => this.stop() );
			}

			this._starting = null;

			if ( this._state ) {
				this._state.stop();
			}

			this.network.receiver.removeAllListeners( "rpc" );

			this._stopping = Promise.all( [
				this.network.shutdown(),
				this.db.close(),
			] );
		}

		return this._stopping;
	}

	/**
	 * Checks if current node is in selected state.
	 *
	 * @param {string} state name of state to be tested
	 * @returns {boolean} true if node is in selected state
	 */
	is( state ) {
		if ( !States.isValidName( state ) ) {
			throw new TypeError( "invalid name of state" );
		}

		return this._stateName === state;
	}

	/**
	 * Adds node at provided address to current cluster.
	 *
	 * If current node isn't leader of cluster this request is forwarded to
	 * current leader implicitly.
	 *
	 * @param {string|Address} address address of peer node joining the cluster
	 * @returns {Promise} promises node having joined successfully
	 */
	join( address ) {
		const peer = address.toString();

		if ( !this.peers.has( peer ) ) {
			return this.command( new NodeCommands.Join( peer ) );
		}

		return Promise.resolve();
	}

	/**
	 * Removes node at provided address from current cluster.
	 *
	 * If current node isn't leader of cluster this request is forwarded to
	 * current leader implicitly.
	 *
	 * @param {string|Address} address address of peer node leaving the cluster
	 * @returns {Promise} promise node having left successfully
	 */
	leave( address ) {
		const peer = address.toString();

		DebugLog( `${this.id} leave ${peer}` );

		if ( this.peers.has( peer ) ) {
			return this.command( new NodeCommands.Leave( peer ) );
		}

		return Promise.resolve();
	}

	/**
	 * Retrieves up-to-date list of nodes in cluster implicitly requesting list
	 * from current leader if current node isn't leader.
	 *
	 * This method works asynchronously as it might need to forward request to
	 * cluster's current leader node implicitly when used on a follower node.
	 *
	 * @note Parts of returned information are missing unless node has been
	 *       attached to network before. Missing information don't make much
	 *       sense w/o node being attached to network first, though
	 *
	 * @returns {Promise<NodeInformation[]>} collected information on nodes of cluster
	 */
	fetchPeers() {
		if ( this._state instanceof States.Leader ) {
			const peers = this.peers.addresses;
			const numPeers = peers.length;
			const nodes = new Array( numPeers + 1 );

			for ( let i = 0; i < numPeers; i++ ) {
				nodes[i] = { id: peers[i].id };
			}

			nodes[numPeers] = {
				id: this.id.id,
				leader: true,
			};

			return Promise.resolve( peers );
		}

		return this.command( new NodeCommands.Peers( { tries: 0 } ) );
	}

	/**
	 * Manages current node transitioning into (different) state.
	 *
	 * @note When in candidate state (thus having started leader election) the
	 *       node might transition to same state due to heartbeat timeout for
	 *       dropping previous term as candidate and start new one as candidate.
	 * @note When in follower state (thus having processed request for voting
	 *       in favour of another node in a leader election) the node might
	 *       transition to same state due to having received another request to
	 *       vote in favour of a remote node.
	 *
	 * @param {string} state requests to switch current node into new state
	 * @param {boolean} onEnteringElection set true to mark this switch is due entering leader election
	 * @returns {void}
	 */
	transition( state, onEnteringElection = false ) {
		DebugLog( `${this.id}: switch to ${state}?` );

		if ( onEnteringElection || state !== this._stateName ) {
			DebugLog( `${this.id}: becomes ${state}${onEnteringElection ? " on entering election" : ""}` );

			const oldState = this._state;
			if ( oldState ) {
				oldState.stop();
			}

			this._state = States( state, this, this.options );

			importantStateEvents.forEach( event => {
				this._state.on( event, arg => this.emit( event, arg ) );
			} );

			if ( onEnteringElection ) {
				if ( !this._electing ) {
					process.nextTick( () => this.emit( "electing" ) );
				}

				this._electing = true;
				this._leaderId = undefined;
			} else if ( oldState instanceof States.Leader ) {
				this._leaderId = undefined;
			}

			this._stateName = state;
			this._state.start();

			this.emit( "new state", state, oldState && oldState.name );
			this.emit( state );

			switch ( state ) {
				case "leader" :
					this._leaderId = this.id.id;

				// falls through
				case "follower" :
					if ( this._electing || this._pristine ) {
						this._electing = this._pristine = false;

						if ( this._leaderId ) {
							DebugLog( `${this.id}: mark election of new leader ${this._leaderId}` );
							this.emit( "elected", this._leaderId );
						} else if ( !this._waitingForLeader ) {
							this._waitingForLeader = true;

							this.once( "new leader", newLeader => {
								this._waitingForLeader = false;

								if ( !this._electing ) {
									// haven't started another election since
									// waiting for leader information
									DebugLog( `${this.id}: deferredly mark election of new leader ${newLeader}` );
									this.emit( "elected", newLeader );
								}
							} );
						}
					}
					break;
			}
		}
	}

	/**
	 * Advances current node into another term.
	 *
	 * @returns {number} value of next term
	 */
	incrementTerm() {
		return ++this.term;
	}

	/**
	 * Transitions current node into weakened state.
	 *
	 * @param {number} duration duration in milliseconds this node is considered weak
	 * @returns {void}
	 */
	weaken( duration ) {
		this._weakUntil = Date.now() + duration;
		this.transition( "weakened" );
	}

	/**
	 * Waits for current node leaving state of being weakened to invoke provided
	 * callback.
	 *
	 * @param {function} callback function to be invoked when node is weak anymore
	 * @returns {void}
	 */
	untilNotWeakened( callback ) {
		const now = Date.now();
		if ( this._weakUntil > now ) {
			setTimeout( callback, this._weakUntil - now );
		} else {
			process.nextTick( callback );
		}
	}

	/**
	 * Updates node's knowledge on state of cluster from cluster-related
	 * information found in provided message.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {string} action name of requested action
	 * @param {object} params input parameters for requested action
	 * @returns {?Promise} promise for result/error to instantly respond with, undefined if request hasn't been handled
	 * @private
	 */
	updateOnRequest( from, action, params ) {
		if ( params ) {
			if ( params.term < this.term ) {
				DebugLog( `${this.id}: rejecting message of previous term ${params.term}, requiring ${this.term} at least` );
				return Promise.reject( Object.assign( new Error( "message for outdated term rejected" ), { code: "EOUTDATEDTERM" } ) );
			}

			if ( params.leaderId ) {
				if ( this._leaderId !== params.leaderId ) {
					this._leaderId = params.leaderId;
					this.emit( "new leader", this._leaderId );
				}
			}

			if ( params.term > this.term ) {
				DebugLog( `${this.id}: local term ${this.term} is outdated (${params.term}), thus becoming follower` );
				this.term = params.term;
				this.transition( "follower" );
			}
		}

		return null;
	}

	/**
	 * Handles message containing incoming RPC request.
	 *
	 * @note This method is pre-validating basic aspects of request and forwards
	 *       its actual processing to current node's state handler.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {string} action name of requested action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 * @private
	 */
	handleRequest( from, action, params ) {
		if ( !this.peers.has( from ) ) {
			return Promise.reject( new Error( `rejecting request for "${action}" from unknown node ${from}` ) );
		}


		if ( action === "RequestVote" ) {
			// handle requests for voting separate from other requests to
			// support them in parallel to running requests
			return this._state.castVote( from, params );
		}


		if ( this._handlingRequest ) {
			return Promise.reject( new Error( `race: already handling request "${this._handlingRequest}"` ) );
		}

		this._handlingRequest = action;

		return this._state.handleRequest( from, action, params )
			.then( reply => {
				return this.persist().catch( error => {
					ErrorLog( `${this.id}: failed persisting state after handling "${action}": ${error.message}` );
					throw error;
				} )
					.then( () => {
						DebugLog( `${this.id}: persisted state after handling "${action}" from ${from}` );

						this._handlingRequest = null;

						return reply;
					} );
			} )
			.catch( error => {
				this._handlingRequest = null;
				throw error;
			} );
	}

	/**
	 * Fetches network address of current leader node.
	 *
	 * @returns {string} ID/address of current leader node (as known by current node)
	 * @readonly
	 */
	get leader() {
		return this._leaderId;
	}

	/**
	 * Processes requested command in cluster accessed via current node.
	 *
	 * If current node is leader command is performed locally, otherwise it is
	 * forwarded to current leader node implicitly.
	 *
	 * This method is managing a queue of pending commands on behalf of current
	 * node. The returned promise is related to the actually requested command.
	 *
	 * @param {AbstractCommand} command command to be executed
	 * @returns {Promise<*>} promises result of successfully executing command
	 */
	command( command ) {
		if ( !( command instanceof AbstractCommand ) ) {
			return Promise.reject( new Error( Utility.format( "invalid command: %j", command ) ) );
		}

		if ( command instanceof NodeCommands.Get && !this.isLaggingBehind() ) {
			return this.db.get( command.args.key );
		}

		// enqueue command
		const that = this;
		const queue = this._commandQueue;
		const info = {
			command,
			attempts: 0,
			onResolve: null,
			onReject: null,
		};

		const promise = new Promise( ( resolve, reject ) => {
			info.onResolve = resolve;
			info.onReject = reject;
		} );

		queue.push( info );

		if ( queue.length === 1 ) {
			// instantly run enqueued command
			process.nextTick( runNextCommand );
		}

		return promise;


		/**
		 * Executes next command in queue.
		 *
		 * @returns {void}
		 */
		function runNextCommand() {
			queue[0].attempts++;

			const { command: _command, attempts, onResolve, onReject } = queue[0];

			CommandLog( `${that.id} start ${_command.forwarded ? "forwarded " : ""}command #${attempts} %j`, _command );

			if ( that._state instanceof States.Leader ) {
				// execute command locally
				_command.execute( that )
					.then( commandSucceeded )
					.catch( commandFailed );
			} else if ( _command.forwarded ) {
				// has been forwarded to follower
				// -> reject to have client try different node
				commandFailed( Object.assign( new Error( "not a leader" ), {
					code: "ENOTLEADER",
					leader: that._leaderId,
				} ), true );
			} else if ( that.leader ) {
				// knowing some leader currently
				// -> forward command there
				forwardCommand( that.leader, _command )
					.then( commandSucceeded )
					.catch( commandFailed );
			} else {
				// don't know any leader currently
				// -> wait for leader
				CommandLog( `${that.id} pause ${_command.forwarded ? "forwarded " : ""}command #${attempts} %j`, _command );

				that.once( "new leader", newLeaderId => {
					CommandLog( `${that.id} RESUME ${_command.forwarded ? "forwarded " : ""}command #${attempts} %j`, _command );

					if ( that.id.matches( newLeaderId ) ) {
						_command.execute( that )
							.then( commandSucceeded )
							.catch( commandFailed );
					} else {
						forwardCommand( newLeaderId, _command )
							.then( commandSucceeded )
							.catch( commandFailed );
					}
				} );
			}


			/**
			 * Forwards command to peer node assumed to be leader currently.
			 *
			 * @param {Address|string} peerId ID/address of remote peer
			 * @param {AbstractCommand} cmd command to be executed on peer node
			 * @returns {Promise} promises execution of command on peer node
			 */
			function forwardCommand( peerId, cmd ) {
				return that.network.getPeer( peerId )
					.call( "Command", {
						name: cmd.constructor.name,
						args: cmd.args,
						options: cmd.options,
					} )
					.then( reply => reply.result );
			}

			/**
			 * Handles successful execution of current command.
			 *
			 * @param {*} data result of executing command
			 * @returns {void}
			 */
			function commandSucceeded( data ) {
				CommandLog( `${that.id} success ${_command.forwarded ? "forwarded " : ""}command %j => %j`, _command, data );
				onResolve( data );

				queue.shift();
				if ( queue.length > 0 ) {
					process.nextTick( runNextCommand );
				}
			}

			/**
			 * Handles failure encountered while executing current command.
			 *
			 * @param {Error} error encountered error
			 * @param {boolean} forceRejection set true to enforce instant rejection of command
			 * @returns {void}
			 */
			function commandFailed( error, forceRejection = false ) {
				CommandLog( `${that.id} failure ${_command.forwarded ? "forwarded " : ""}command %j: %s`, _command, error.message );

				if ( !forceRejection || attempts >= that.options.clientMaxRetries ) {
					switch ( error.code ) {
						case "ENOTLEADER" :
							if ( error.leader ) {
								// instantly retry on provided peer node
								process.nextTick( runNextCommand );
								return;
							}

						// falls through
						case "ECONNRESET" :
						case "ECONNABORTED" :
						case "ETIMEDOUT" :
							// wait a moment, then retry
							setTimeout( runNextCommand, that.options.clientRetryRPCTimeout );
							return;
					}
				}

				// mark this command failed and prepare for next command
				onReject( error );

				queue.shift();
				if ( queue.length > 0 ) {
					process.nextTick( runNextCommand );
				}
			}
		}
	}

	/**
	 * Seeks consensus on current state of cluster from majority of its nodes.
	 *
	 * @returns {Promise} promises consensus
	 */
	seekConsensus() {
		return this.command( new NodeCommands.Consensus( this.id ) );
	}

	/**
	 * Waits for consensus on current state of cluster from majority of cluster
	 * nodes, but explicitly requiring confirmation from one or more peers
	 * explicitly.
	 *
	 * @param {string|Address|string[]|Address[]} peer address(es) of one or more peers
	 * @returns {Promise} promises consensus confirmed by selected (list of) peer(s)
	 */
	waitFor( peer ) {
		return this.command( new NodeCommands.Consensus( peer ) );
	}

	/**
	 * Calculates if given number of nodes represents majority of current
	 * cluster.
	 *
	 * @param {Boolean} proVotes set true if `count` refers to pro-votes and false on contra-votes
	 * @param {Number} count number of nodes having confirmed consensus
	 * @param {?int} voterCount number of nodes eligible to vote in current consensus request
	 * @returns {boolean} true if majority of nodes has confirmed consensus (checking numbers, only)
	 */
	isMajority( proVotes, count, voterCount = null ) {
		let _count = voterCount || this.peers.addresses.length;

		_count++;

		ConsensusLog( `${this.id}: got ${count} out of ${_count} possible ${proVotes ? "pro-" : "contra-"}votes` );

		const quorum = Math.floor( _count / 2 ) + 1;

		return Boolean( count >= quorum );
	}

	/**
	 * Applies commands tracked as log entries by eventually executing them
	 * affecting cluster's state/database and/or list of its current set of
	 * participating nodes.
	 *
	 * @note This method is exposed for externally starting entry application.
	 *
	 * @param {CommandDescriptor[]} entries confirmed entries of cluster log to be applied to database
	 * @returns {Promise} promises all entries of cluster log applied to persistent database
	 */
	applyLogEntries( entries ) {
		const numEntries = entries.length;

		const topologyEntries = new Array( numEntries );
		let topologyWrite = 0;

		const dbEntries = new Array( numEntries );
		let dbWrite = 0;

		for ( let read = 0; read < numEntries; read++ ) {
			const entry = entries[read];

			switch ( entry.type ) {
				case "join" :
				case "leave" :
					topologyEntries[topologyWrite++] = entry;
					break;

				default :
					dbEntries[dbWrite++] = entry;
					break;
			}
		}

		topologyEntries.splice( topologyWrite );
		dbEntries.splice( dbWrite );

		this.applyTopologyCommands( topologyEntries );

		return this.db.applyLogEntries( dbEntries );
	}

	/**
	 * Applies list of topology-related commands not affecting the cluster's
	 * state but its infrastructure/topology.
	 *
	 * @param {object[]} commands list of commands not affecting cluster's database but its infrastructure
	 * @returns {void}
	 */
	applyTopologyCommands( commands ) {
		for ( let i = 0, length = commands.length; i < length; i++ ) {
			this.applyTopologyCommand( commands[i] );
		}
	}

	/**
	 * Applies single topology-related command not affecting the cluster's state
	 * but its infrastructure/topology.
	 *
	 * @param {object} command single command related to cluster's infrastructure
	 * @returns {void}
	 */
	applyTopologyCommand( command ) {
		DebugLog( "%s: applying topology command: %j", this.id, command );

		switch ( command.type ) {
			case "join" :
				this.peers.add( command.peer );
				break;

			case "leave" : {
				const peer = Address( command.peer );

				if ( !this._leaving.find( listed => listed.matches( peer ) ) ) {
					this._leaving.push( peer );

					setTimeout( () => {
						DebugLog( "%s: peer %s is leaving eventually", this.id, peer );

						this.peers.remove( peer );

						DebugLog( "%s: peers now are: %j", this.id, this.peers.toJSON() );

						this._leaving = this._leaving.filter( p => p !== command.peer );
					}, this.options.waitBeforeLeaveMS );
				}
				break;
			}
		}
	}

	/**
	 * Persists meta information of current node to database.
	 *
	 * Meta information basically includes current term according to node's log
	 * as well as leader this node has voted for during last election. In
	 * addition all peers currently participating in cluster are persisted in
	 * database though this particular set is handled managed separately on
	 * joining or leaving nodes. Any persisted information is used to recover
	 * node next time it is starting up again.
	 *
	 * @return {Promise} promises state of node persisted to database
	 */
	persist() {
		DebugLog( "%s: persisting", this.id );

		return this.db.persist( this );
	}

	/**
	 * Indicates if local node of cluster is lagging behind by means of knowing
	 * log entries that haven't been committed by current leader and applied to
	 * local node's state/database yet.
	 *
	 * @returns {boolean} true if there are uncommitted log entries
	 */
	isLaggingBehind() {
		const { stats } = this.log;

		return stats.lastIndex > stats.lastAppliedIndex;
	}
}

module.exports = Node;
