'use strict';

const Debug = require( 'debug' )( 'skiff.states.leader' );
const Async = require( 'async' );
const Once = require( 'once' );

const NodeState = require( './base' );
const PeerLeader = require( '../peer-leader' );

/**
 * Implements specific behaviour of a node in _leader_ state.
 *
 * @type {NodeStateLeader}
 * @name NodeStateLeader
 * @property {object<string,PeerLeader>} _followers set of controllers each managing communication with one of current cluster's nodes following this leader node
 */
module.exports = class NodeStateLeader extends NodeState {
	constructor( node, options ) {
		super( node, 'leader', Object.assign( {}, options || {}, {
			electionTimeout: false
		} ) );
	}

	start() {
		const node = this.node;
		const peers = node.peers;

		this._followers = peers.reduce( ( followers, address ) => {
			followers[address] = new PeerLeader( address, node, this.options );
			return followers;
		}, {} );

		super.start();

		this._waitForConsensus( node.log.stats.committedIndex, {}, peers );
	}

	stop() {
		Object.keys( this._followers )
			.map( address => this._followers[address] )
			.forEach( follower => {
				follower.stop();
				follower.removeAllListeners();
			} );

		super.stop();
	}

	/** @inheritDoc */
	updatePeers( addresses ) {
		const sources = this._followers;
		const updated = {};

		for ( let i = 0, length = addresses.length; i < length; i++ ) {
			const address = addresses[i].toString();
			if ( sources.hasOwnProperty( address ) && sources[address] ) {
				// keep using existing controller on selected peer
				updated[address] = sources[address];
				sources[address] = undefined;
			} else {
				// create controller for this actually new peer
				updated[address] = new PeerLeader( address, this.node, this.options );
			}
		}

		for ( let address in sources ) {
			if ( sources.hasOwnProperty( address ) && sources[address] ) {
				// properly stop this peer's controller (prior to dropping it)
				sources[address].stop();
			}
		}

		this._followers = updated;
	}

	peers() {
		return Object.keys( this._followers )
			.map( address => this._followers[address].state() );
	}

	command( consensuses, command, options, done ) {
		const log = this.node.log;
		const index = log.push( command );

		process.nextTick( () => {
			Async.eachSeries( consensuses, this._waitForConsensus.bind( this, index, options ), ( err ) => {
				if ( err ) {
					done( err );
				} else {
					log.commit( index, done );
				}
			} );
		} );
	}

	/**
	 * @typedef {object} WaitForConsensusOptions
	 * @property {string|string[]} [alsoWaitFor] lists addresses of peers to wait for consensus explicitly (in addition to requiring majority of nodes to commit)
	 */

	/**
	 * Implements code for requesting consensus commitment from a majority of
	 * nodes.
	 *
	 * @param {*} waitingForIndex
	 * @param {WaitForConsensusOptions} options
	 * @param {Address[]} consensusPeers lists peers with a vote in current request for consensus
	 * @param {function} _done
	 * @returns {*}
	 * @private
	 */
	_waitForConsensus( waitingForIndex, options, consensusPeers, _done = null ) {
		 Debug( '_waitForConsensus %d', waitingForIndex );
		const done = _done ? Once( _done ) : noop;

		if ( !consensusPeers.length ) {
			return done();
		}


		// prepare and normalize list of peers required to vote explicitly
		let demandVoteFrom = options.alsoWaitFor;
		if ( !Array.isArray( demandVoteFrom ) ) {
			demandVoteFrom = [demandVoteFrom];
		}

		// never demand vote from current node
		const myAddress = this.node.id.toString();
		demandVoteFrom = demandVoteFrom
			.map( address => address ? address.toString() : null )
			.filter( address => address && address !== myAddress );


		// count votes (current node always committing implicitly)
		let votes = 1;

		// TODO: consider using another options as timeout value (waitForConsensusTimeout?)
		const timeout = setTimeout( onTimeout, this.options.rpcTimeoutMS );

		const peers = consensusPeers.map( address => {
			let follower = this._followers[address];
			if ( !follower ) {
				follower = this._followers[address] = new PeerLeader( address, this.node, this.options );
			}

			return follower;
		} );

		const onPeerCommit = ( peerController, logIndexCommittedByPeer ) => {
			if ( logIndexCommittedByPeer >= waitingForIndex ) {
				votes++;
				peerController.removeListener( 'committed', onPeerCommit );
				demandVoteFrom = demandVoteFrom.filter( addr => addr !== peerController.peerAddress.toString() );
			}

			if ( this.node.isMajority( votes, consensusPeers ) && !demandVoteFrom.length ) {
				 Debug( 'have consensus for index %d', waitingForIndex );
				cleanup();
				done();
			}
		};

		peers.forEach( peer => {
			peer.on( 'committed', onPeerCommit );
			peer.needsIndex( waitingForIndex );
		} );

		function onTimeout() {
			cleanup();

			done( Object.assign( new Error( 'timed out waiting for consensus' ), { code: 'ETIMEDOUT' } ) );
		}

		function cleanup() {
			clearTimeout( timeout );

			peers.forEach( peer => peer.removeListener( 'committed', onPeerCommit ) );
		}
	}

	_onHeartbeatTimeout() {
		// don't expect to receive any heartbeat as this is leader responsible
		// for sending it (by using PeerLeader instances per known peer)
	}
};

function noop() {}
