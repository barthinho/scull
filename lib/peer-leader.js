'use strict';

const EventEmitter = require( 'events' );

const Debug = require( 'debug' )( 'skiff.peer-leader' );

const Address = require( './data/address' );
const CollectChunksStream = require( './utils/collect-chunks-stream' );
const Timer = require( './utils/timer' );


/**
 * Implements specific API of a leader node interacting with one of its peer
 * nodes in cluster.
 *
 * @type {PeerLeader}
 * @name PeerLeader
 * @property {Address} localAddress ID/address of current node
 * @property {Address} peerAddress ID/address of peer this wrapper is communicating with
 * @property {Node} node
 * @property {Log} log
 * @property {object<string,*>} options
 * @property {Timer} heartbeatTimer timer used to keep sending frequent "heartbeat" requests
 */
module.exports = class PeerLeader extends EventEmitter {

	/**
	 * @param {Address|string} peerAddress
	 * @param {Node} node
	 * @param {object<string,*>} options
	 */
	constructor( peerAddress, node, options ) {
		peerAddress = Address( peerAddress );

		super();

		Object.defineProperties( this, {
			localAddress: { value: node.id },
			peerAddress: { value: peerAddress },
			node: { value: node },
			log: { value: node.log },
			options: { value: options },
			heartbeatTimer: {
				value: new Timer(
					this._appendEntries.bind( this ),
					options.appendEntriesIntervalMS )
			},
		} );

		this._nextIndex = node.log.stats.lastIndex + 1;
		this._matchIndex = 0;
		this._needsIndex = 0;
		this._installingSnapshot = false;
		this._lastSent = 0;
		this._stopped = false;

		// instantly start sending heartbeats to peer
		this._appendEntries();
	}

	/**
	 * Stops leader controlling current peer.
	 */
	stop() {
		this._stopped = true;
		this.heartbeatTimer.enabled = false;
	}

	/**
	 * Updates cluster index of log entry to be pushed to peer for reaching
	 * consensus again.
	 *
	 * @param {number} index
	 */
	needsIndex( index ) {
		if ( index > this._needsIndex ) {
			this._needsIndex = index;
		}

		if ( this._needsMore() ) {
			setImmediate( this._appendEntries.bind( this ) );
		}
	}

	/**
	 * Detects if peer's log is lagging behind leader's log.
	 *
	 * @returns {boolean}
	 * @protected
	 */
	_needsMore() {
		return this._nextIndex <= this._needsIndex;
	}

	/**
	 * Sends heartbeat to peer node requesting to append all new entries of
	 * local node's log.
	 *
	 * @private
	 */
	_appendEntries() {
		if ( this._stopped ) {
			return;
		}

		if ( this._installingSnapshot ) {
			// don't actually send heartbeat requests while pushing snapshot
			return;
		}


		const log = this.log;
		const options = this.options;
		const currentTerm = this.node.term;

		const entries = log.entriesFrom( this._nextIndex, options.batchEntriesLimit );
		if ( entries ) {
			const previousEntry = log.atIndex( this._nextIndex - 1 );
			const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
			const leaderCommit = log.stats.committedIndex;

			const appendEntriesArgs = {
				term: currentTerm,
				leaderId: this.localAddress.toString(),
				prevLogIndex: previousEntry && previousEntry.i || 0,
				prevLogTerm: previousEntry && previousEntry.t || 0,
				entries,
				leaderCommit
			};

			this._lastSent = Date.now();

			// keep sending heartbeat requests
			this.heartbeatTimer.restart();

			this.node.rpc( {
				to: this.peerAddress,
				action: 'AppendEntries',
				params: appendEntriesArgs
			} )
				.then( reply => {
					Debug( '%s: got reply to AppendEntries from %s: %j', this.localAddress, this.peerAddress, reply );

					if ( reply && reply.params ) {
						if ( reply.params.success ) {
							this._matchIndex = leaderCommit;
							if ( lastEntry ) {
								this._nextIndex = lastEntry.i + 1;
							}
							const committedEntry = lastEntry || previousEntry;
							const committedIndex = committedEntry && committedEntry.i || 0;
							this.emit( 'committed', this, committedIndex );
						} else {
							Debug( '%s: reply next log index is %d', this.localAddress, reply.params.nextLogIndex );
							if ( reply.params.nextLogIndex !== undefined ) {
								this._nextIndex = reply.params.nextLogIndex;
							} else if ( !reply.fake ) {
								this._nextIndex--;
							}
						}

						if ( !reply.fake && this._needsMore() ) {
							setImmediate( this._appendEntries.bind( this ) );
						}
					}
				}, err => {
					Debug( '%s: error on AppendEntries reply:\n%s', this.localAddress, err.stack );
				} );
		} else {
			// no log entries for peer that's lagging behind
			Debug( '%s: peer %s is lagging behind (next index is %d), going to install snapshot',
				this.localAddress, this.peerAddress, this._nextIndex );

			return this._installSnapshot();
		}
	}

	/**
	 * Pushes all records of leader's persistent log to current peer for
	 * catching up.
	 *
	 * @private
	 */
	_installSnapshot() {
		const me = this.localAddress.toString();
		const myPeer = this.peerAddress.toString();

		Debug( '%s: _installSnapshot on %s', me, myPeer );

		if ( this._stopped ) {
			return;
		}

		const self = this;
		const node = this.node;
		const logStats = node.log.stats;

		let finished = false;
		let offset = 0;

		// mark leader pushing snapshot to peer currently
		this._installingSnapshot = true;

		// stop sending heartbeats while pushing snapshot
		this.heartbeatTimer.enabled = false;

		node.rpc( {
			to: this.peerAddress,
			action: 'InstallSnapshot',
			params: {
				term: node.term,
				probe: 1,
				lastIndex: logStats.lastAppliedIndex,
				lastTerm: logStats.lastAppliedTerm,
			}
		} )
			.then( reply => {
				Debug( '%s: got InstallSnapshot probe reply', me, reply );

				if ( reply.params.lastIndex === logStats.lastAppliedIndex &&
				     reply.params.lastTerm === logStats.lastAppliedTerm ) {
					// client expects snapshot still matching current state
					// -> start pushing snapshot now
					process.nextTick( installSnapshotAcknowledged );
				}
			}, error => {
				Debug( '%s: probing for InstallSnapshot failed', me, error );

				// peer node responded to probe, but that might have taken to much
				// time, so retry probing instead of pushing snapshot for nothing
				process.nextTick( this._installSnapshot.bind( this ) );
			} );

		function installSnapshotAcknowledged() {
			const lastIncludedIndex = logStats.lastAppliedIndex;
			const lastIncludedTerm = logStats.lastAppliedTerm;

			// read all records from database persisting cluster log
			const rs = node.db.state.createReadStream();

			// group database records into chunks of configured size
			const stream = rs.pipe( new CollectChunksStream( {
				batchSize: self.options.installSnapshotChunkSize
			} ) );

			// read every chunk of entries and push to peer using RPC
			stream.on( 'data', installSnapshotPushCollectedChunk );

			function installSnapshotPushCollectedChunk( data ) {
				const entries = data.chunks;

				Debug( '%s: leader sending %s %d chunks %j', me,
					data.finished ? 'final' : 'another', entries.length, entries );

				// stop reading from database until this chunk has been processed
				stream.pause();

				const params = {
					term: node.term,
					offset,
					data: entries,
				};

				offset += entries.length;

				if ( data.finished ) {
					params.done = 1;

					// include state for restarting peer's log finally
					params.lastIndex = lastIncludedIndex;
					params.lastTerm = lastIncludedTerm;

					// include addresses of all current nodes in cluster with last
					// request sent to peer
					params.leaderId = me;
					params.peers = node.peers
						.map( peer => peer.toString() )
						.filter( peer => peer !== myPeer );
				}

				node.rpc( {
					to: self.peerAddress,
					action: 'InstallSnapshot',
					params
				} )
					.then( reply => {
						Debug( '%s: got InstallSnapshot reply', me, reply );
						if ( data.finished ) {
							// peer replied to last chunk of snapshot pushed
							// -> whole snapshot succeeded
							Debug( '%s: data finished, setting next index of %s to %d',
								me, myPeer, lastIncludedIndex );

							// update local counters indicating latest log entry
							// committed by peer
							self._matchIndex = lastIncludedIndex;
							self._nextIndex = lastIncludedIndex + 1;

							// return to regular heartbeat processing
							cleanup();

							this.emit( 'committed', self, lastIncludedIndex );
						} else {
							// having pushed collected batch of entries successfully
							// -> resume database stream providing more entries to push
							stream.resume();
						}
					}, err => {
						Debug( '%s: InstallSnapshot failed', me, err );

						// peer failed on committing current chunk
						// -> can't recover this case here
						// -> stop pushing snapshot for now and try restarting
						//    snapshot later if still required

						// return to regular heartbeat processing
						return cleanup();
					} );
			}

			function cleanup() {
				if ( !finished ) {
					finished = true;

					self._installingSnapshot = false;
					self.heartbeatTimer.restart();

					stream.removeAllListeners( 'data' );
					rs.destroy();
				}
			}
		}
	}

	state() {
		return {
			address: this.peerAddress,
			stopped: this._stopped,
			nextIndex: this._nextIndex,
			matchIndex: this._matchIndex,
			installingSnapshot: this._installingSnapshot,
			sentAppendEntriesAgoMS: Date.now() - this._lastSent
		};
	}
};
