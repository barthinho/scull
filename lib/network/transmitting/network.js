"use strict";

const Debug = require( "debug" )( "scull.network.transmitting" );

const { Network, NetworkNode, NetworkMessage } = require( "../common" );
const { NetworkTcpClient } = require( "./client" );
const Address = require( "../../data/address" );
const Nodes = require( "../../data/nodes" );


const DEFAULT_OPTIONS = {
	highWaterMark: 50,
};


/**
 * Manages _client view_ on network of nodes in cluster.
 *
 * This network is used to send request to other nodes in cluster and receive
 * replies from either node.
 *
 * @extends Network
 */
class TransmittingNetwork extends Network {
	/**
	 * @param {AnyAddress} address address of node this network is used for
	 * @param {object} options customizations
	 */
	constructor( address, options = {} ) {
		// normalize provided address
		const normalized = Address( address );

		const localIp = normalized.toSocketOptions().host;
		switch ( localIp ) {
			case "0.0.0.0" :
			case "::" :
				throw new TypeError( `invalid public IP of local node in cluster: ${localIp}` );
		}

		// merge provided options w/ defaults and make sure to stream objects
		options = Object.assign( {}, DEFAULT_OPTIONS, options || {}, {
			objectMode: true,
		} );


		Debug( `create request emitter for ${normalized.id} w/ options %j`, options );

		super( options );

		let ended = false;
		let pool = null;
		const nodes = {};
		const connections = {};


		Object.defineProperties( this, {
			/**
			 * Provides address of node this network is emitting requests for.
			 *
			 * @name TransmittingNetwork#address
			 * @property {Address}
			 * @readonly
			 */
			address: { value: normalized },

			/**
			 * Provides ID of node this network is emitting requests for.
			 *
			 * @note The ID is derived from node's address.
			 *
			 * @name TransmittingNetwork#id
			 * @property {string}
			 * @readonly
			 */
			id: { value: normalized.id },

			/**
			 * @name TransmittingNetwork#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: options },

			/**
			 * Maps simplified addresses (a.k.a. IDs) of nodes in cluster into
			 * manager for interacting with either node.
			 *
			 * @name TransmittingNetwork#_nodes
			 * @property {object<string,NetworkNode>}
			 * @readonly
			 */
			_nodes: { value: nodes },

			/**
			 * Maps simplified addresses (a.k.a. IDs) of nodes in cluster into
			 * manager for actual connections with either node.
			 *
			 * @name TransmittingNetwork#_connections
			 * @property {object<string,NetworkTcpClient>}
			 * @readonly
			 */
			_connections: { value: connections },

			/**
			 * Marks if network's writable stream has been ended before
			 * resulting in network's shutdown.
			 *
			 * @name TransmittingNetwork#ended
			 * @property {boolean}
			 */
			ended: {
				get: () => ended,
				set: value => ( ended = Boolean( ended || value ) ),
			},

			/**
			 * Manages addresses of nodes currently considered nodes of cluster.
			 *
			 * @name TransmittingNetwork#nodesPool
			 * @property {Nodes}
			 */
			nodesPool: {
				get: () => {
					if ( pool ) {
						return pool;
					}

					return {
						has: () => false,
					};
				},
				set: newPool => {
					if ( newPool == null || newPool instanceof Nodes ) {
						if ( pool ) {
							pool.removeListener( "removed", onNodeLeaving );
						}

						pool = newPool || null;

						if ( newPool ) {
							newPool.on( "removed", onNodeLeaving );
						}
					} else {
						throw new TypeError( "invalid pool of nodes" );
					}
				}
			},
		} );

		// consider local node part of network implicitly
		this.node( normalized.id );


		this.on( "connect", forwardConnectToNode );
		this.on( "disconnect", forwardDisconnectToNode );
		this.on( "warning", forwardWarningToNode );


		this.once( "finish", () => {
			Debug( "network finished, ending all active connections" );

			Object.keys( nodes )
				.forEach( id => {
					const node = nodes[id];
					if ( node ) {
						node.end();
						nodes[id] = undefined;
					}
				} );

			Object.keys( connections )
				.forEach( id => {
					const connection = connections[id];
					if ( connection ) {
						connection.end();
						connections[id] = undefined;
					}
				} );

			this.assignNodes( null );

			this.removeListener( "connect", forwardConnectToNode );
			this.removeListener( "disconnect", forwardDisconnectToNode );
			this.removeListener( "warning", forwardWarningToNode );
		} );


		/**
		 * Drops connection and peer information on node leaving cluster.
		 *
		 * @param {Address} leavingAddress address of node leaving cluster
		 * @returns {void}
		 */
		function onNodeLeaving( leavingAddress ) {
			const { id } = leavingAddress;

			const node = nodes[id];
			if ( node ) {
				node.end();
				nodes[id] = undefined;
			}

			const connection = connections[id];
			if ( connection ) {
				connection.end();
				connections[id] = undefined;
			}
		}

		/**
		 * Forwards network-wide warning related to current peer node to its
		 * local manager.
		 *
		 * @param {Error} error warning emitted in relation to some peer node
		 * @param {string} peerAddress address of peer node warning is related to
		 * @returns {void}
		 */
		function forwardWarningToNode( error, peerAddress ) {
			const allNodes = this._nodes;

			for ( let i = 0, length = allNodes.length; i < length; i++ ) {
				const node = allNodes[i];
				if ( node && node.match( peerAddress ) ) {
					node.emit( "warning", error, peerAddress );
					break;
				}
			}
		}

		/**
		 * Forwards network-wide notification on having established connection
		 * to current peer node to its local manager.
		 *
		 * @param {string} peerAddress address of peer node connection was established to
		 * @returns {void}
		 */
		function forwardConnectToNode( peerAddress ) {
			const allNodes = this._nodes;

			for ( let i = 0, length = allNodes.length; i < length; i++ ) {
				const node = allNodes[i];
				if ( node && node.match( peerAddress ) ) {
					node.emit( "connect", peerAddress );
					break;
				}
			}
		}

		/**
		 * Forwards network-wide notification on having lost connection to
		 * current peer node to its local manager.
		 *
		 * @param {string} peerAddress address of peer node with lost connection
		 * @returns {void}
		 */
		function forwardDisconnectToNode( peerAddress ) {
			const allNodes = this._nodes;

			for ( let i = 0, length = allNodes.length; i < length; i++ ) {
				const node = allNodes[i];
				if ( node && node.match( peerAddress ) ) {
					node.emit( "disconnect", peerAddress );
					break;
				}
			}
		}
	}

