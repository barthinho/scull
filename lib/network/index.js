"use strict";

const Common = require( "./common" );
const Transmitting = require( "./transmitting" );
const Receiving = require( "./receiving" );


module.exports = Object.assign( {}, Common, Transmitting, Receiving );


/**
 * Manages current node's view on network.
 */
class NetworkView {
	/**
	 * @param {AnyAddress} localAddress provides address of locale node in cluster
	 * @param {{transmitting:object, receiving:object}} options customizing options
	 */
	constructor( localAddress, options = {} ) {
		const receiver = new Receiving.ReceivingNetwork( localAddress, ( options || {} ).receiving || {} );

		// make sure to use actual ID of node's listening socket on identifying transmitting socket next
		const _localAddress = receiver.address;

		const transmitter = new Transmitting.TransmittingNetwork( _localAddress, ( options || {} ).transmitting || {} );


		Object.defineProperties( this, {
			/**
			 * Provides local node's address in network.
			 *
			 * @name NetworkView#address
			 * @property {Address}
			 * @readonly
			 */
			address: { value: _localAddress },

			/**
			 * Refers to manager for sockets used to transmit messages to remote
			 * nodes of cluster.
			 *
			 * @name NetworkView#transmitting
			 * @property {TransmittingNetwork}
			 * @readonly
			 */
			transmitting: { value: transmitter },

			/**
			 * Refers to manager controlling node's listener socket accepting
			 * messages from remote nodes of cluster, only.
			 *
			 * @name NetworkView#receiving
			 * @property {ReceivingNetwork}
			 * @readonly
			 */
			receiving: { value: receiver },
		} );
	}
}

/**
 * Creates a transmitting and a receiving network instance for use with current
 * node.
 *
 * @param {AnyAddress} localAddress provides address of locale node in cluster
 * @param {{transmitting:object, receiving:object}} options customizing options
 * @returns {NetworkView} created network
 */
module.exports.createNetwork = function( localAddress, options = {} ) {
	return new NetworkView( localAddress, options );
};
