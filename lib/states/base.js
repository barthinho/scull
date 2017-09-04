'use strict';

const EventEmitter = require( 'events' );

const Debug = require( 'debug' )( 'skiff.states.base' );
const Traffic = require( 'debug' )( 'skiff.traffic' );
const Async = require( 'async' );

const Timer = require( '../utils/timer' );


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
	// jshint -W098


	/**
	 * @param {Node} node
	 * @param {string} name
	 * @param {object<string,*>} options
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
					this._onHeartbeatTimeout.bind( this ),
					{
						min: options.electionTimeoutMinMS,
						max: options.electionTimeoutMaxMS,
					}
				)
			}
		} );

		this._stopped = true;
	}

	/**
	 * Marks state have been entered by associated node.
	 */
	start() {
		this._stopped = false;
		this.heartbeatTimeout.restart();
	}

	/**
	 * Marks associated node has left this state.
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
	 * @protected
	 */
	_onHeartbeatTimeout() {
		Debug( '%s: heartbeat timeout', this.node.id );

		// TODO remove this now deprecated name in favour of more suitable name 'heartbeat timeout' (as election hasn't timed out but timeout on heartbeat is reason for starting election)
		this.emit( 'election timeout' );
		this.emit( 'heartbeat timeout' );

		this.node.transition( 'candidate', true );
	}

	/**
	 * Implements code handling certain types of received commands.
	 *
	 * @param message
	 * @param done
	 */
	handleRequest( message, done ) {
		Debug( '%s: handling request %j', this.node.id, message );

		switch ( message.action ) {
			case 'AppendEntries':
				this._appendEntriesReceived( message, done );
				break;

			case 'RequestVote':
				this._requestVoteReceived( message, done );
				break;

			case 'InstallSnapshot':
				this._installSnapshotReceived( message, done );
				break;

			case 'Command':
				this._handleCommand( message, done );
				break;

			default:
				if ( this._handleRequest ) {
					this._handleRequest( message, done );
				} else {
					Debug( '%s: not handling message %j', this.node.id, message );
					done();
				}
		}
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
	 * @param {Message} message
	 * @param {function(error:?Error=)} done
	 * @private
	 */
	_handleCommand( message, done ) {
		done();

		Debug( 'handling command %j', message );
		this.node.command( message.params.command, message.params.options, ( err, result ) => {
			const currentTerm = this.node.term;
			if ( err ) {
				this.node.reply(
					message.from,
					message.id,
					{
						replyTo: 'Command',
						term: currentTerm,
						error: {
							message: err.message,
							code: err.code,
							leader: this.node.leader()
						}
					} );
			} else {
				this.node.reply(
					message.from,
					message.id,
					{
						replyTo: 'Command',
						term: currentTerm,
						result
					} );
			}
		} );
	}

	/**
	 * Handles received request for voting in favour of sending node as part of
	 * leader election.
	 *
	 * @param {Message} message
	 * @param {function(?error:Error=)} done
	 * @private
	 */
	_requestVoteReceived( message, done ) {
		const node = this.node;

		Debug( '%s: request vote received: %j', node.id, message );

		const voteGranted = this._perhapsGrantVote( message );
		if ( voteGranted ) {
			Debug( 'vote granted' );

			node.votedFor = message.from;

			this.heartbeatTimeout.restart();

			node.transition( 'follower', true );
		}

		node.reply(
			message.from,
			message.id,
			{
				term: node.term,
				voteGranted
			}, done );
	}

	_perhapsGrantVote( message ) {
		const node = this.node;
		const params = message.params;
		const me = node.id;
		const sender = message.from;
		const requestedTerm = params.term;
		const currentTerm = node.term;

		Debug( '%s: grant vote for %s leading in term #%d while on term #%d?', me, sender, requestedTerm, currentTerm );

		const votedFor = node.votedFor;

		if ( requestedTerm >= currentTerm ) {
			 if ( requestedTerm > currentTerm || !votedFor || ( votedFor === sender ) ) {
			 	if ( params.lastLogIndex >= node.log.stats.lastIndex ) {
			 		// grant vote
			 		return true;
			    }

			    Debug( '%s: vote rejected due to more advanced log', me );
			 } else {
			 	Debug( '%s: vote rejected due to having voted for different leader before', me );
			 }
		} else {
			Debug( '%s: vote for previous term rejected', me );
		}

		return false;
	}

	/**
	 * Handle received AppendEntries command serving as heartbeat as well.
	 *
	 * @param {Message} message
	 * @param {function(error)} done
	 * @private
	 */
	_appendEntriesReceived( message, done ) {
		const node = this.node;
		const log = node.log;
		const logStats = log.stats;
		const me = node.id;

		const params = message.params || {};
		const heartbeat = this.heartbeatTimeout;

		let reason;

		const requestedTerm = params.term;
		const onPreviousTerm = ( requestedTerm < node.term );
		if ( onPreviousTerm ) {
			reply( 'term is outdated' );
			return;
		}

		Traffic( '%s got %s HEARTBEAT', me, onPreviousTerm ? 'invalid' : 'valid', onPreviousTerm ? null : params.entries );

		heartbeat.restart();


		/*
		 * validate provided entries to properly continue our log
		 */

		let { prevLogIndex, prevLogTerm, entries: providedEntries } = params;
		let validContinuation = true;
		let previous;

		prevLogIndex = parseInt( prevLogIndex );
		if ( prevLogIndex > -1 ) {
			if ( prevLogIndex > 0 ) {
				previous = log.atIndex( prevLogIndex );
				if ( previous ) {
					// got recently pushed entry in local log
					// -> check if it's matching by index and by term
					validContinuation &= ( previous.i === prevLogIndex && previous.t === prevLogTerm );
				} else if ( logStats.lastIndex > 0 ) {
					// log is empty, but seems to have processed indices before
					// -> it happens on restarting log after installing snapshot
					//    -> check if previous index and term of leader is matching
					validContinuation &= ( logStats.lastIndex === prevLogIndex && logStats.lastTerm === prevLogTerm );

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
					reason = 'local log is empty, need a snapshot first';
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
						validContinuation &= ( provided.i === local.i && provided.t === local.t );
						previous = local;
					} else {
						// check if provided entry continues previous one
						validContinuation &= ( provided.i === previous.i + 1 && provided.t >= previous.t && provided.t === requestedTerm );
						previous = provided;
					}

					if ( !validContinuation ) {
						Debug( '%s: improper continuation of log rejected: #%d requested vs. %s is index %d/%d and term %d/%d', me, i, local ? 'locally applied' : 'previous', provided.i, ( local || previous ).i, provided.t, ( local || previous ).t );
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
			Debug( '%s: append entries after #%d: %j', me, prevLogIndex, providedEntries );

			log.appendAfter( prevLogIndex || 0, providedEntries );

			const myCommit = logStats.committedIndex;
			const leaderCommit = params.leaderCommit;
			if ( leaderCommit > myCommit ) {
				Debug( '%s: syncing commitment: %d -> %d', me, myCommit, leaderCommit );

				// suspend heartbeat timeout while writing database and
				// processing logged commands
				heartbeat.enabled = false;

				log.commit( leaderCommit, error => {
					heartbeat.restart();

					if ( error ) {
						reply( error.message );
					} else {
						reply( null, prevLogIndex > 0 ? previous : null );
					}
				} );
			} else {
				reply( null, prevLogIndex > 0 ? previous : null );
			}

			return;
		} else {
			if ( !reason ) {
				reason = 'provided entries don\'t properly continue log';
			}
		}

		reply( reason );


		function reply( error, previousEntry ) {
			const response = {
				replyTo: 'AppendEntries',
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

				Debug( '%s: AppendEntries replying on error "%s" awaiting #%d next', message.to, error, response.nextLogIndex );
			} else {
				response.success = 1;
				response.nextLogIndex = log.stats.lastIndex + 1;

				Debug( '%s: AppendEntries replying on success awaiting #%d next', message.to, response.nextLogIndex );
			}

			node.reply( message.from, message.id, response, done );

/*
			if ( !onPreviousTerm ) {
				heartbeat.restart();
			}
*/

			if ( !error ) {
				node.transition( 'follower' );
			}
		}
	}

	/**
	 * Handles incoming request for taking copy of leader's database as built by
	 * previous commands applied in cluster to catch up and become consistent
	 * with cluster's current state machine.
	 *
	 * @param {Message} message
	 * @param {function(error:Error)} done
	 * @private
	 */
	_installSnapshotReceived( message, done ) {
		const node = this.node;

		Debug( '%s: _installSnapshotReceived', node.id );

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
			node.reply( message.from, message.id, {
				replyTo: 'InstallSnapshot',
				term: node.term,
				lastIndex: params.lastIndex,
				lastTerm: params.lastTerm,
			}, done );

			return;
		}

		if ( params.offset === 0 ) {
			tasks.push( db.clear.bind( db ) );
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
				node.emit( 'up-to-date' );
				done();
			} );
		}

		Async.series( tasks, done );

		function insertData( cb ) {
			const data = params.data;
			if ( !data || !data.length ) {
				cb();
			} else {
				db.batch( data, cb );
			}
		}

		function reply( cb ) {
			node.reply(
				message.from,
				message.id,
				{
					replyTo: 'InstallSnapshot',
					term: node.term
				},
				cb );

			heartbeat.restart();
		}
	}

	/**
	 * Updates list of peers following this leader to match provided one.
	 *
	 * @param {(Address|string)[]} addresses
	 * @abstract
	 */
	updatePeers( addresses ) {}
};
