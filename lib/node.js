"use strict";

const EventEmitter = require( "events" );
const { Transform, PassThrough } = require( "stream" );

const Debug = require( "debug" )( "scull.node.debug" );
const DispatcherDebug = require( "debug" )( "scull.dispatcher" );
const ConsensusDebug = require( "debug" )( "scull.consensus" );

const Nodes = require( "./data/nodes" );
const Connections = require( "./data/connections" );
const Dispatcher = require( "./dispatcher" );
const States = require( "./states" );
const Log = require( "./log" );
const RPCProcessor = require( "./rpc" );
const Client = require( "./client" );
const Address = require( "./data/address" );
const NotLeaderError = require( "./utils/not-leader-error" );

const importantStateEvents = ["heartbeat timeout"];



/**
 * @typedef {object} NodeStatsPerCommand
 * @property {int} AppendEntries number of processed `AppendEntries` commands
 * @property {int} RequestVote number of processed `RequestVote` commands
 * @property {int} InstallSnapshot number of processed `InstallSnapshot` commands
 */

/**
 * @typedef {object} NodeStats
 * @property {int} messagesReceived total number of messages received by node
 * @property {int} messagesSent total number of messages sent by node
 * @property {int} rpcReceived total number of RPC requests received by node
 * @property {int} rpcSent total number of RPC requests sent by node
 * @property {NodeStatsPerCommand} rpcReceivedByType number of received RPC requests per type of command
 * @property {NodeStatsPerCommand} rpcSentByType number of sent RPC requests per type of command
 */

/**
 * @typedef {NetworkStats} NetworkStatsExtended
 * @property {int} lastReceivedAgo milliseconds since last received message
 * @property {int} lastSentAgo milliseconds since last sent message
 */

