"use strict";

const EventEmitter = require( "events" );

const Debug = require( "debug" )( "scull.states.base" );
const Traffic = require( "debug" )( "scull.traffic" );
const ConsensusDebug = require( "debug" )( "scull.consensus" );
const ElectionDebug = require( "debug" )( "scull.election" );
const SnapshotDebug = require( "debug" )( "scull.snapshot" );
const PromiseTool = require( "promise-essentials" );

const Timer = require( "../utils/timer" );


/**
 * Implements common behaviour of a node basically related to its state in
 * cluster.
 *
 * @type {NodeState}
 * @name NodeState
 * @property {Node} node excerpt of associated node's API
 * @property {object<string,*>} options
 * @property {boolean} _stopped true if state has been stopped (a.k.a. "associated node has left this state") before
 * @property {Timer} heartbeatTimeout detects timeout on waiting for another heartbeat sent by current leader
 * @abstract
 */
module.exports = class NodeState extends EventEmitter {

	 /**
	 * @param {Node} node reference on local node's basic manager
	 * @param {string} name actual name of current state
	 * @param {object} options customizing options
	 */
	constructor( node, name, options ) {
		super();

		options = Object.assign( {}, options );

		Object.defineProperties( this, {
			node: { value: node },
			name: { value: name },
			options: { value: options },
			heartbeatTimeout: {
				value: new Timer(
					() => this._onHeartbeatTimeout(),
					{
						min: options.heartbeatTimeoutMinMS,
						max: options.heartbeatTimeoutMaxMS,
						label: options.timerLabel || "heartbeat",
					}
				)
			}
		} );

		this._stopped = true;
	}

	/**
	 * Marks state have been entered by associated node.
	 *
	 * @returns {void}
	 */
	start() {
		this._stopped = false;
		this.heartbeatTimeout.restart();
	}

	/**
	 * Marks associated node has left this state.
	 *
	 * @returns {void}
	 */
	stop() {
		this._stopped = true;
		this.heartbeatTimeout.enabled = false;
	}

	/**
	 * Current node hasn't received heartbeat from current leader of cluster.
	 *
	 * This method is starting node's transition to "candidate" state for
	 * starting new term proposing itself as candidate for that term's leader.
	 *
	 * @returns {void}
	 * @protected
	 */
	_onHeartbeatTimeout() {
		Debug( "%s: heartbeat timeout", this.node.id );

		this.emit( "heartbeat timeout" );

		this.node.transition( "candidate", true );
	}

	/**
	 * Implements code handling certain types of received commands.
	 *
	 * @param {object} message received message describing request to be handled
	 * @returns {Promise} promises request handled
	 */
	handleRequest( message ) {
		Debug( "%s: handling request %j", this.node.id, message );

		switch ( message.action ) {
			case "AppendEntries" :
				return this._appendEntriesReceived( message );

			case "RequestVote" :
				this._requestVoteReceived( message );
				return Promise.resolve();

			case "InstallSnapshot" :
				return this._installSnapshotReceived( message );

			case "Command" :
				return this._handleCommand( message );

			default :
				return this._handleCustomRequest( message );
		}
	}

	/**
	 * Handles custom requests.
	 *
	 * @note This method is provided to be overloaded in inherited state
	 *       implementations.
	 *
	 * @param {object} message message describing custom request to be handled
	 * @returns {Promise} promises custom request handled
	 * @protected
	 */
	_handleCustomRequest( message ) {
		Debug( "%s: not handling message %j", this.node.id, message );

		return Promise.resolve();
	}

	/**
	 * @typedef {object} Message
	 * @property {string} type one out of "request", "reply" or "command"
	 * @property {string} [replyTo] type of request reply is related to
	 * @property {Number} term term message belongs to
	 * @property {MessageError} [error]
	 * @property {string} from ID/address of sending node
	 * @property {string} to ID/address of receiving node
	 * @property {string} id UUID of message
	 * @property {object<string,string>} params
	 */

	/**
	 * @typedef {object} MessageError
	 * @property {string} message
	 * @property {Number} code
	 * @property {string} leader ID/address of leader
	 */

	/**
	 * Handles received cluster-specific command affecting cluster's eventually
	 * consistent state machine.
	 *
	 * @param {Message} message message describing command to be handled
	 * @returns {Promise} promises having processed command and sent reply to peer
	 * @private
	 */
	_handleCommand( message ) {
		Debug( "handling command %j", message );

		return this.node.command( message.params.command, message.params.options )
			.then( result => this.node.reply(
				message.from,
				message.id,
				{
					replyTo: "Command",
					term: this.node.term,
					result
				} )
			)
			.catch( error => this.node.reply(
				message.from,
				message.id,
				{
					replyTo: "Command",
					term: this.node.term,
					error: {
						message: error.message,
						code: error.code,
						leader: this.node.leader,
					}
				} )
			);
	}

	/**
	 * Handles received request for voting in favour of sending node as part of
	 * leader election.
	 *
	 * @param {Message} message description of request for voting in an election
	 * @returns {Promise} promises having processed request for voting
	 * @private
	 */
	_requestVoteReceived( message ) {
		const node = this.node;

		const voteGranted = this.isGrantableVote( message );
		if ( voteGranted ) {
			ElectionDebug( `${node.id} grants vote for ${message.from} to become leader` );

			node.votedFor = message.from;

			this.heartbeatTimeout.restart();

			node.transition( "follower", true );
		} else {
			ElectionDebug( `${node.id} rejects vote for ${message.from} to become leader` );
		}

		return node.reply(
			message.from,
			message.id,
			{
				term: node.term,
				voteGranted
			} );
	}

	/**
	 * Detects if current request is describing vote that can be granted.
	 *
	 * @param {object} message message describing request for voting
	 * @returns {boolean} true if request is eligible for granting vote
	 * @protected
	 */
	isGrantableVote( message ) {
		const { node } = this;
		const { from: sender, params: { term: requestedTerm, lastLogIndex: requestedLogIndex, lastLogTerm: requestedLogTerm } } = message;
		const { id: me, term: myTerm, votedFor, log: { stats } } = node;

		if ( requestedTerm >= myTerm ) {
			if ( requestedTerm > myTerm || !votedFor || ( votedFor === sender ) ) {
				if ( requestedLogIndex >= stats.lastAppliedIndex && requestedLogTerm >= stats.lastAppliedTerm ) {
					ConsensusDebug( `${me}: GRANTING vote for ${sender} to lead in term #${requestedTerm} while in term #${myTerm}` );
					return true;
				}

				ConsensusDebug( `${me}: REJECTING vote for ${sender} to lead in term #${requestedTerm} while in term #${myTerm} due to more advanced log` );
			} else {
				ConsensusDebug( `${me}: REJECTING vote for ${sender} to lead in term #${requestedTerm} while in term #${myTerm} due to having voted for different leader before` ); // eslint-disable-line max-len
			}
		} else {
			ConsensusDebug( `${me}: REJECTING vote for ${sender} to lead in term #${requestedTerm} while in term #${myTerm} due to obsolete term` );
		}

		return false;
	}

	/**
	 * Handle received `AppendEntries` command serving as heartbeat as well.
	 *
	 * @param {Message} message message describing entries to be appended to log
	 * @returns {Promise} promises request for appending entries has been processed
	 * @private
	 */
	_appendEntriesReceived( message ) {
		const node = this.node;
		const log = node.log;
		const logStats = log.stats;
		const me = node.id;

		const params = message.params || {};
		const heartbeat = this.heartbeatTimeout;

		let reason;

		const requestedTerm = params.term;
		const onPreviousTerm = requestedTerm < node.term;
		if ( onPreviousTerm ) {
			return reply( "term is outdated" );
		}

		Traffic( "%s got %s HEARTBEAT", me, onPreviousTerm ? "invalid" : "valid", onPreviousTerm ? null : params.entries );

		heartbeat.restart();


		/*
		 * validate provided entries to properly continue our log
		 */

		const { prevLogTerm, entries: providedEntries } = params;
		let { prevLogIndex } = params;
		let validContinuation = true;
		let previous;

		prevLogIndex = parseInt( prevLogIndex );
		if ( prevLogIndex > -1 ) {
			if ( prevLogIndex > 0 ) {
				previous = log.atIndex( prevLogIndex );
				if ( previous ) {
					// got recently pushed entry in local log
					// -> check if it's matching by index and by term
					validContinuation &= previous.i === prevLogIndex && previous.t === prevLogTerm;
				} else if ( logStats.lastIndex > 0 ) {
					// log is empty, but seems to have processed indices before
					// -> it happens on restarting log after installing snapshot
					//    -> check if previous index and term of leader is matching
					validContinuation &= logStats.lastIndex === prevLogIndex && logStats.lastTerm === prevLogTerm;

					// fake object to serve as `previous` on checking first
					// provided entry continuing properly due to failed reading
					// it from log before
					if ( validContinuation ) {
						previous = { i: prevLogIndex, t: prevLogTerm };
					}
				} else {
					// local log does not contain selected entry (anymore)
					// -> log can't be empty unless node was starting freshly
					//    -> reject to accept here
					validContinuation = false;
					reason = "local log is empty, need a snapshot first";
				}
			} else {
				// fake object to serve as `previous` on checking first
				// provided entry continuing properly due to failed reading
				// it from log before
				previous = { i: 0, t: 1 };
			}

			if ( validContinuation ) {
				// also check if provided entries continue properly

				// extract affected entries applied locally before for
				// detecting unexpected changes in provided entries
				const locallyAppliedEntries = log.entriesFromTo( prevLogIndex + 1, logStats.lastAppliedIndex );

				for ( let i = 0, length = providedEntries.length; i < length; i++ ) {
					const local = locallyAppliedEntries[i];
					const provided = providedEntries[i];

					if ( local ) {
						// applied entry with same index before
						// -> check if provided entry still matches
						// TODO Extend test below to include comparison of command for detecting change of already applied entries.
						validContinuation &= provided.i === local.i && provided.t === local.t;
						previous = local;
					} else {
						// check if provided entry continues previous one
						validContinuation &= provided.i === previous.i + 1 && provided.t >= previous.t && provided.t === requestedTerm;
						previous = provided;
					}

					if ( !validContinuation ) {
						Debug( "%s: improper continuation of log rejected: #%d requested vs. %s is index %d/%d and term %d/%d", me, i, local ? "locally applied" : "previous", provided.i, ( local || previous ).i, provided.t, ( local || previous ).t );
						// don't waste time
						break;
					}
				}

				if ( validContinuation ) {
					// fix provided data to exclude recently applied entries
					// on appending to local log below
					const locallyAppliedCount = locallyAppliedEntries.length;
					if ( locallyAppliedCount > 0 ) {
						providedEntries.splice( 0, locallyAppliedCount );
						prevLogIndex += locallyAppliedCount;
					}
				}
			}
		} else {
			// `prevLogIndex` does not contain any valid number
			// -> use `0` by default
			prevLogIndex = 0;
		}


		/*
		 * accept valid entries by appending to local log and committing log
		 */
		if ( validContinuation ) {
			Debug( "%s: append entries after #%d: %j", me, prevLogIndex, providedEntries );

			log.appendAfter( prevLogIndex || 0, providedEntries );

			const myCommit = logStats.committedIndex;
			const leaderCommit = params.leaderCommit;
			if ( leaderCommit > myCommit ) {
				Debug( "%s: syncing commitment: %d -> %d", me, myCommit, leaderCommit );

				// suspend heartbeat timeout while writing database and
				// processing logged commands
				heartbeat.enabled = false;

				return log.commit( leaderCommit )
					.then( () => {
						heartbeat.restart();
						return reply( null, prevLogIndex > 0 ? previous : null );
					}, error => {
						heartbeat.restart();
						return reply( error.message );
					} );
			}

			return reply( null, prevLogIndex > 0 ? previous : null );
		}

		if ( !reason ) {
			reason = "provided entries don't properly continue log";
		}

		return reply( reason );


		/**
		 * Replies to processes request for appending entries.
		 *
		 * @param {?Error} error description of optionally encountered error
		 * @param {?object} previousEntry latest available entry in local log
		 * @returns {Promise} promises reply sent to peer
		 */
		function reply( error, previousEntry = null ) {
			const response = {
				replyTo: "AppendEntries",
				term: requestedTerm,
			};

			if ( error ) {
				response.success = 0;
				response.reason = error;

				if ( previousEntry ) {
					response.nextLogIndex = log.lastIndexForTerm( previousEntry.t );
				} else {
					response.nextLogIndex = 0;
				}

				Debug( "%s: AppendEntries replying on error \"%s\" awaiting #%d next", message.to, error, response.nextLogIndex );
			} else {
				response.success = 1;
				response.nextLogIndex = log.stats.lastIndex + 1;

				Debug( "%s: AppendEntries replying on success awaiting #%d next", message.to, response.nextLogIndex );
			}

			const promise = node.reply( message.from, message.id, response );

			if ( !error ) {
				node.transition( "follower" );
			}

			return promise;
		}
	}

	/**
	 * Handles incoming request for taking copy of leader's database as built by
	 * previous commands applied in cluster to catch up and become consistent
	 * with cluster's current state machine.
	 *
	 * @param {Message} message message describing request for writing slice of data
	 * @returns {Promise} promises having processed sent part of snapshot
	 * @private
	 */
	_installSnapshotReceived( message ) {
		const node = this.node;

		SnapshotDebug( `${node.id} receiving from ${message.from}: %j`, message.params );

		const db = node.db.state;
		const heartbeat = this.heartbeatTimeout;

		heartbeat.restart();

		const tasks = [];
		const params = message.params || {};

		if ( params.probe && params.lastIndex && params.lastTerm ) {
			// got a probe request for starting installation of snapshot
			// -> acknowledge this by sending back provided index and term to
			//    actually start snapshot transmission if index and term are
			//    still applicable
			return node.reply( message.from, message.id, {
				replyTo: "InstallSnapshot",
				term: node.term,
				lastIndex: params.lastIndex,
				lastTerm: params.lastTerm,
			} );
		}

		if ( params.offset === 0 ) {
			tasks.push( () => db.clear() );
		}

		tasks.push( insertData );
		tasks.push( reply );

		if ( params.done ) {
			node.log.restart( [], params.lastIndex, params.lastTerm );

			if ( params.peers ) {
				// got current list of nodes in cluster

				if ( params.leaderId ) {
					// leader has been provided separately to prevent waste of
					// bandwidth due to redundant information -> re-integrate
					params.peers.push( params.leaderId );
				}

				node.peers = params.peers;
			}
		}

		if ( params.done ) {
			tasks.push( done => {
				node.emit( "up-to-date" );
				done();
			} );
		}

		return PromiseTool.each( tasks );

		/**
		 * Inserts provided excerpt of state's snapshot into database.
		 *
		 * @return {?Promise} promises excerpt inserted into database
		 */
		function insertData() {
			const data = params.data;
			if ( data && data.length ) {
				return new Promise( ( resolve, reject ) => {
					db.batch( data, error => ( error ? reject( error ) : resolve() ) );
				} );
			}

			return null;
		}

		/**
		 * Sends reply to request to requesting peer.
		 *
		 * @returns {Promise} promises reply sent to peer
		 */
		function reply() {
			heartbeat.restart();

			return node.reply(
				message.from,
				message.id,
				{
					replyTo: "InstallSnapshot",
					term: node.term
				} );
		}
	}

	/**
	 * Updates list of peers following this leader to match provided one.
	 *
	 * @param {Nodes} peers refers to manager of currently valid nodes
	 * @param {{add:Address}|{remove:Address}} change describes actual change
	 * @returns {void}
	 */
	updatePeers( peers, change ) {} // eslint-disable-line no-unused-vars, no-empty-function
};