	/** @inheritDoc */
	node( address, { createIfMissing = true } = {} ) {
		const nodes = this._nodes;
		const normalized = Address( address );
		const targetId = normalized.id;

		let node = nodes[targetId];
		if ( !node && createIfMissing && this.nodesPool.has( normalized ) ) {
			node = nodes[targetId] = new NetworkNode( normalized, this, this.options );

			node.once( "finish", () => {
				nodes[targetId] = undefined;
			} );
		}

		return node || null;
	}

	/** @inheritDoc */
	isValidNode( address ) {
		return this.nodesPool.has( address );
	}

	/** @inheritDoc */
	drop( address, { andDisconnect = false } = {} ) {
		const normalized = Address( address );

		if ( this.isValidNode( normalized ) && !normalized.matches( this.address ) ) {
			const node = this.node( normalized, { createIfMissing: false } );
			if ( node ) {
				return new Promise( resolve => {
					node.once( "finish", () => {
						if ( andDisconnect ) {
							const connection = this.connection( normalized );
							if ( connection ) {
								connection.disconnect();
							}
						}

						resolve( node );
					} );

					node.end();
				} );
			}
		}

		return Promise.resolve( null );
	}

	/** @inheritDoc */
	assignNodes( nodes ) {
		this.nodesPool = nodes;

		return this;
	}