/**
 * @typedef {object} NodeInformation
 * @property {string} id unique ID/address of node in cluster
 * @property {boolean} leader true if node is cluster's leader currently
 * @property {?boolean} connected true if node is currently connected to leader
 * @property {?NetworkStatsExtended} stats statistical information on node as tracked by leader
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
	 * @param {DB} db reference on database containing persistent log and state of node
	 * @param {object} options options customizing behavious of node
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

		peers.setMaxListeners( peers.addresses.length * 2 );


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
			options: { value: Object.seal( options || {} ) },
		} );


		const requestDispatcher = new Dispatcher( { id } );
		const replyDispatcher = new Dispatcher( { id } );
		const connections = new Connections( this, peers );


		const unlimitedStream = new PassThrough( {
			objectMode: true,
		} );
		unlimitedStream.setMaxListeners( Infinity );


		const stats = {
			messagesReceived: 0,
			messagesSent: 0,
			rpcReceived: 0,
			rpcSent: 0,
			rpcReceivedByType: {
				AppendEntries: 0,
				RequestVote: 0,
				InstallSnapshot: 0
			},
			rpcSentByType: {
				AppendEntries: 0,
				RequestVote: 0,
				InstallSnapshot: 0
			}
		};

		this.on( "message received", () => stats.messagesReceived++ );
		this.on( "message sent", () => stats.messagesSent++ );
		this.on( "rpc sent", type => {
			stats.rpcSent++;
			stats.rpcSentByType[type]++;
		} );
		this.on( "rpc received", type => {
			stats.rpcReceived++;
			stats.rpcReceivedByType[type]++;
		} );



		let network = null;
		this.on( "network attached", attached => {
			network = attached;
		} );


		Object.defineProperties( this, {
			/**
			 * Provides database connection of current node.
			 *
			 * @name Node#db
			 * @property {DB}
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

					ConsensusDebug( `${id}: setting voted for to ${peer}` );
					votedFor = Address( peer );
				}
			},

			/**
			 * Refers to writable stream for use with sending requests.
			 *
			 * @name Node#requestOut
			 * @property {Writable}
			 * @readonly
			 */
			requestOut: { value: this._outStream() },

			/**
			 * Refers to writable stream for use with sending responses to
			 * processed incoming requests.
			 *
			 * @name Node#responseOut
			 * @property {Writable}
			 * @readonly
			 */
			responseOut: { value: this._outStream() },

			/**
			 * Refers to stream collecting and providing received responses to
			 * requests sent before.
			 *
			 * @name Node#rpcReplies
			 * @property {Duplex}
			 * @readonly
			 */
			rpcReplies: { value: unlimitedStream },

			/**
			 * Refers to node's dispatcher managing queue of pending requests to
			 * be processed.
			 *
			 * @name Node#requestDispatcher
			 * @property {Dispatcher}
			 * @readonly
			 */
			requestDispatcher: { value: requestDispatcher },

			/**
			 * Refers to node's dispatcher routing responses to their designated
			 * target.
			 *
			 * @name Node#replyDispatcher
			 * @property {Dispatcher}
			 * @readonly
			 */
			replyDispatcher: { value: replyDispatcher },

			/**
			 * Provides pool tracking current state of being connected with
			 * either node of cluster.
			 *
			 * @name Node#connections
			 * @property {Connections}
			 * @readonly
			 */
			connections: { value: connections },

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
			 * Provides statistical counters regarding messages and requests
			 * processed by current cluster node.
			 *
			 * @name Node#stats
			 * @property {NodeStats}
			 * @readonly
			 */
			stats: { value: stats },

			/**
			 * Provides RPC client of current node commonly available to issue
			 * remote commands on behalf of current node to be processed by
			 * cluster's current leader node.
			 *
			 * @name Node#client
			 * @property {Client}
			 * @readonly
			 */
			client: { value: new Client( this ) },

			/**
			 * Refers to network this node is attached to.
			 *
			 * @name Node#_network
			 * @property {NetworkView}
			 * @readonly
			 * @protected
			 */
			_network: { get: () => network },
		} );

		this._stopped = false;
		this._electing = false;
		this._pristine = true;
		this._leaderId = undefined;

		this._stateName = undefined;
		this._state = null;

		this._handlingRequest = false; // to detect race conditions
		this._weakUntil = Date.now();

		this._leaving = [];

		Debug( `id: ${this.id.toString()}` );
		Debug( `peers: ${this.peers}` );


		replyDispatcher.on( "readable", () => {
			if ( this._stopped ) {
				return;
			}

			const message = this.replyDispatcher.next();
			if ( !message ) {
				return;
			}

			const me = this.id;

			Debug( `${me}: processing next reply message` );

			this.emit( "message received", message );

			if ( !this._updateOnMessage( message ) ) {
				return;
			}


			switch ( message.type ) {
				case "request" :
					DispatcherDebug( "%s: request from %s on reply channel REJECTED: %j", me, message.from, message );
					break;

				case "reply" :
					DispatcherDebug( "%s: REPLY %s from %s: %j", me, message.id, message.from, message );
					this.rpcReplies.write( message );
					break;
			}
		} );


		this._dispatchRequest();
	}

	/**
	 * Stops current node.
	 *
	 * @note This method is used to shut down the node releasing all its
	 *       resources.
	 *
	 * @returns {void}
	 */
	stop() {
		this._stopped = true;
		if ( this._state ) {
			this._state.stop();
		}

		this.requestDispatcher.removeAllListeners( "readable" );
		this.replyDispatcher.removeAllListeners( "readable" );

		this.removeAllListeners( "message received" );
		this.removeAllListeners( "message sent" );
		this.removeAllListeners( "rpc received" );
		this.removeAllListeners( "rpc sent" );

		this.removeAllListeners( "network attached" );
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

	// -------------
	// Peers

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
		address = address.toString();

		if ( !this.peers.has( address ) ) {
			return this.command( { type: "join", peer: address }, {} );
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
		Debug( `${this.id} leave ${address}` );

		address = address.toString();

		if ( this.peers.has( address ) ) {
			return this.command( { type: "leave", peer: address }, {} );
		}

		return Promise.resolve();
	}

	/**
	 * Initiates described remote procedure call promising result of successful
	 * invocation.
	 *
	 * @param {RPC} call description of remote procedure call to perform
	 * @returns {Promise<RPCReply>} promises result of successfully handled call
	 */
	rpc( call ) {
		return RPCProcessor( this, call )
			.then( result => {
				Debug( "RPC result: %j", result );
				return result;
			} )
			.catch( error => {
				Error( "RPC failed: %s", error.stack );
				throw error;
			} );
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
			const myAddress = this.id.toString();

			/**
			 * @type {NodeInformation[]}
			 */
			const peers = this.peers.addresses
				.map( peer => ( { id: peer.id } ) )
				.concat( {
					id: myAddress,
					leader: true
				} );

			const network = this._network;
			if ( network ) {
				peers.forEach( peer => {
					peer.stats = ( network.transmitting.connection( peer.id ) || {} ).stats;
					if ( peer.stats ) {
						peer.stats.lastReceivedAgo = Date.now() - peer.stats.lastReceived;
						peer.stats.lastSentAgo = Date.now() - peer.stats.lastSent;
					} else {
						peer.stats = null;
					}

					peer.connected = this.connections.isConnectedTo( peer.id );
				} );
			}

			return Promise.resolve( peers );
		}

		// TODO check why command "peers" is string whereas all other commands are objects w/ property "type" naming actual command
		return this.client.command( "peers", { tries: 0 } );
	}

	// -------------
	// Internal state

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
		Debug( `${this.id}: switch to ${state}?` );

		if ( onEnteringElection || state !== this._stateName ) {
			Debug( `${this.id}: becomes ${state}${onEnteringElection ? " on entering election" : ""}` );

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

			this.emit( "new state", state );
			this.emit( state );

			switch ( state ) {
				case "leader" :
					// jshint -W086
					this._leaderId = this.id.toString();

				// falls through
				case "follower" :
					if ( this._electing || this._pristine ) {
						this._electing = this._pristine = false;

						if ( this._leaderId ) {
							Debug( `${this.id}: mark election of new leader ${this._leaderId}` );
							this.emit( "elected", this._leaderId );
						} else if ( !this._waitingForLeader ) {
							this._waitingForLeader = true;

							this.once( "new leader", newLeader => {
								this._waitingForLeader = false;

								if ( !this._electing ) {
									// haven't started another election since
									// waiting for leader information
									Debug( `${this.id}: deferredly mark election of new leader ${this._leaderId}` );
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

	// -------------
	// Networking

	/**
	 * Sends RPC reply to recently incoming request with selected message ID.
	 *
	 * @param {Address|string} to recipient's address
	 * @param {string} messageId unique ID of message sent
	 * @param {object} params payload of message
	 * @returns {Promise} promises reply sent
	 */
	reply( to, messageId, params ) {
		const me = this.id;

		Debug( "%s: replying to: %s, messageId: %s, params: %j", me, to, messageId, params );

		return new Promise( ( resolve, reject ) => {
			this.responseOut.write( {
				from: me.toString(),
				to: to.toString(),
				type: "reply",
				id: messageId,
				params
			}, error => ( error ? reject( error ) : resolve() ) );
		} );
	}

	/**
	 * Updates node's knowledge on state of cluster from cluster-related
	 * information found in provided message.
	 *
	 * @param {object} message message to extract information from
	 * @returns {boolean} true if message may be processed, false otherwise
	 * @private
	 */
	_updateOnMessage( message ) {
		const me = this.id;
		const { params } = message;

		if ( params ) {
			if ( params.term < this.term ) {
				// discard message belonging to some previous term
				Error( `${me}: message discarded because term ${params.term} is smaller than my current term ${this.term}` );
				return false;
			}

			if ( params.leaderId ) {
				if ( this._leaderId !== params.leaderId ) {
					this._leaderId = params.leaderId;
					this.emit( "new leader", this._leaderId );
				}
			}

			if ( params.term > this.term ) {
				Debug( `${me}: converting to follower due to outdated term (my ${this.term} vs. ${params.term})` );
				this.term = params.term;
				this.transition( "follower" );
			}
		}

		return true;
	}

	/**
	 * Dispatches next incoming message available in local processing queue to
	 * appropriate handler.
	 *
	 * @returns {void}
	 * @private
	 */
	_dispatchRequest() {
		const me = this.id;

		if ( this._stopped ) {
			return;
		}

		const message = this.requestDispatcher.next();
		if ( message ) {
			Debug( `${me}: processing next request message` );

			this.emit( "message received", message );

			if ( !this._updateOnMessage( message ) ) {
				process.nextTick( () => this._dispatchRequest() );
				return;
			}

			switch ( message.type ) {
				case "request" :
					DispatcherDebug( "%s: REQUEST %s from %s: %j", me, message.id, message.from, message );
					this._handleRequest( message )
						.catch( error => {
							Error( "%s: FAILED on request %s from %s: %s", me, message.id, message.from, error.message );
						} )
						// always keep dispatching available messages
						.then( () => this._dispatchRequest() )
						.catch( () => this._dispatchRequest() );
					break;

				case "reply" :
					DispatcherDebug( "%s: reply from %s on request channel REJECTED: %j", me, message.from, message );
					// falls through
				default :
					// this.rpcReplies.write( message );
					process.nextTick( () => this._dispatchRequest() );
					break;
			}
		} else {
			this.requestDispatcher.once( "readable", () => this._dispatchRequest() );
		}
	}

	/**
	 * Handles message containing incoming RPC request.
	 *
	 * @note This method is pre-validating basic aspects of request and forwards
	 *       its actual processing to current node's state handler.
	 *
	 * @param {object} message message containing RPC request
	 * @returns {Promise} promises request handled successfully
	 * @private
	 */
	_handleRequest( message ) {
		if ( this._handlingRequest ) {
			return Promise.reject( new Error( "race: already handling request" ) );
		}

		const me = this.id;

		const { id, from } = message;
		if ( !from ) {
			return Promise.resolve();
		}

		if ( !this.peers.has( from ) ) {
			return Promise.reject( new Error( `rejecting message ${id} from unknown node ${from}` ) );
		}


		this.emit( "rpc received", message.action );
		this._handlingRequest = true;

		return this._state.handleRequest( message )
			.then( () => {
				return this.persist()
					.catch( persistError => {
						Error( "%s: failed persisting node after successful request: %j", me, persistError );

						throw persistError;
					} );
			} )
			.then( () => {
				Debug( `${me}: done handling message ${id}, persisted node's state` );
			} )
			.then( () => {
				this._handlingRequest = false;
			}, error => {
				this._handlingRequest = false;
				throw error;
			} );
	}

	/**
	 * Creates writable transformation stream qualifying requests sent by node.
	 *
	 * This qualification includes marking any written message object with
	 * current node's address as sender.
	 *
	 * @returns {Writable} stream emitting written messages marked to originate from this node
	 * @private
	 */
	_outStream() {
		const myId = this.id.toString();

		return new Transform( {
			objectMode: true,
			transform( message, _, callback ) {
				message.from = myId;
				this.push( message );
				callback();
			},
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

	// -------
	// Commands

	/**
	 * Processes requested command in cluster accessed via current node.
	 *
	 * If current node is leader command is performed locally, otherwise it is
	 * forwarded to current leader node implicitly.
	 *
	 * @param {object} command actual command to be performed
	 * @param {object<string,*>} options customizing options
	 * @returns {Promise} promises command handled successfully
	 */
	command( command, options = {} ) {
		if ( this._state instanceof States.Leader ) {
			if ( command === "peers" ) {
				return this.fetchPeers();
			}

			// always request consensus with all current nodes of cluster
			const consensuses = [this.peers.addresses];
			let resultingPeersList = null;
			const change = {};

			switch ( command.type ) {
				case "join" :
					// require another consensus covering vote from actually joining peer
					if ( !this.peers.has( command.peer ) ) {
						change.add = Address( command.peer );

						// temporarily add joining node to enable communication with it
						this.peers.add( change.add );

						resultingPeersList = this.peers.addresses.concat( change.add );
						consensuses.push( resultingPeersList );
					}
					break;

				case "leave" :
					// require another consensus excluding actually leaving peer
					if ( this.peers.has( command.peer ) ) {
						change.remove = Address( command.peer );
						resultingPeersList = this.peers.addresses.filter( p => !p.matches( change.remove ) );
						consensuses.push( resultingPeersList );
					}
					break;
			}


			return this._state.command( consensuses, command, options )
				.catch( error => {
					// consensus failed -> need to revoke temporarily added peer
					if ( change.add ) {
						this.peers.remove( change.add );
					}

					throw error;
				} )
				.then( () => {
					Debug( "command %s finished", command );

					if ( change.add ) {
						// peer has been added temporarily before
						// -> now this is considered permanent
					} else if ( change.remove ) {
						this.peers.remove( change.remove );
					}

					return this.db.command( this, command );
				} );
		}

		// not a leader
		if ( !options.remote ) {
			// command has not been forwarded before

			if ( this.leader ) {
				// -> forward to current leader now
				return this.client.command( command, options );
			}

			// node does not know any current leader
			return new Promise( ( resolve, reject ) => {
				this.once( "new leader", () => {
					this.command( command, options )
						.then( resolve )
						.catch( reject );
				} );
			} );
		}

		return Promise.reject( new NotLeaderError( this._leaderId ) );
	}

	/**
	 * Requests confirmation of consensus on current state of cluster from
	 * majority of nodes in cluster.
	 *
	 * @returns {Promise} promises consensus confirmed by majority of nodes
	 */
	readConsensus() {
		return this.command( { type: "read" }, { alsoWaitFor: this.id.toString() } )
			.then( () => null );
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
		return this.command( { type: "read" }, { alsoWaitFor: peer } )
			.then( () => null );
	}

	/**
	 * Calculates if given number of nodes represents majority of current
	 * cluster.
	 *
	 * @param {Boolean} proVotes set true if `count` refers to pro-votes and false on contra-votes
	 * @param {Number} count number of nodes having confirmed consensus
	 * @param {int} voterCount number of nodes eligible to vote in current consensus request
	 * @returns {boolean} true if majority of nodes has confirmed consensus (checking numbers, only)
	 */
	isMajority( proVotes, count, voterCount = null ) {
		if ( !voterCount ) {
			voterCount = this.peers.addresses.length;
		}

		voterCount++;

		ConsensusDebug( `${this.id}: got ${count} out of ${voterCount} possible ${proVotes ? "pro-" : "contra-"}votes` );

		const quorum = Math.floor( voterCount / 2 ) + 1;

		return Boolean( count >= quorum );
	}

	// -------
	// Persistence

	/**
	 * Applies entries by persistently storing them in local database and/or
	 * processing command included with every entry.
	 *
	 * @note This method is exposed for externally starting entry application.
	 *
	 * @param {LogEntry[]} entries confirmed entries of cluster log to be applied to database
	 * @returns {Promise} promises all entries of cluster log applied to persistent database
	 */
	applyEntries( entries ) {
		return this.db.applyEntries( entries, commands => this.applyTopologyCommands( commands ) );
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
		Debug( "%s: applying topology command: %j", this.id, command );

		switch ( command.type ) {
			case "join" :
				this.peers.add( command.peer );
				break;

			case "leave" : {
				const peer = Address( command.peer );

				if ( !this._leaving.find( listed => listed.matches( peer ) ) ) {
					this._leaving.push( peer );

					setTimeout( () => {
						Debug( "%s: peer %s is leaving eventually", this.id, peer );

						this.peers.remove( peer );

						Debug( "%s: peers now are: %j", this.id, this.peers.toJSON() );

						if ( this.requestOut ) {
							this.requestOut.disconnect( peer );
						}

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
		Debug( "%s: persisting", this.id );

		return this.db.persist( this );
	}
}

module.exports = Node;
