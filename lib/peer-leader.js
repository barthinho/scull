"use strict";

const EventEmitter = require( "events" );

const HeartbeatLog = require( "debug" )( "scull:heartbeat" );
const SnapshotLog = require( "debug" )( "scull:snapshot" );
const ErrorLog = require( "debug" )( "scull:error" );

const Address = require( "./data/address" );
const Timer = require( "./utils/timer" );


/**
 * Represents either peer node of cluster if current node is leading.
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
		const _peerAddress = Address( peerAddress );

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
			peerAddress: { value: _peerAddress },

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
					() => this.sendAppendEntries(),
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
		this._appending = 0; // counts running and desired requests for AppendEntries

		// instantly start sending heartbeats to peer
		process.nextTick( () => this.sendAppendEntries( true ) );
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
			process.nextTick( () => this.sendAppendEntries() );
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
	 * @param {boolean} onTimeout true when called by heartbeat timeout
	 * @returns {void}
	 * @private
	 */
	sendAppendEntries( onTimeout ) {
		if ( this._stopped ) {
			return;
		}

		if ( this._installingSnapshot ) {
			// don't actually send heartbeat requests while pushing snapshot
			return;
		}

		if ( this._appending > 0 ) {
			// there is a running request
			if ( !onTimeout ) {
				this._appending++;
			}

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

			const client = this.node.network.getPeer( this.peerAddress );

			this._appending = 1;

			client.call( "AppendEntries", appendEntriesArgs ) // eslint-disable-line promise/catch-or-return
				.then( reply => {
					HeartbeatLog( "%s <-  %s: %j", this.localAddress, this.peerAddress, reply );

					if ( reply ) {
						if ( reply.issue ) {
							HeartbeatLog( `${this.localAddress}: heartbeat reply asking for log @ ${reply.nextLogIndex}: ${reply.issue}` );

							if ( reply.nextLogIndex > -1 ) {
								this._peerLatestLogIndex = reply.nextLogIndex - 1;
							} else if ( client.isConnected ) {
								// ensure to instantly try again below
								this._peerLatestLogIndex--;
							}
						} else {
							HeartbeatLog( `${this.localAddress}: heartbeat reply` );

							this._matchIndex = leaderCommit;
							if ( lastEntry ) {
								this._peerLatestLogIndex = lastEntry.i;
							}

							this.emit( "committed", this, ( lastEntry || previousEntry || {} ).i || 0 );
						}

						if ( client.isConnected && this.isPeerLaggingBehind() ) {
							this._appending++;
						}
					} else {
						ErrorLog( `${this.localAddress}: missing result from calling "AppendEntries" @ ${this.peerAddress}` );
					}

					this.heartbeatTimer.restart();
				} )
				.catch( error => {
					switch ( error.code ) {
						case "ETIMEDOUT" :
							ErrorLog( `${this.localAddress}: TIMEOUT on AppendEntries request${error.uuid ? " " + error.uuid : ""}` );
							break;

						case "ECONNRESET" :
						case "ECONNABORTED" :
							ErrorLog( `${this.localAddress}: connection lost on AppendEntries request${error.uuid ? " " + error.uuid : ""}` );
							break;

						case "ECONNREFUSED" :
							ErrorLog( `${this.localAddress}: AppendEntries failed, ${this.peerAddress} not available` );
							break;

						default :
							ErrorLog( `${this.localAddress}: ERROR on AppendEntries request${error.uuid ? " " + error.uuid : ""}${error.code ? " " + error.code : ""}: ${error.stack}` );
					}
				} )
				.then( () => {
					const rerun = this._appending > 1;

					this._appending = 0;

					if ( rerun ) {
						this.sendAppendEntries();
					}
				} );
		} else {
			// no log entries for peer that's lagging behind
			HeartbeatLog( "%s: peer %s is at log index #%d, thus lagging behind, going to install snapshot",
				this.localAddress, this.peerAddress, this._peerLatestLogIndex );

			this.sendInstallSnapshot();
		}
	}

	/**
	 * Pushes all records of leader's persistent log to current peer for
	 * catching up.
	 *
	 * @returns {Promise} promises whole snapshot transmitted to peer
	 * @private
	 */
	sendInstallSnapshot() {
		const me = this.localAddress.id;
		const myPeer = this.peerAddress.id;

		if ( this._stopped ) {
			return Promise.reject( new Error( `${me} has been stopped, thus sending no snapshots` ) );
		}

		SnapshotLog( `${me} -> ${myPeer}` );

		const that = this;
		const node = this.node;
		const logStats = node.log.stats;

		const client = node.network.getPeer( this.peerAddress );

		let finished = false;
		let offset = 0;

		// mark leader pushing snapshot to peer currently
		this._installingSnapshot = true;

		// stop sending heartbeats while pushing snapshot
		this.heartbeatTimer.halt();

		const lastIncludedIndex = logStats.lastAppliedIndex;
		const lastIncludedTerm = logStats.lastAppliedTerm;
		const dbReadStream = node.db.state.createReadStream();

		return new Promise( ( resolve, reject ) => {
			// read all records of locally persisted state and send them in chunks of configured size
			const chunk = [];

			dbReadStream.on( "data", entry => {
				chunk.push( entry );

				if ( chunk.length >= that.options.installSnapshotChunkSize ) {
					dbReadStream.pause();

					sendChunk( chunk )
						.then( keepSending => {
							if ( keepSending ) {
								// chunk sent -> reset and keep collecting from database
								chunk.splice( 0 );

								dbReadStream.resume();
							} else {
								cleanup();
								reject( new Error( `${me} snapshot transfer cancelled by peer ${myPeer}` ) );
							}
						} )
						.catch( error => {
							dbReadStream.removeAllListeners( "end" );
							dbReadStream.destroy();

							reject( error );
						} );
				}
			} );

			dbReadStream.once( "error", error => {
				ErrorLog( `${me} failed streaming all records of locale state for transferring snapshot to ${myPeer}` );
				reject( error );
			} );

			dbReadStream.once( "end", () => {
				sendChunk( chunk, true )
					.then( resolve )
					.catch( reject );
			} );
		} );

		/**
		 * Sends subset of records read from state database to connected peer.
		 *
		 * @param {Array} entries records read from database
		 * @param {boolean} final set true if provided excerpt is final one to be sent
		 * @returns {Promise<boolean>} promises peer accepting further chunks or not
		 */
		function sendChunk( entries, final ) {
			SnapshotLog( `${me} -> ${myPeer} ${final ? "final" : "next"} chunk w/ ${entries.length} entries: %j`, entries );

			// stop reading from database until this chunk has been processed
			const params = {
				term: node.term,
				offset,
				data: entries,
			};

			offset += entries.length;

			if ( final ) {
				params.done = 1;

				// include state for restarting peer's log finally
				params.lastIndex = lastIncludedIndex;
				params.lastTerm = lastIncludedTerm;

				// include addresses of all current nodes in cluster with
				// last request sent to peer
				params.leaderId = me;
				params.peers = node.peers.toJSON();
			}

			return client.call( "InstallSnapshot", params )
				.then( reply => {
					if ( reply.cancel ) {
						SnapshotLog( `${me} <- ${myPeer} CANCELLED by receiver` );
						return false;
					}

					if ( final ) {
						// peer replied to last chunk of snapshot pushed
						// -> whole snapshot succeeded
						SnapshotLog( `${me} <- ${myPeer} CONFIRMED LAST chunk w/ next index set to ${lastIncludedIndex}` );

						// update local counters indicating latest log entry
						// committed by peer
						that._matchIndex = that._peerLatestLogIndex = lastIncludedIndex;

						// return to regular heartbeat processing
						cleanup();

						that.emit( "committed", that, lastIncludedIndex );

						return false;
					}

					// having pushed collected batch of entries successfully
					SnapshotLog( `${me} <- ${myPeer} CONFIRMED chunk` );

					return true;
				} )
				.catch( error => {
					ErrorLog( `${me} -> ${myPeer} InstallSnapshot failed: ${error.message}` );

					// peer failed on committing current chunk
					// -> can't recover this case here
					// -> stop pushing snapshot for now and try restarting
					//    snapshot later if still required

					// return to regular heartbeat processing
					cleanup();

					throw error;
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

				dbReadStream.destroy();
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
