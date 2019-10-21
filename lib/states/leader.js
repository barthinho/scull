"use strict";

const ConsensusLog = require( "debug" )( "scull:consensus" );
const PromiseUtil = require( "promise-essentials" );

const NodeState = require( "./base" );
const PeerLeader = require( "../peer-leader" );

/**
 * Implements specific behaviour of a node in _leader_ state.
 *
 * @property {object<string,PeerLeader>} _followers set of controllers each
 *           managing communication with one of current cluster's nodes
 *           following this leader node
 */
class NodeStateLeader extends NodeState {
	/**
	 * @param {Node} node manager of local node of cluster
	 * @param {object} options customizations
	 */
	constructor( node, options ) {
		super( node, "leader", Object.assign( {}, options ) );
	}

	/** @inheritDoc */
	start() {
		const { node } = this;
		const { addresses } = node.peers;

		const numPeers = addresses.length;
		const peers = new Array( numPeers );
		const followers = {};

		for ( let i = 0; i < numPeers; i++ ) {
			const address = String( addresses[i] );

			peers[i] = address;
			followers[address] = new PeerLeader( address, node, this.options );
		}

		this._followers = followers;

		super.start();

		this._waitForConsensus( node.log.stats.committedIndex, {}, peers )
			.then( () => {
				ConsensusLog( `REACHED on ${node.id} becoming leader w/ log index #${node.log.stats.committedIndex}` );
			} )
			.catch( error => {
				ConsensusLog( `FAILED on ${node.id} becoming leader w/ log index #${node.log.stats.committedIndex}: ${error.stack}` );
			} );
	}

	/** @inheritDoc */
	stop() {
		const addresses = Object.keys( this._followers );

		for ( let i = 0, length = addresses.length; i < length; i++ ) {
			const address = addresses[i];
			const follower = this._followers[address];

			if ( follower ) {
				follower.stop();
				follower.removeAllListeners();
			}
		}

		this._followers = {};

		super.stop();
	}

	/** @inheritDoc */
	updatePeers( peer, change ) {
		if ( change.add ) {
			const address = String( change.add );
			this._followers[address] = new PeerLeader( address, this.node, this.options );
		} else if ( change.remove ) {
			const address = String( change.remove );
			const follower = this._followers[address];
			if ( follower ) {
				follower.stop();
				follower.removeAllListeners();
				this._followers[address] = undefined;
			}
		}
	}

	/**
	 * Lists information of all peer nodes following this leader.
	 *
	 * @returns {object[]} lists stats per peer node
	 */
	peers() {
		const addresses = Object.keys( this._followers );
		const length = addresses.length;
		const states = new Array( length );

		for ( let i = 0; i < length; i++ ) {
			const address = addresses[i];

			states[i] = this._followers[address].state();
		}

		return states;
	}

	/**
	 * Seeks consensus between all nodes of cluster for executing given command.
	 *
	 * Processes provided command locally by appending it to cluster-wide log
	 * file, then asking nodes of cluster for consensus before committing log
	 * and applying command to current state of cluster.
	 *
	 * @note This method supports seeking multiple consensuses with different
	 *       sets of nodes eligible to vote. This is used on changing cluster's
	 *       topology by means of joining or leaving nodes.
	 *
	 * @param {Array<Address>[]} consensuses one or more sets of nodes eligible to vote in search for consensus
	 * @param {AbstractCommand} command actual command to be performed, might include options demanding votes from particular nodes
	 * @returns {Promise} promises consensuses reached and command persistently tracked in log
	 */
	seekConsensus( consensuses, command = null ) {
		const { log } = this.node;
		const index = command ? log.push( command.toJSON() ) : log.stats.lastIndex;

		ConsensusLog( `SEEKING ${consensuses.length} consensus(es) for ${command} at log #${index}` );

		return PromiseUtil.each( consensuses, ( consensus, cIndex ) => this._waitForConsensus( index, command.options, consensus, cIndex + 1 ) )
			.then( () => {
				ConsensusLog( `REACHED ${consensuses.length} consensus(es) for ${command} at log #${index}` );

				return log.commit( index );
			} );
	}

	/**
	 * @typedef {object} WaitForConsensusOptions
	 * @property {string|string[]} [alsoWaitFor] lists addresses of peers to wait
	 *           for consensus explicitly (in addition to requiring majority of
	 *           nodes to commit)
	 */

