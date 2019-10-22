"use strict";

const EventEmitter = require( "events" );

const Debug = require( "debug" );
const PromiseTool = require( "promise-essentials" );

const Timer = require( "../utils/timer" );
const NodeCommands = require( "../commands" );


const DebugLog = Debug( "scull:states:base" );
const TrafficLog = Debug( "scull:traffic" );
const ConsensusLog = Debug( "scull:consensus" );
const ElectionLog = Debug( "scull:election" );
const SnapshotLog = Debug( "scull:snapshot" );
const ErrorLog = Debug( "scull:error" );


/**
 * Implements common behaviour of a node basically related to its state in
 * cluster.
 *
 * @property {Node} node excerpt of associated node's API
 * @property {object<string,*>} options
 * @property {boolean} _stopped true if state has been stopped (a.k.a. "associated node has left this state") before
 * @property {Timer} heartbeatTimeout detects timeout on waiting for another heartbeat sent by current leader
 * @abstract
 */
class NodeState extends EventEmitter {

	/**
	 * @param {Node} node reference on local node's basic manager
	 * @param {string} name actual name of current state
	 * @param {object} options customizing options
	 */
	constructor( node, name, options ) {
		super();

		const _options = Object.assign( {}, options );

		Object.defineProperties( this, {
			node: { value: node },
			name: { value: name },
			options: { value: _options },
			heartbeatTimeout: {
				value: new Timer(
					() => this._onHeartbeatTimeout(),
					{
						min: _options.heartbeatTimeoutMinMS,
						max: _options.heartbeatTimeoutMaxMS,
						label: _options.timerLabel || "heartbeat",
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
		DebugLog( "%s: heartbeat timeout", this.node.id );

		this.emit( "heartbeat timeout" );

		this.node.transition( "candidate", true );
	}

	/**
	 * Implements code handling certain types of received commands.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {string} action name of requested action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 */
	handleRequest( from, action, params ) {
		DebugLog( `${this.node.id}: handling request "${action}" from ${from} with %j"`, params );

		switch ( action ) {
			case "AppendEntries" :
				return this.handleAppendEntries( from, params );

			case "InstallSnapshot" :
				return this.handleInstallSnapshot( from, params );

			case "Command" :
				return this.handleCommand( from, params );

			default :
				return this.handleCustomRequest( from, action, params );
		}
	}

	/**
	 * Handles custom requests.
	 *
	 * @note This method is provided to be overloaded in inherited state
	 *       implementations.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {string} action name of requested action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 * @protected
	 */
	handleCustomRequest( from, action, params ) {
		DebugLog( `${this.node.id}: not handling "${action}" from ${from} with %j`, params );

		return Promise.resolve();
	}

	/**
	 * Handles received cluster-specific command affecting cluster's eventually
	 * consistent state machine.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 * @private
	 */
	handleCommand( from, params ) {
		const { name, args, options } = params;
		const CommandImpl = NodeCommands.getCommandByName( name );

		if ( !CommandImpl ) {
			ErrorLog( `ignoring forwarding of unknown command "${name}" with arguments %j`, args );

			return Promise.reject( new Error( `ignoring forwarding of unknown command "${name}"` ) );
		}

		DebugLog( `handling forwarded command "${name}" with args %j and options %j`, args, options );

		return this.node.command( CommandImpl.recoverForwarded( args, options ) )
			.then( result => ( {
				term: this.node.term,
				result,
			} ) )
			.catch( error => {
				error.term = this.node.term;
				error.leader = this.node.leader;

				throw error;
			} );
	}

	/**
	 * Handles received request for voting in favour of sending node as part of
	 * leader election.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 */
	castVote( from, params ) {
		const node = this.node;

		const voteGranted = this.isGrantableVote( from, params );
		if ( voteGranted ) {
			ElectionLog( `${node.id} grants vote for ${from} to become leader` );

			node.votedFor = from;

			this.heartbeatTimeout.restart();

			node.transition( "follower", true );
		} else {
			ElectionLog( `${node.id} rejects vote for ${from} to become leader` );
		}

		return Promise.resolve( {
			term: node.term,
			voteGranted,
		} );
	}

	/**
	 * Detects if current request is describing vote that can be granted.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {object} params input parameters for requested action
	 * @returns {boolean} true if request is eligible for granting vote
	 * @protected
	 */
	isGrantableVote( from, params ) {
		const { node } = this;
		const { id: me, term: myTerm, votedFor, log: { stats } } = node;
		const { term: requestedTerm, lastLogIndex: requestedLogIndex, lastLogTerm: requestedLogTerm } = params;

		if ( requestedTerm >= myTerm ) {
			if ( requestedTerm > myTerm || !votedFor || votedFor.matches( from ) ) {
				if ( requestedLogIndex >= stats.lastAppliedIndex && requestedLogTerm >= stats.lastAppliedTerm ) {
					ConsensusLog( `${me}: GRANTING vote for ${from} to lead in term #${requestedTerm} while in term #${myTerm}` );
					return true;
				}

				ConsensusLog( `${me}: REJECTING vote for ${from} to lead in term #${requestedTerm} while in term #${myTerm} due to more advanced log` );
			} else {
				ConsensusLog( `${me}: REJECTING vote for ${from} to lead in term #${requestedTerm} while in term #${myTerm} due to having voted for different leader before` ); // eslint-disable-line max-len
			}
		} else {
			ConsensusLog( `${me}: REJECTING vote for ${from} to lead in term #${requestedTerm} while in term #${myTerm} due to obsolete term` );
		}

		return false;
	}

	/**
	 * Handle received `AppendEntries` command serving as heartbeat as well.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 * @private
	 */
	handleAppendEntries( from, params ) {
		const node = this.node;
		const log = node.log;
		const logStats = log.stats;
		const me = node.id;

		const heartbeat = this.heartbeatTimeout;

		let reason;

		const requestedTerm = params.term;
		const onPreviousTerm = requestedTerm < node.term;
		if ( onPreviousTerm ) {
			return reply( "term is outdated" );
		}

		TrafficLog( "%s got %s HEARTBEAT", me, onPreviousTerm ? "invalid" : "valid", onPreviousTerm ? null : params.entries );

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
						DebugLog( "%s: improper continuation of log rejected: #%d requested vs. %s is index %d/%d and term %d/%d", me, i, local ? "locally applied" : "previous", provided.i, ( local || previous ).i, provided.t, ( local || previous ).t );
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
			DebugLog( "%s: append entries after #%d: %j", me, prevLogIndex, providedEntries );

			log.appendAfter( prevLogIndex || 0, providedEntries );

			const myCommit = logStats.committedIndex;
			const leaderCommit = params.leaderCommit;
			if ( leaderCommit > myCommit ) {
				DebugLog( "%s: syncing commitment: %d -> %d", me, myCommit, leaderCommit );

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
		 * @param {?string} issue describes issue encountered with incoming AppendEntries request
		 * @param {?object} previousEntry latest available entry in local log
		 * @returns {Promise} promises reply sent to peer
		 */
		function reply( issue, previousEntry = null ) {
			const result = {
				term: requestedTerm,
				nextLogIndex: issue ? previousEntry ? log.lastIndexForTerm( previousEntry.t ) : 0 : log.stats.lastIndex + 1,
			};

			if ( issue ) {
				DebugLog( `${me}: AppendEntries replying on error "${issue}" awaiting #${result.nextLogIndex} next` );

				result.issue = issue;
			} else {
				DebugLog( `${me}: AppendEntries replying on success awaiting #${result.nextLogIndex} next` );

				node.transition( "follower" );
			}

			return Promise.resolve( result );
		}
	}

	/**
	 * Handles incoming request for taking copy of leader's database as built by
	 * previous commands applied in cluster to catch up and become consistent
	 * with cluster's current state machine.
	 *
	 * @param {Address} from address of peer requesting some action
	 * @param {object} params input parameters for requested action
	 * @returns {Promise} promises result of handled request
	 * @private
	 */
	handleInstallSnapshot( from, params ) {
		const node = this.node;

		SnapshotLog( `${node.id} receiving from ${from}: %j`, params );

		const db = node.db.state;
		const heartbeat = this.heartbeatTimeout;

		heartbeat.restart();

		const tasks = [
			insertData,
			() => { heartbeat.restart(); },
		];

		if ( params.offset === 0 ) {
			tasks.unshift( () => db.clear() );
		}

		if ( params.done ) {
			node.log.restart( [], params.lastIndex, params.lastTerm );

			if ( params.peers ) {
				// got current list of nodes in cluster

				const peers = params.peers.slice( 0 );
				if ( params.leaderId ) {
					// leader has been provided separately to prevent waste of
					// bandwidth due to redundant information -> re-integrate
					peers.push( params.leaderId );
				}

				node.peers.addresses
					.forEach( address => {
						if ( !peers.some( peer => address.matches( peer ) ) ) {
							node.peers.remove( address );
						}
					} );

				peers.forEach( peer => {
					if ( !node.peers.has( peer ) ) {
						node.peers.add( peer );
					}
				} );
			}

			tasks.push( () => {
				node.emit( "up-to-date" );
			} );
		}

		return PromiseTool.each( tasks, callback => callback() )
			.then( () => ( {
				term: node.term,
			} ) )
			.catch( error => {
				ErrorLog( `${node.id} snapshot failed:`, error.stack );
				throw error;
			} );

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
	}

	/**
	 * Adjusts list of peer nodes in cluster.
	 *
	 * @param {Nodes} peers manages list of peer nodes
	 * @param {{add:Address}|{remove:Address}} change describes actual change
	 * @returns {void}
	 */
	updatePeers( peers, change ) {} // eslint-disable-line no-unused-vars, no-empty-function
}

module.exports = NodeState;