	/**
	 * Fetches available connection to peer node at selected address.
	 *
	 * @param {AnyAddress} address address of peer node
	 * @returns {?NetworkTcpClient} available connection or null if there is no connection to node at given address
	 */
	connection( address ) {
		const normalized = Address( address );

		if ( this.isValidNode( normalized ) && !normalized.matches( this.address ) ) {
			return this._connections[normalized.id] || null;
		}

		return null;
	}

	/**
	 * Requests to explicitly disconnect from peer node selected by its address.
	 *
	 * @param {AnyAddress} address address of peer node to disconnect from
	 * @returns {void}
	 */
	disconnect( address ) {
		const normalized = Address( address ).id;

		const peer = this._connections[normalized];
		if ( peer ) {
			peer.end();
			peer.removeAllListeners();

			this._connections[normalized] = undefined;
		}
	}

	/** @inheritDoc */
	_write( message, _, doneFn ) {
		try {
			message = NetworkMessage.normalize( message );
		} catch ( error ) {
			onWriteError( error );
			return;
		}

		if ( this.ended ) {
			Debug( `REQUEST to ${message.to.id} via ended network IGNORED` );
		} else {
			const { from, to } = message;

			if ( !this.address.matches( from ) ) {
				onWriteError( new Error( "REQUEST on behalf of foreign node REJECTED" ) );
				return;
			}

			if ( this.address.matches( to ) ) {
				Debug( "WARNING: unexpected REQUEST to local node" );
			}

			if ( !this.node( to ) ) {
				onWriteError( new Error( "REQUEST to unknown node REJECTED" ) );
				return;
			}


			const peerId = to.id;

			Debug( `REQUEST to ${peerId}: %j`, message );

			let connection = this._connections[peerId];
			if ( !connection ) {
				Debug( `creating connection with ${peerId}` );

				connection = this._connections[peerId] = new NetworkTcpClient( to, this.options )
					.once( "finish", () => {
						Debug( `${from}: connection with ${peerId} closed` );
						this._connections[peerId] = undefined;
					} )
					.on( "data", reply => {
						const { from: replyFrom, to: replyTo } = reply;

						if ( this.address.matches( replyTo ) ) {
							const node = this.node( replyTo, { createIfMissing: false } );
							if ( node ) {
								Debug( `REPLY from ${replyFrom} to ${replyTo}: %j`, reply );
								node.push( reply );
							} else {
								Debug( `${from}: IGNORING reply from unknown peer ${replyFrom}` );
							}
						} else {
							Debug( `${from}: IGNORING unexpected reply to foreign node ${replyTo}` );
						}
					} )
					.on( "error", error => { this.emit( "warning", error, peerId ); } )
					.on( "connect", () => { this.emit( "connect", peerId ); } )
					.on( "disconnect", () => { this.emit( "disconnect", peerId ); } )
					.on( "inactivity timeout", () => { this.disconnect( peerId ); } );
			}

			connection.write( message, doneFn );
		}

		/**
		 * Invokes callback after logging error.
		 *
		 * @param {Error} error error to be logged
		 * @returns {void}
		 */
		function onWriteError( error ) {
			Debug( `TX: ${error.message}` );
			doneFn( error );
		}
	}

	/**
	 * Ends all connections of network for shutting it down.
	 *
	 * @returns {TransmittingNetwork} fluent interface
	 */
	end() {
		this.ended = true;

		super.end();

		return this;
	}

	/**
	 * Fetches stats on this node's outgoing request communication with peer
	 * node at provided address.
	 *
	 * @note Providing address via instances of `Address` is preferred.
	 *
	 * @param {AnyAddress} address address of peer node
	 * @returns {?object} statistical information on peer node selected by address
	 */
	peerStats( address ) {
		const receiver = this._connections[Address( address ).id];

		return receiver ? receiver.stats : null;
	}
}

module.exports = { TransmittingNetwork };
