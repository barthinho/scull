'use strict';

const Debug = require( 'debug' )( 'skiff.node' );
const Through = require( 'through2' );
const EventEmitter = require( 'events' );
const assert = require( 'assert' );

const States = require( './states' );
const Log = require( './log' );
const RPC = require( './rpc' );
const Client = require( './client' );
const Address = require( './data/address' );
const NotLeaderError = require( './utils/not-leader-error' );

const importantStateEvents = ['heartbeat timeout'];

/**
 * Implements single node in cluster.
 *
 * @type {Node}
 * @name Node
 * @property {Address} id
 * @property {object<string,*>} options
 * @property {DB} db
 * @property {Writable} requestOut stream for sending messages to connected peers (e.g. as a leader)
 * @property {Writable} responseOut stream for sending replies to received RPCs
 * @property {Readable} rpcReplies stream providing received RPC replies
 * @property {Log} log
 * @property {function(options:object<string,*>):Promise<object>} rpc
 * @property {Address[]} peers lists addresses of peers belonging to cluster
 * @property {Connections} connections provides status of peer connections
 * @property {Dispatcher} dispatcher provides message dispatcher associated with current node
 * @property {?NodeState} _state implementation of node's current state-specific behaviour
 * @property {function(function(error:?Error, peers:?Array=)=):?Promise<Array>} peersWithStats fetches list of peers including statistical information from current leader
 * @property {?Address} votedFor addresses node this one has voted for in previous election
 * @property {function} _boundDispatch
 */
