"use strict";

const Debug = require( "debug" )( "scull:network:receiving" );

const { Network, NetworkNode, NetworkMessage } = require( "../common" );
const { NetworkTcpServer } = require( "./server" );
const Address = require( "../../data/address" );
const Nodes = require( "../../data/nodes" );
const { deepMerge } = require( "../../utils/object" );


const DEFAULT_OPTIONS = {
	server: {
		port: 9163,
		host: "127.0.0.1", // selects local node's public IP on deriving its ID in cluster (ignored on providing
		exclusive: true,
		listen: "0.0.0.0", // set to IP to bind for listening, unset to use host address given before
	}
};


/**
 * Manages server-side view on network of cluster node.
 *
 * A receiving network basically consists of two elements:
 * - a server listening for incoming request messages
 * - a set of responder streams for responding to either connected peer
 */
class ReceivingNetwork extends Network {
	/**
	 * @param {AnyAddress} address address of node this network is used for
	 * @param {object} options customizations
	 */
	constructor( address = null, options = {} ) {
		// provide skiff-compatible provision of address in option `server`
		if ( options && options.server && ( !address || typeof address === "object" ) ) {
			address = Object.assign( {}, address || {}, options.server );
		}

		// normalize provided address
		address = Address( address );

		const localIp = address.toSocketOptions().host;
		switch ( localIp ) {
			case "0.0.0.0" :
			case "::" :
				throw new TypeError( `invalid public IP of local node in cluster: ${localIp}` );
		}

		// merge provided options w/ defaults and make sure to stream objects
		options = deepMerge( {}, DEFAULT_OPTIONS, options || {}, {
			objectMode: true,
		} );


		Debug( `create request listener at ${address.id} w/ options %j`, options );

		super( options );


		let pool = null;

		const nodes = {};


		// create and setup this network's listening server
		const serverAddress = address.toSocketOptions();
		const listenerAddress = options.server.public || { host: serverAddress.host };

		const listener = new NetworkTcpServer( this, Object.assign( {}, options.server, serverAddress, listenerAddress ) )
			.on( "data", message => {
				const node = this.nodes[address.id];
				if ( node && node.match( message.to ) ) {
					Debug( `REQUEST from ${message.from}: %j`, message );

					node.push( message );
				} else {
					Debug( `REQUEST from ${message.from} IGNORED` );
				}
			} )
			// forward some events of listener server to this instance
			.on( "warning", warn => this.emit( "warning", warn ) )
			.once( "listening", context => this.emit( "listening", context ) )
			.once( "close", () => this.emit( "close" ) );

		this.once( "finish", () => {
			listener.close();

			Object.keys( nodes )
				.forEach( id => {
					const node = nodes[id];
					if ( node ) {
						node.end();
						nodes[id] = undefined;
					}
				} );

			this.assignNodes( null );
		} );


		Object.defineProperties( this, {
			/**
			 * Provides address of node this network is listening for.
			 *
			 * @name ReceivingNetwork#address
			 * @type {Address}
			 * @readonly
			 */
			address: { value: address },

			/**
			 * Provides ID of node this network is listening for.
			 *
			 * @note The ID is derived from node's address.
			 *
			 * @name ReceivingNetwork#id
			 * @type {string}
			 * @readonly
			 */
			id: { value: address.id },

			/**
			 * @name Network#options
			 * @type {object}
			 * @readonly
			 */
			options: { value: options },

			/**
			 * Maps addresses of peer nodes into managers for receiving messages
			 * from either peer node.
			 *
			 * This listener does not process any messages claiming to originate
			 * from nodes to included with this map. This is used to prevent
			 * communication with nodes that haven't joined cluster before.
			 *
			 * @name Network#nodes
			 * @type {object<string,NetworkNode>}
			 * @readonly
			 */
			nodes: { value: nodes },

			/**
			 * Provides listening server handling incoming connections and
			 * receiving request messages via those connections from peers.
			 *
			 * @name Network#server
			 * @type {NetworkTcpServer}
			 * @readonly
			 * @protected
			 */
			server: { value: listener },

			/**
			 * Indicates if listening server is listening for incoming
			 * connections currently.
			 *
			 * @name Network#isListening
			 * @type {boolean}
			 * @readonly
			 */
			isListening: { get: () => listener.listening },

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

		// implicitly register local node to instantly accept incoming requests
		this.node( address.id );


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
		}
	}

	/** @inheritDoc */
	node( address, { createIfMissing = true } = {} ) {
		address = Address( address ).id;

		let node = this.nodes[address];
		if ( !node && createIfMissing ) {
			Debug( `enabling reception of messages from ${address} at ${this.server.id}` );

			node = new NetworkNode( address, this, this.options )
				.once( "finish", () => { this.nodes[address] = undefined; } );

			this.nodes[address] = node;
		}

		return node || null;
	}

	/** @inheritDoc */
	isValidNode( address ) {
		return this.nodesPool.has( address );
	}

	/** @inheritDoc */
	drop( address, options = {} ) { // eslint-disable-line no-unused-vars
		address = Address( address );

		if ( this.isValidNode( address ) && !address.matches( this.address ) ) {
			return new Promise( resolve => {
				const node = this.node( address );

				node.once( "finish", () => resolve( node ) );
				node.end();
			} );
		}

		return Promise.resolve( null );
	}

	/** @inheritDoc */
	assignNodes( nodes ) {
		this.nodesPool = nodes;

		return this;
	}

	/** @inheritDoc */
	_write( message, _, doneFn ) {
		try {
			message = NetworkMessage.normalize( message );
		} catch ( error ) {
			onWriteError( error );
			return;
		}

		if ( !this.isValidNode( message.from ) ) {
			onWriteError( new Error( "REPLY from unknown node REJECTED" ) );
			return;
		}

		if ( !this.address.matches( message.from ) ) {
			onWriteError( new Error( "REPLY on behalf of foreign node REJECTED" ) );
			return;
		}

		if ( !this.isValidNode( message.to ) ) {
			onWriteError( new Error( "REPLY to unknown node REJECTED" ) );
			return;
		}

		Debug( `REPLY to ${message.to}: %j`, message );

		this.server.write( message, doneFn );

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
}

module.exports = { ReceivingNetwork };
