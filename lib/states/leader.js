'use strict';

const debug = require( 'debug' )( 'skiff.states.leader' );
const async = require( 'async' );
const once = require( 'once' );

const NodeState = require( './base' );
const PeerLeader = require( '../peer-leader' );

/**
 * Implements specific behaviour of a node in _leader_ state.
 *
 * @type {NodeStateLeader}
 * @name NodeStateLeader
 */
module.exports = class NodeStateLeader extends NodeState {

	constructor( node, _options ) {
		const options = Object.assign( {}, _options || {}, { electionTimeout: false } );
		super( node, options );
		this.name = 'leader';
	}

	start() {
		debug( '%s is leader', this.id );
		this._followers = this._node.network.peers().reduce( ( followers, address ) => {
			followers[address] = new PeerLeader( address, this._node, this._options );
			return followers;
		}, {} );
		super.start();
		this._waitForConsensus( this._node.state.log._commitIndex, {}, this._node.network.peers() );
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

	join( address ) {
		const follower = this._followers[address];
		if ( !follower ) {
			this._followers[address] = new PeerLeader( address, this._node, this._options );
		}
	}

	leave( address ) {
		const follower = this._followers[address];
		if ( follower ) {
			follower.stop();
			delete this._followers[address];
		}
	}

	peers() {
		return Object.keys( this._followers )
			.map( addr => this._followers[addr].state() );
	}

	command( consensuses, command, options, done ) {
		const index = this._node.log.push( command );

		process.nextTick( () => {
			async.eachSeries( consensuses, this._waitForConsensus.bind( this, index, options ), ( err ) => {
				if ( err ) {
					done( err );
				} else {
					this._node.state.log.commit( index, done );
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
	 * @param {Peer[]} consensusPeers lists peers with a vote in current request for consensus
	 * @param {function} _done
	 * @returns {*}
	 * @private
	 */
	_waitForConsensus( waitingForIndex, options, consensusPeers, _done ) {
		debug( '_waitForConsensus %d', waitingForIndex );
		const done = _done ? once( _done ) : noop;

		if ( !consensusPeers.length ) {
			return done();
		}


		// prepare and normalize list of peers required to vote explicitly
		let demandVoteFrom = options.alsoWaitFor;
		if ( !Array.isArray( demandVoteFrom ) ) {
			demandVoteFrom = [demandVoteFrom];
		}

		// never demand vote from current node
		const myAddress = this.id.toString();
		demandVoteFrom = demandVoteFrom
			.map( address => address ? address.toString() : null )
			.filter( address => address && address !== myAddress );


		// count votes (current node always committing implicitly)
		let votes = 1;

		// TODO: consider using another options as timeout value (waitForConsensusTimeout?)
		const timeout = setTimeout( onTimeout, this._options.rpcTimeoutMS );
		const peers = consensusPeers.map( address => {
			let follower = this._followers[address];
			if ( !follower ) {
				follower = this._followers[address] = new PeerLeader( address, this._node, this._options );
			}

			return follower;
		} );

		peers.forEach( peer => {
			peer.on( 'committed', onPeerCommit );
			peer.needsIndex( waitingForIndex );
		} );

		function onPeerCommit( peer, peerIndex ) {
			if ( peerIndex >= waitingForIndex ) {
				votes++;
				peer.removeListener( 'committed', onPeerCommit );
				demandVoteFrom = demandVoteFrom.filter( addr => addr !== peer._address );
			}
			if ( isMajority( consensusPeers, votes ) && !demandVoteFrom.length ) {
				debug( 'have consensus for index %d', waitingForIndex );
				cleanup();
				done();
			}
		}

		function onTimeout() {
			cleanup();
			const err = new Error( 'timed out waiting for consensus' );
			err.code = 'ETIMEOUT';
			done( err );
		}

		function cleanup() {
			clearTimeout( timeout );
			peers.forEach( peer => {
				peer.removeListener( 'committed', onPeerCommit );
			} );
		}
	}

	_onElectionTimeout() {
		// do nothing, we're the leader
	}
};

function noop() {}

function isMajority( consensus, count ) {
	const quorum = Math.floor( (consensus.length + 1) / 2 ) + 1;
	return consensus.length && count >= quorum;
}