module.exports = class Node extends EventEmitter {

	/**
	 * @param {Address|string} id network address of node serving as ID as well
	 * @param {Connections} connections
	 * @param {Dispatcher} dispatcher
	 * @param {DB} db
	 * @param {function(function(error:?Error, peers:?[]=))} peersFetcher
	 * @param {object} options
	 */
	constructor( id, connections, dispatcher, db, peersFetcher, options ) {
		super();

		let term = 0;
		let votedFor = null;
		let peers = ( ( options || {} ).peers || [] )
			.filter( address => address.toString() !== id.toString() );

		Object.defineProperties( this, {
			id: { value: id },
		} );

		Object.defineProperties( this, {
			db: { value: db },
			log: { value: new Log( this, options ) },
			term: {
				get: () => term,
				set: value => {
					if ( typeof value !== 'number' ) {
						throw new TypeError( 'term needs to be a number and was %j', value );
					}

					votedFor = null;
					term = value;

					return value;
				}
			},
			votedFor: {
				get: () => votedFor,
				set: peer => {
					Debug( '%s: setting voted for to %s', id, peer );
					votedFor = peer ? Address( peer ) : null;
				}
			},
			requestOut: { value: this._outStream() },
			responseOut: { value: this._outStream() },
			rpcReplies: { value: this._replyStream() },
			options: { value: options || {} },
			dispatcher: { value: dispatcher },
			connections: { value: connections },
			peers: {
				get: () => peers.slice( 0 ),
				set: items => {
					const myAddress = this.id.toString();

					peers = items.filter( peer => peer.toString() !== myAddress );

					this._state.updatePeers( peers );
				}
			},
			peersWithStats: { value: peersFetcher },
		} );

		Object.defineProperties( this, {
			rpc: { value: RPC( this ) },
			client: { value: new Client( this ) },

			_boundDispatch: { value: this._dispatch.bind( this ) },
		} );

		this._stopped = false;
		this._electing = false;
		this._leaderId = undefined;

		this._stateName = undefined;
		this._state = null;

		this._handlingRequest = false; // to detect race conditions
		this._weakenedBefore = Date.now();

		this._leaving = [];

		Debug( 'id:', this.id.toString() );
		Debug( 'peers:', this.peers );

		this._dispatch();
	}

	stop() {
		this._stopped = true;
		if ( this._state ) {
			this._state.stop();
		}

		this.dispatcher.removeListener( 'readable', this._boundDispatch );
	}

	/**
	 * Checks if current node is in selected state.
	 *
	 * @param {string} state name of state to be tested
	 * @returns {boolean} true if node is in selected state
	 */
	is( state ) {
		if ( !States.isValidName( state ) ) {
			throw new TypeError( 'invalid name of state' );
		}

		return this._stateName === state;
	}

	// -------------
	// Peers

	join( address ) {
		address = address.toString();

		if ( this.peers.indexOf( address ) < 0 ) {
			return this.command( { type: 'join', peer: address }, {} );
		}

		return Promise.resolve();
	}

	leave( address ) {
		Debug( '%s: leave %s', this.id, address );

		address = address.toString();

		if ( address === this.id.toString() || this.peers.indexOf( address ) > -1 ) {
			return this.command( { type: 'leave', peer: address }, {} );
		}

		return Promise.resolve();
	}

	/**
	 * Retrieves up-to-date list of nodes in cluster implicitly requesting list
	 * from current leader if current node isn't leader.
	 *
	 * This method asynchronously as it might be forwarded to cluster's current
	 * leader node implicitly when used on a follower node.
	 *
	 * @note This method requires provision of network sockets which aren't
	 *       available to instances of Node by design. Thus this method is
	 *       breaking design and can't be invoked directly, but must be invoked
	 *       via Node#peersWithStats() instead.
	 *
	 * @param {?{active:NetworkNode, passive:NetworkNode}} networkSockets
	 * @returns {Promise<Array>}
	 */
	fetchPeers( networkSockets ) {
		if ( this._state instanceof States.Leader ) {
			const myAddress = this.id.toString();

			const peers = this.peers
				.map( peer => ( { id: peer } ) )
				.filter( peer => peer.id !== myAddress )
				.concat( {
					id: myAddress,
					leader: true
				} );

			if ( networkSockets ) {
				peers.forEach( peer => {
					peer.stats = networkSockets.active._out.peerStats( peer.id );
					if ( peer.stats ) {
						peer.stats.lastReceivedAgo = Date.now() - peer.stats.lastReceived;
						peer.stats.lastSentAgo = Date.now() - peer.stats.lastSent;
					}

					peer.connected = this.connections.isConnectedTo( peer.id );
				} );
			}

			return Promise.resolve( peers );
		} else {
			// forward request to current leader
			return this.client.command( 'peers', { tries: 0 } );
		}
	}

	_ensurePeer( address ) {
		if ( (this.peers.indexOf( address ) < 0) && address !== this.id.toString() ) {
			Debug( '%s is joining %s', this.id, address );
			this.peers.push( address );
		}
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
	 * @param {string} state
	 * @param {boolean} onEnteringElection
	 */
	transition( state, onEnteringElection = false ) {
		Debug( '%s: asked to transition to state %s', this.id, state );
		if ( onEnteringElection || state !== this._stateName ) {
			Debug( 'node %s is transitioning to state %s', this.id, state );

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
			}


			this._stateName = state;
			this._state.start();

			this.emit( 'new state', state );
			this.emit( state );


			switch ( state ) {
				case 'leader' :
					// jshint -W086
					this._leaderId = this.id.toString();

				// falls through
				case 'follower' :
					if ( this._electing ) {

						this._electing = false;

						if ( this._leaderId ) {
							this.emit( 'elected', this._leaderId );
						} else {
							this.once( 'new leader', newLeader => {
								if ( !this._electing ) {
									// haven't started another election since
									// waiting for leader information
									this.emit( 'elected', newLeader );
								}
							} );
						}
					}
					break;
			}
		}
	}

	incrementTerm() {
		return ++this.term;
	}

	weaken( duration ) {
		this._weakenedBefore = Date.now() + duration;
		this.transition( 'weakened' );
	}

	untilNotWeakened( callback ) {
		const now = Date.now();
		if ( this._weakenedBefore > now ) {
			setTimeout( callback, this._weakenedBefore - now );
		} else {
			process.nextTick( callback );
		}
	}

	// -------------
	// Networking

	reply( to, messageId, params, callback ) {
		const me = this.id;

		Debug( '%s: replying to: %s, messageId: %s, params: %j', me, to, messageId, params );

		this.responseOut.write( {
			from: me.toString(),
			to: to.toString(),
			type: 'reply',
			id: messageId,
			params
		}, callback );
	}

	_dispatch() {
		const me = this.id;

		Debug( '%s: _dispatch', me );

		if ( this._stopped ) {
			return;
		}

		const message = this.dispatcher.next();
		if ( !message ) {
			this.dispatcher.once( 'readable', this._boundDispatch );
		} else {
			Debug( '%s: got message from dispatcher: %j', me, message );

			this.emit( 'message received', message );

			if ( message.params ) {
				if ( message.params.term < this.term ) {
					// discard message belonging to some previous term
					Debug( '%s: message discarded because term %d is smaller than my current term %d',
						this.id, message.params.term, this.term );
					return process.nextTick( this._boundDispatch );
				}

				if ( message.params.leaderId ) {
					if ( this._leaderId !== message.params.leaderId ) {
						this._leaderId = message.params.leaderId;
						this.emit( 'new leader', this._leaderId );
					}
				}

				Debug( '%s: current term: %d', me, this.term );

				if ( message.params.term > this.term ) {
					Debug( '%s is going to transition to state follower because of outdated term', me );
					this.term = message.params.term;
					this.transition( 'follower' );
				}
			}

			switch ( message.type ) {
				case 'request' :
					Debug( '%s: request message from dispatcher: %j', me, message );
					this._handleRequest( message, this._boundDispatch );
					break;

				case 'reply' :
					Debug( '%s: reply message from dispatcher: %j', me, message );
					this._handleReply( message, this._boundDispatch );
					break;
			}
		}
	}

	_handleRequest( message, done ) {
		assert( !this._handlingRequest, 'race: already handling request' );
		this.emit( 'rpc received', message.action );
		this._handlingRequest = true;

		const from = message.from;
		if ( from ) {
			Debug( '%s: handling message: %j', this.id, message );
			this._ensurePeer( from );
			this._state.handleRequest( message, err => {
				this.persist( persistError => {
					Debug( '%s: persisted', this.id );
					this._handlingRequest = false;

					if ( err ) {
						done( err );
					} else {
						done( persistError );
					}
				} );
			} );
		} else {
			done();
		}
	}

	_handleReply( message, done ) {
		Debug( '%s: handling reply %j', this.id, message );
		this.rpcReplies.write( message );
		done();
	}

	/**
	 * Creates writable transformation stream qualifying requests sent by node.
	 *
	 * This qualification includes marking any written message object with
	 * current node's address as sender.
	 *
	 * @returns {Writable}
	 * @private
	 */
	_outStream() {
		const myId = this.id.toString();

		return Through.obj( transform );

		function transform( message, _, callback ) {
			// jshint -W040
			message.from = myId;
			this.push( message );
			callback();
		}
	}

	/**
	 * Creates local stream used to distribute incoming RPC replies to multiple
	 * requests each waiting for their individual reply.
	 *
	 * This is required to exclusively circumvent limit applied on event
	 * listeners and to separate incoming RPC replies from incoming requests.
	 *
	 * @returns {Readable}
	 * @private
	 */
	_replyStream() {
		const stream = Through.obj( transform );
		stream.setMaxListeners( 0 );
		return stream;

		function transform( message, _, callback ) {
			// jshint -W040
			this.push( message );
			callback();
		}
	}

	/**
	 * Fetches network address of current leader node.
	 *
	 * @returns {string}
	 */
	leader() {
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
	 * @param {object<string,*>=} options
	 * @returns {Promise}
	 */
	command( command, options = {} ) {
		if ( this._state instanceof States.Leader ) {
			if ( command === 'peers' ) {
				return this.peersWithStats();
			}

			// always request consensus with all current nodes of cluster
			const consensuses = [this.peers.slice()];
			let resultingPeersList = null;

			switch ( command.type ) {
				case 'join' :
					// require another consensus including actually joining peer
					if ( this.peers.indexOf( command.peer ) < 0 && command.peer !== this.id.toString() ) {
						resultingPeersList = this.peers.concat( command.peer );
						consensuses.push( resultingPeersList );
					}
					break;

				case 'leave' :
					// require another consensus excluding actually leaving peer
					if ( this.peers.indexOf( command.peer ) > -1 && command.peer !== this.id.toString() ) {
						resultingPeersList = this.peers.filter( p => p !== command.peer );
						consensuses.push( resultingPeersList );
					}
					break;
			}


			return this._state.command( consensuses, command, options )
				.then( result => {
					Debug( 'command %s finished with result = %j', command, result );

					if ( resultingPeersList ) {
						this.peers = resultingPeersList;
					}

					return this.db.command( this, command, options );
				} );
		} else {
			// not a leader
			if ( !options.remote ) {
				// command has not been forwarded yet
				// -> forward to current leader now
				return this.client.command( command, options );
			}

			return Promise.reject( new NotLeaderError( this._leaderId ) );
		}
	}

	/**
	 * Requests confirmation of consensus on current state of cluster from
	 * majority of nodes in cluster.
	 *
	 * @returns {Promise}
	 */
	readConsensus() {
		return this.command( { type: 'read' }, { alsoWaitFor: this.id.toString() } ).then( () => null );
	}

	/**
	 * Waits for consensus on current state of cluster from majority of cluster
	 * nodes, but explicitly requiring confirmation from one or more peers
	 * explicitly.
	 *
	 * @param {string|Address|string[]|Address[]} peer address(es) of one or more peers
	 * @returns {Promise}
	 */
	waitFor( peer ) {
		return this.command( { type: 'read' }, { alsoWaitFor: peer } ).then( () => null );
	}

	/**
	 * Calculates if given number of nodes represents majority of current
	 * cluster.
	 *
	 * @param {Number} count
	 * @param {Address[]} consensus
	 * @returns {boolean}
	 */
	isMajority( count, consensus = this.peers ) {
		const quorum = Math.floor( (consensus.length + 1) / 2 ) + 1;

		return Boolean( consensus.length && count >= quorum );
	}


	// -------
	// Persistence

	/**
	 * Applies entries by persistently storing them in local database and/or
	 * processing command included with every entry.
	 *
	 * @note This method is exposed for externally starting entry application.
	 *
	 * @param {LogEntry[]} entries
	 * @returns {Promise}
	 */
	applyEntries( entries ) {
		return this.db.applyEntries( entries, this.applyTopologyCommands.bind( this ) );
	}

	applyTopologyCommands( commands ) {
		for ( let i = 0, length = commands.length; i < length; i++ ) {
			this.applyTopologyCommand( commands[i] );
		}
	}

	applyTopologyCommand( command ) {
		Debug( '%s: applying topology command: %j', this.id, command );

		switch ( command.type ) {
			case 'join' :
				if ( command.peer !== this.id.toString() ) {
					if ( this.peers.indexOf( command.peer ) === -1 ) {
						this.peers = this.peers.concat( command.peer );
					}
				}

				this.emit( 'joined', command.peer );
				break;

			case 'leave' :
				if ( this._leaving.indexOf( command.peer ) < 0 ) {
					this._leaving.push( command.peer );

					setTimeout( () => {
						this._segregatePeer( command.peer );
						this._leaving = this._leaving.filter( p => p !== command.peer );
					}, this.options.waitBeforeLeaveMS );
				}
				break;
		}
	}

	_segregatePeer( peer ) {
		Debug( '%s: segregating peer', this.id, peer );

		this.peers = this.peers.filter( p => p.toString() !== peer.toString() );

		Debug( '%s: peers now are: %j', this.id, this.peers );

		if ( this.requestOut ) {
			this.requestOut.disconnect( peer );
		}

		this.emit( 'left', peer );

		Debug( '%s: emitted left for peer', this.id, peer );
	}

	persist( done ) {
		Debug( '%s: persisting', this.id );
		this.db.persist( this, done );
	}
};
