"use strict";

const Debug = require( "debug" );

const NodeState = require( "./base" );


const ElectionDebug = Debug( "scull:election" );


/**
 * Implements specific behaviour of a node in _candidate_ state.
 */
class NodeStateCandidate extends NodeState {
	/**
	 * @param {Node} node reference on local node's basic manager
	 * @param {object} options customizing options
	 */
	constructor( node, options ) {
		super( node, "candidate", Object.assign( {}, options, {
			heartbeatTimeoutMinMS: 500,
			heartbeatTimeoutMaxMS: 1000,
			timerLabel: "election",
		} ) );
	}

	/** @inheritDoc */
	start() {
		super.start();

		const { node } = this;
		const { id } = node;

		node.incrementTerm();

		// vote for self
		node.votedFor = id;

		process.nextTick( () => {
			ElectionDebug( `${id} enters election for term #${node.term}` );

			const heartbeat = this.heartbeatTimeout;
			const myId = id.toString();
			const log = node.log;

			let majorityReached = false;
			let votedForMe = 1;
			let voteCount = 1;

			maybeDone();

			node.peers.addresses.forEach( peer => {
				ElectionDebug( `requesting vote from ${peer}` );

				const requestVoteArgs = {
					term: node.term,
					candidateId: myId,
					lastLogIndex: log.stats.lastIndex,
					lastLogTerm: log.stats.lastTerm
				};

				node.network.getPeer( peer )
					.call( "RequestVote", requestVoteArgs )
					.then( reply => {
						voteCount++;

						ElectionDebug( `${myId} ${reply.voteGranted ? "APPROVED" : "REJECTED"} by ${peer}` );

						if ( !this._stopped && reply && reply.voteGranted ) {
							votedForMe++;

							maybeDone();
						}
					} )
					.catch( () => {} ); // eslint-disable-line no-empty-function
			} );

			/**
			 * Post-processes receival of another vote probably resulting in
			 * election passed or lost.
			 *
			 * @returns {void}
			 */
			function maybeDone() {
				if ( !majorityReached ) {
					if ( node.isMajority( true, votedForMe ) ) {
						ElectionDebug( `${myId} has won` );

						majorityReached = true;

						// accept election and become leader
						node.transition( "leader" );
					} else if ( node.isMajority( false, voteCount - votedForMe ) ) {
						ElectionDebug( `${myId} has lost` );

						majorityReached = true;

						// wait for heartbeat from new leader to become its
						// follower or start over as candidate in a new term
						heartbeat.restart();
					} else {
						ElectionDebug( "waiting for result" );
					}
				}
			}
		} );
	}
}

module.exports = NodeStateCandidate;
