/**
 * (c) 2019 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

"use strict";

const EventEmitter = require( "events" );

const Debug = require( "debug" );

const AddressWrapper = require( "../data/address" );
const { RPCServer } = require( "./server" );
const { RPCClient } = require( "./client" );


const DebugLog = Debug( "scull:rpc:network" );
const ErrorLog = Debug( "scull:error" );


const DEFAULT_OPTIONS = {
	connectionTimeout: 5000,
	rpcTimeout: 5000,
};


/**
 * @typedef {object} RPCOptions
 * @property {string} sessionKey session key used to authenticate requests
 */

/**
 * @typedef {RPCOptions} RPCClientOptions
 * @property {int} connectionTimeout timeout in milliseconds for establishing connection with single peer
 * @property {int} rpcTimeout timeout in milliseconds for replying to sent request
 */

/**
 * @typedef {RPCOptions} RPCServerOptions
 * @property {boolean} public always listen on 0.0.0.0 instead of IP provided as part of `myAddress`
 */

/**
 * @typedef {RPCServerOptions|RPCClientOptions} RPCNetworkOptions
 */

/**
 * @typedef {object} RPCAction
 * @property {string} action name of remote procedure to be called
 * @property {object} params parameters passed for customizing called procedure's behaviour
 */

/**
 * @typedef {RPCAction} RPCRequest
 * @property {string} type "request"
 * @property {string} id unique ID of request
 * @property {string} [key] request authentication, required when receiver is set up with session key
 */

/**
 * @typedef {RPCAction} RPCDescription
 * @property {string|Address} to recipient node procedure should be called at
 */

/**
 * @typedef {*} RPCResult
 */

/**
 * @typedef {object} RPCResultResponse
 * @property {boolean} success set true to indicate successful call of procedure
 * @property {RPCResult} result result of called procedure
 */

/**
 * @typedef {object} RPCErrorResponse
 * @property {string} error description of error encountered on calling procedure
 * @property {RPCResult} [result] result of called procedure
 */

/**
 * @typedef {RPCResultResponse|RPCErrorResponse} RPCResponse
 * @property {string} type "reply"
 * @property {string} id unique ID of related request (suitable for associating reply with request)
 */


/**
 * Represents current network of nodes from a single node's perspective.
 */
class RPCNetwork extends EventEmitter {
	/**
	 * @param {Address|string} myAddress current node's address/id
	 * @param {object} options customizations of network's behaviour
	 */
	constructor( myAddress, options = {} ) {
		super();

		let receiver;

		Object.defineProperties( this, {
			/**
			 * Exposes current node's ID or address in cluster of nodes.
			 *
			 * @name RPCNetwork#me
			 * @property {Address}
			 * @readonly
			 */
			me: { value: AddressWrapper( myAddress ) },

			/**
			 * Exposes options customizing network's behaviour.
			 *
			 * @name RPCNetwork#options
			 * @property {RPCNetworkOptions}
			 * @readonly
			 */
			options: { value: Object.freeze( Object.assign( {}, DEFAULT_OPTIONS, options ) ) },

			/**
			 * Maps IDs of registered peers of cluster into client for sending
			 * requests to either peer.
			 *
			 * @name RPCNetwork#_peers
			 * @property {Map<string,RPCClient>}
			 * @readonly
			 * @protected
			 */
			_peers: { value: new Map() },
		} );

		Object.defineProperties( this, {
			/**
			 * Exposes server handling incoming requests.
			 *
			 * @note The receiver is emitting event "rpc" on every incoming call.
			 *
			 * @name RPCNetwork#receiver
			 * @property {RPCServer}
			 * @readonly
			 */
			receiver: {
				get: () => receiver,
				set( newReceiver ) {
					if ( !newReceiver ) {
						receiver = null;
					} else if ( newReceiver instanceof RPCServer ) {
						receiver = newReceiver;
					} else {
						throw new TypeError( "invalid RPC server instance" );
					}
				}
			},
		} );

		/**
		 * @type {boolean}
		 * @private
		 */
		this._started = false;
	}

	/**
	 * Starts network by enabling listener and accepting incoming requests as
	 * well as providing clients for outgoing requests on demand.
	 *
	 * @returns {Promise<RPCNetwork>} promises network started
	 */
	start() {
		if ( !this.receiver ) {
			this.receiver = new RPCServer( this.me, this.options );
		}

		return this.receiver.started
			.then( () => {
				DebugLog( `${this.me} has been attached to network` );

				this._started = true;

				return this;
			} );
	}

	/**
	 * Stops network by shutting down listener, thus accepting no more incoming
	 * requests as well as rejecting to provide clients for outgoing requests on
	 * demand.
	 *
	 * @returns {Promise} promises server started
	 */
	stop() {
		this._started = false;

		DebugLog( `${this.me} is detaching from network` );

		return Promise.all( [
			( this.receiver ? this.receiver.shutdown() : Promise.resolve() ).then( () => {
				DebugLog( `${this.me} isn't listening for incoming requests (anymore)` );
			} )
		]
			.concat( Array.from( this._peers.values() ).map( peer => peer.end() ) ) );
	}

	/**
	 * Fetches client for sending requests to selected peer.
	 *
	 * @param {Address|string} peer ID or address of peer
	 * @param {object} options custom options for fetched client (ignored on using existing client)
	 * @returns {RPCClient} client for sending requests to selected peer
	 * @throws Error
	 */
	getPeer( peer, options = {} ) {
		if ( !this._started ) {
			ErrorLog( `${this.me} has to start its network before connecting with peer ${peer}` );
			throw new Error( "network must be started" );
		}

		const _peer = AddressWrapper( peer );
		if ( this._peers.has( _peer.id ) ) {
			return this._peers.get( _peer.id );
		}

		const client = new RPCClient( this.me, _peer, Object.assign( {}, this.options, options ) );

		this._peers.set( _peer.id, client );

		client.once( "end", () => this._peers.delete( _peer.id ) );

		return client;
	}
}

module.exports = { RPCNetwork };
