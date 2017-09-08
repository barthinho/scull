'use strict';

const Debug = require( 'debug' )( 'skiff.states.candidate' );

const NodeState = require( './base' );

/**
 * Implements specific behaviour of a node in _candidate_ state.
 *
 * @type {NodeStateCandidate}
 * @name NodeStateCandidate
 */
module.exports = class NodeStateCandidate extends NodeState {
	constructor( node, options ) {
		super( node, 'candidate', options );
	}

	start() {
		super.start();

		const node = this.node;

		node.incrementTerm();

		// vote for self
		node.votedFor = node.id;

		process.nextTick( () => {
			Debug( 'gathering votes...' );

			const node = this.node;
			const heartbeat = this.heartbeatTimeout;
			const myId = node.id.toString();
			const log = node.log;

			let majorityReached = false;
			let votedForMe = 1;
			let voteCount = 1;

			maybeDone();

			node.peers.forEach( peer => {
				Debug( 'candidate requesting vote from %s', peer );

				const requestVoteArgs = {
					term: node.term,
					candidateId: myId,
					lastLogIndex: log.stats.lastIndex,
					lastLogTerm: log.stats.lastTerm
				};

				node.rpc( {
						to: peer,
						action: 'RequestVote',
						params: requestVoteArgs
					} )
					.then( reply => {
						voteCount++;
						if ( !this._stopped && reply && reply.params.voteGranted ) {
							votedForMe++;
							maybeDone();
						}
					}, () => {} );
			} );

			function maybeDone() {
				if ( !majorityReached ) {
					if ( node.isMajority( votedForMe ) ) {
						Debug( '%s: election won', myId );

						majorityReached = true;

						// accept election and become leader
						node.transition( 'leader' );
					} else if ( node.isMajority( voteCount - votedForMe ) ) {
						Debug( '%s: election lost', myId );

						majorityReached = true;

						// wait for heartbeat from new leader to become its
						// follower or start over as candidate in a new term
						heartbeat.restart();
					} else {
						Debug( 'still don\'t have majority' );
					}
				}
			}
		} );
	}
};
