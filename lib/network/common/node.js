"use strict";

const { Duplex } = require( "stream" );

const Debug = require( "debug" )( "scull:network:node" );

const Address = require( "../../data/address" );



/**
 * Represents single node of cluster in context of a local view on cluster
 * network.
 *
 * This manager is available for sending and receiving messages from described
 * node of cluster. It is always associated with some network declaring its node
 * in context of that network. The network is dropping any incoming package
 * unless it is originating from a node declared by some node manager.
 *
 * @name NetworkNode
 * @extends Duplex
 * @extends EventEmitter
 * @see class Network
 */
class NetworkNode extends Duplex {
	/**
	 * @param {AnyAddress} address address of node in network of cluster
	 * @param {Network} network instance of network this node is associated with
	 * @param {object} options customizing options
	 */
	constructor( address, network, options = {} ) {
		super( options );

		address = Address( address );

		Object.defineProperties( this, {
			/**
			 * Options provided for customizing this node.
			 *
			 * @name NetworkNode#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( options ) },

			/**
			 * Provides address of node.
			 *
			 * @name NetworkNode#address
			 * @property {Address}
			 * @readonly
			 */
			address: { value: address },

			/**
			 * Provides ID of node derived from its address.
			 *
			 * @name NetworkNode#id
			 * @property {string}
			 * @readonly
			 */
			id: { value: address.id },

			/**
			 * Refers to network this node manager is associated with.
			 *
			 * @name NetworkNode#network
			 * @property {Network}
			 * @readonly
			 */
			network: { value: network },
		} );
	}

	/**
	 * Detects if provided address is matching node's address.
	 *
	 * @param {AnyAddress} address address to compare
	 * @returns {boolean} true if given address is equivalent node's address
	 */
	match( address ) {
		return this.address.matches( address );
	}

	/** @inheritDoc */
	_read() {} // eslint-disable-line no-empty-function

	/** @inheritDoc */
	_write( message, _, done ) {
		this.network.write( message, error => {
			if ( error ) {
				Debug( `sending message FAILED: ${error.message}` );
			}

			// ignore errors to keep the stream running
			done();
		} );
	}

	/**
	 * Sends message to this node.
	 *
	 * @note This method is a promisified version of `Writable#write()`.
	 *
	 * @note By design the returned promise isn't rejected if writing failed.
	 *
	 * @param {object} message message to be sent
	 * @returns {Promise<object>} promises provided message when sent
	 */
	send( message ) {
		return new Promise( resolve => {
			this.network.write( message, error => {
				if ( error ) {
					Debug( `sending message FAILED: ${error.message}` );
				}

				// ignore errors to keep the stream running
				resolve( message );
			} );
		} );
	}
}

module.exports = { NetworkNode };
