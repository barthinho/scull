"use strict";

const EventEmitter = require( "events" );

const HeartbeatLog = require( "debug" )( "scull:heartbeat" );
const SnapshotLog = require( "debug" )( "scull:snapshot" );

const Address = require( "./data/address" );
const CollectChunksStream = require( "./utils/collect-chunks-stream" );
const Timer = require( "./utils/timer" );


/**
 * Implements specific API of a leader node interacting with one of its peer
 * nodes in cluster.
 *
 * @name PeerLeader
 */
module.exports = class PeerLeader extends EventEmitter {

	/**
	 * @param {Address|string} peerAddress address of peer node this controller is intended to communicate with
	 * @param {Node} node reference on local node's manager
	 * @param {object<string,*>} options customizes behaviour
	 */
	constructor( peerAddress, node, options ) {
		peerAddress = Address( peerAddress );

		super();

		Object.defineProperties( this, {
			/**
			 * Provides ID/address of current node.
			 *
			 * @name PeerLeader#localAddress
			 * @property {Address}
			 * @readonly
			 */
			localAddress: { value: node.id },

			/**
			 * Provides ID/address of peer this instance is communicating with.
			 *
			 * @name PeerLeader#peerAddress
			 * @property {Address}
			 * @readonly
			 */
			peerAddress: { value: peerAddress },

			/**
			 * Refers to controller of local node.
			 *
			 * @name PeerLeader#node
			 * @property {Node}
			 * @readonly
			 */
			node: { value: node },

			/**
			 * Caches reference on current node's cluster log tracking
			 * consensual changes to cluster.
			 *
			 * @name PeerLeader#log
			 * @property {Log}
			 * @readonly
			 */
			log: { value: node.log },

			/**
			 * Exposes options used to customize this controller.
			 *
			 * @name PeerLeader#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( options ) },

			/**
			 * Controls timer used to emit frequent heartbeat by publishing this
			 * node's current state of log so other nodes may detect whether
			 * they need to fetch update or not.
			 *
			 * @name PeerLeader#heartbeatTimer
			 * @property {Timer}
			 * @readonly
			 */
			heartbeatTimer: {
				value: new Timer(
					this._appendEntries.bind( this ),
					options.appendEntriesIntervalMS
				),
			},
		} );

		this._peerLatestLogIndex = node.log.stats.lastIndex;
		this._matchIndex = 0;
		this._localLatestLogIndex = 0;
		this._installingSnapshot = false;
		this._lastSent = 0;
		this._stopped = false;

		// instantly start sending heartbeats to peer
		this._appendEntries();
	}

	/**
	 * Stops leader controlling current peer.
	 *
	 * @returns {void}
	 */
	stop() {
		this._stopped = true;
		this.heartbeatTimer.enabled = false;
	}

	/**
	 * Updates index of local node's latest entry in cluster log to be deployed
	 * to current peer requesting to update log accordingly.
	 *
	 * @param {int} index index of latest entry in local node's log
	 * @returns {void}
	 */
	setLocalLogIndex( index ) {
		if ( index > this._localLatestLogIndex ) {
			this._localLatestLogIndex = index;
		}

		if ( this.isPeerLaggingBehind() ) {
			process.nextTick( () => this._appendEntries() );
		}
	}

	/**
	 * Detects if peer's log is lagging behind local leader's log.
	 *
	 * @returns {boolean} true if peer's next log index is behind local log's index
	 * @protected
	 */
	isPeerLaggingBehind() {
		return this._peerLatestLogIndex < this._localLatestLogIndex;
	}

	/**
	 * Sends heartbeat to peer node requesting to append all new entries of
	 * local node's log.
	 *
	 * @returns {void}
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

		const entries = log.entriesFrom( this._peerLatestLogIndex + 1, options.batchEntriesLimit );
		if ( entries ) {
			const previousEntry = log.atIndex( this._peerLatestLogIndex );
			const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
			const leaderCommit = log.stats.committedIndex;

			const appendEntriesArgs = {
				term: currentTerm,
				leaderId: this.localAddress.toString(),
				prevLogIndex: ( previousEntry && previousEntry.i ) || 0,
				prevLogTerm: ( previousEntry && previousEntry.t ) || 0,
				entries,
				leaderCommit
			};

			this._lastSent = Date.now();

			this.heartbeatTimer.restart();

			HeartbeatLog( "%s  -> %s: %j", this.localAddress, this.peerAddress, appendEntriesArgs );

			this.node.rpc( {
				to: this.peerAddress,
				action: "AppendEntries",
				params: appendEntriesArgs,
			} )
				.then( reply => {
					HeartbeatLog( "%s <-  %s: %j", this.localAddress, this.peerAddress, reply && reply.params );

					if ( reply && reply.params ) {
						if ( reply.params.success ) {
							this._matchIndex = leaderCommit;
							if ( lastEntry ) {
								this._peerLatestLogIndex = lastEntry.i;
							}

							const committedEntry = lastEntry || previousEntry;
							const committedIndex = ( committedEntry && committedEntry.i ) || 0;
							this.emit( "committed", this, committedIndex );
						} else {
							HeartbeatLog( "%s: reply next log index is %d", this.localAddress, reply.params.nextLogIndex );
							if ( reply.params.nextLogIndex !== undefined ) {
								this._peerLatestLogIndex = reply.params.nextLogIndex - 1;
							} else if ( !reply.fake ) {
								this._peerLatestLogIndex--;
							}
						}

						if ( !reply.fake && this.isPeerLaggingBehind() ) {
							setImmediate( () => this._appendEntries() );
						}
					}

					this.heartbeatTimer.restart();
				} )
				.catch( error => {
					HeartbeatLog( `%s: ERROR on AppendEntries request${error.uuid ? " " + error.uuid : ""}${error.code ? " " + error.code : ""}: %s`, this.localAddress, error );
				} );
		} else {
			// no log entries for peer that's lagging behind
			HeartbeatLog( "%s: peer %s is at log index #%d, thus lagging behind, going to install snapshot",
				this.localAddress, this.peerAddress, this._peerLatestLogIndex );

			this._installSnapshot();
		}
	}

	/**
	 * Pushes all records of leader's persistent log to current peer for
	 * catching up.
	 *
	 * @returns {void}
	 * @private
	 */
	_installSnapshot() {
		const me = this.localAddress.toString();
		const myPeer = this.peerAddress.toString();

		if ( this._stopped ) {
			return;
		}

		SnapshotLog( `${me} -> ${myPeer}` );

		const that = this;
		const node = this.node;
		const logStats = node.log.stats;

		let finished = false;
		let offset = 0;

		// mark leader pushing snapshot to peer currently
		this._installingSnapshot = true;

		// stop sending heartbeats while pushing snapshot
		this.heartbeatTimer.halt();


		const lastIncludedIndex = logStats.lastAppliedIndex;
		const lastIncludedTerm = logStats.lastAppliedTerm;

		// read all records from database persisting cluster log
		const rs = node.db.state.createReadStream();

		// group database records into chunks of configured size
		const stream = rs.pipe( new CollectChunksStream( {
			batchSize: that.options.installSnapshotChunkSize
		} ) );

		// read every chunk of entries and push to peer using RPC
		stream.on( "data", installSnapshotPushCollectedChunk );

		/**
		 * Transmits chunk of snapshot read from database to peer node.
		 *
		 * @param {CollectedChunks} data chunk of records fetched from dfrom storage shared in cluster
		 * @returns {void}
		 */
		function installSnapshotPushCollectedChunk( data ) {
			const entries = data.chunks;

			SnapshotLog( `${me} -> ${myPeer} ${data.finished ? "final" : "next"} chunk w/ ${entries.length} entries: %j`, entries );

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

				// include addresses of all current nodes in cluster with
				// last request sent to peer
				params.leaderId = me;
				params.peers = node.peers.toJSON();
			}

			node.rpc( {
				to: that.peerAddress,
				action: "InstallSnapshot",
				params,
			} )
				.then( reply => {
					if ( reply.cancel ) {
						SnapshotLog( `${me} <- ${myPeer} CANCELLED by receiver` );
					} else if ( data.finished ) {
						// peer replied to last chunk of snapshot pushed
						// -> whole snapshot succeeded
						SnapshotLog( `${me} <- ${myPeer} CONFIRMED LAST chunk w/ next index set to ${lastIncludedIndex}` );

						// update local counters indicating latest log entry
						// committed by peer
						that._matchIndex = lastIncludedIndex;
						that._peerLatestLogIndex = lastIncludedIndex;

						// return to regular heartbeat processing
						cleanup();

						this.emit( "committed", that, lastIncludedIndex );
					} else {
						// having pushed collected batch of entries successfully
						SnapshotLog( `${me} <- ${myPeer} CONFIRMED chunk` );

						// -> resume database stream providing more entries to push
						stream.resume();
					}
				} )
				.catch( error => {
					SnapshotLog( `${me} -> ${myPeer} failed: %j`, error );

					// peer failed on committing current chunk
					// -> can't recover this case here
					// -> stop pushing snapshot for now and try restarting
					//    snapshot later if still required

					// return to regular heartbeat processing
					return cleanup();
				} );
		}

		/**
		 * Clears resources involved in pushing snapshot.
		 *
		 * @returns {void}
		 */
		function cleanup() {
			if ( !finished ) {
				finished = true;

				that._installingSnapshot = false;
				that.heartbeatTimer.restart();

				stream.removeAllListeners( "data" );
				rs.destroy();
			}
		}
	}

	/**
	 * @typedef {object} StateDescriptor
	 * @property {Address} address
	 * @property {boolean} stopped
	 * @property {number} nextIndex
	 * @property {number} matchIndex
	 * @property {boolean} installingSnapshot
	 * @property {number} sentAPpendEntriesAgoMS
	 */

	/**
	 * Retrieves state descriptor.
	 *
	 * @returns {StateDescriptor} tracked state of peer
	 */
	state() {
		return {
			address: this.peerAddress,
			stopped: this._stopped,
			nextIndex: this._peerLatestLogIndex + 1,
			matchIndex: this._matchIndex,
			installingSnapshot: this._installingSnapshot,
			sentAppendEntriesAgoMS: Date.now() - this._lastSent
		};
	}
};