	/**
	 * Implements code for requesting consensus commitment from a majority of
	 * nodes.
	 *
	 * @param {int} waitingForIndex log index this consensus is intended for
	 * @param {WaitForConsensusOptions} options options customizing requirements on consensus
	 * @param {Address[]} consensusPeers lists peers with a vote in current request for consensus
	 * @param {int} consensusIndex index of current consensus in a series of required consensuses (starting at 1)
	 * @param {int} numConsensuses number of required consensuses in a series
	 * @returns {Promise} promises achieved consensus
	 * @private
	 */
	_waitForConsensus( waitingForIndex, options, consensusPeers, consensusIndex = 1, numConsensuses = 1 ) {
		return new Promise( ( resolve, reject ) => {
			const { node } = this;

			// normalize list of peers required to cast vote explicitly
			let demandVoteFrom = options.alsoWaitFor;
			if ( Array.isArray( demandVoteFrom ) ) {
				demandVoteFrom = demandVoteFrom.slice( 0 );
			} else {
				demandVoteFrom = [demandVoteFrom];
			}

			// drop demands for vote cast by current node (for assuming it implicitly below)
			const myAddress = node.id;
			for ( let di = 0, numDemands = demandVoteFrom.length; di < numDemands; di++ ) {
				const demand = demandVoteFrom[di];

				if ( demand && !myAddress.matches( demand ) ) {
					let found = -1;

					for ( let ci = 0, numVoters = consensusPeers.length; ci < numVoters; ci++ ) {
						if ( consensusPeers[ci].matches( demand ) ) {
							found = ci;
							break;
						}
					}

					if ( found < 0 ) {
						consensusPeers.push( demand );
					}
				} else {
					demandVoteFrom.splice( di--, 1 );
					numDemands--;
				}
			}


			ConsensusLog( `SEEKING ${consensusIndex}/${numConsensuses} on log index #${waitingForIndex} from ${consensusPeers.length} remote voters` );

			if ( !consensusPeers.length ) {
				resolve();
				return;
			}


			// count votes (assuming current node always committing)
			let votes = 1;

			const voters = consensusPeers.map( address => {
				let follower = this._followers[address];
				if ( !follower ) {
					// caller might have added additional nodes required to vote
					// -> create manager for temporarily including them
					follower = new PeerLeader( address, node, this.options );
				}

				return follower;
			} );

			for ( let i = 0, length = voters.length; i < length; i++ ) {
				const voter = voters[i];

				voter.on( "committed", onPeerCommit );
				voter.setLocalLogIndex( waitingForIndex );
			}


			// TODO: consider using another options as timeout value (waitForConsensusTimeout?)
			const timeout = setTimeout( () => {
				cleanup();
				reject( Object.assign( new Error( "timed out waiting for consensus" ), { code: "ETIMEDOUT" } ) );
			}, this.options.rpcTimeoutMS );


			/**
			 * Handles reply from another peer committing consensus.
			 *
			 * @param {PeerLeader} peerController manager controlling communication w/ peer
			 * @param {int} logIndexCommittedByPeer index of latest log entry as committed by peer
			 * @returns {void}
			 */
			function onPeerCommit( peerController, logIndexCommittedByPeer ) {
				if ( logIndexCommittedByPeer >= waitingForIndex ) {
					votes++;

					ConsensusLog( `VALID VOTE for consensus on log index #${logIndexCommittedByPeer} from ${peerController.peerAddress}` );

					peerController.removeListener( "committed", onPeerCommit );

					// dequeue from list of peers required to cast a vote
					for ( let i = 0, length = demandVoteFrom.length; i < length; i++ ) {
						const address = demandVoteFrom[i];
						if ( address === String( peerController.peerAddress ) ) {
							demandVoteFrom.splice( i--, 1 );
							length--;
						}
					}
				} else {
					ConsensusLog( `OBSOLETE VOTE for consensus on log index #${logIndexCommittedByPeer} from ${peerController.peerAddress}` );
				}


				if ( node.isMajority( true, votes, voters.length ) && !demandVoteFrom.length ) {
					ConsensusLog( `PARTIALLY REACHED ${consensusIndex}/${numConsensuses} on log index ${waitingForIndex}` );
					cleanup();
					resolve();
				}
			}

			/**
			 * Stops waiting for timeout and listening for further commits on
			 * consensus from peer nodes.
			 *
			 * @returns {void}
			 */
			function cleanup() {
				clearTimeout( timeout );

				voters.forEach( peer => peer.removeListener( "committed", onPeerCommit ) );
			}
		} );
	}

	/**
	 * Handles event of heart beat timed out.
	 *
	 * Since this node is leader it doesn't care for missing heart beat due to
	 * transmitting heart beat instead of receiving it.
	 *
	 * @returns {void}
	 * @private
	 */
	_onHeartbeatTimeout() {
		// don't expect to receive any heartbeat as this is leader responsible
		// for sending it (by using PeerLeader instances per known peer)
	}
}

module.exports = NodeStateLeader;
