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
const Crypto = require( "crypto" );
const Network = require( "net" );
const Utility = require( "util" );

const MsgPack = require( "msgpack5" )();
const Debug = require( "debug" );

const AddressWrapper = require( "../data/address" );


const DebugLog = Debug( "scull:rpc:client" );
const ErrorLog = Debug( "scull:error" );


const DEFAULT_OPTIONS = {
	connectionTimeout: 5000,
	rpcTimeout: 5000,
};


/**
 * @typedef {object} PendingCall
 * @property {function(result:*)} onResponse callback invoked with raw response to RPC call
 * @property {function(error:Error)} onFailure callback invoked with error encountered in context of socket
 */

/**
 * Implements client for TCP-based remote procedure calls.
 */
class RPCClient extends EventEmitter {
	/**
	 * @param {Address} myAddress this node's address
	 * @param {Address} peerAddress peer's address
	 * @param {RPCClientOptions} options parameters commonly customizing behaviour of client
	 */
	constructor( myAddress, peerAddress, options = {} ) {
		super();

		let local = null;

		Object.defineProperties( this, {
			/**
			 * Provides address of this node.
			 *
			 * @name RPCClient#me
			 * @property {Address}
			 * @readonly
			 */
			me: { value: AddressWrapper( myAddress ) },

			/**
			 * Provides local address of this node's client.
			 *
			 * @name RPCClient#local
			 * @property {Address}
			 * @readonly
			 */
			local: {
				get: () => local,
				set( value ) {
					local = value ? AddressWrapper( value ) : null;
				},
			},

			/**
			 * Provides address of linked peer.
			 *
			 * @name RPCClient#peer
			 * @property Address
			 * @readonly
			 */
			peer: { value: AddressWrapper( peerAddress ) },

			/**
			 * Caches pending requests.
			 *
			 * @name RPCClient#_pending
			 * @property {Map<string,PendingCall>}
			 * @protected
			 * @readonly
			 */
			_pending: { value: new Map() },

			/**
			 * Exposes options customizing client's behaviour.
			 *
			 * @name RPCClient#options
			 * @property {RPCClientOptions}
			 * @readonly
			 */
			options: { value: Object.freeze( Object.assign( {}, DEFAULT_OPTIONS, options ) ) },

			/**
			 * Indicates if client is currently connected or not.
			 *
			 * @name RPCClient#isConnected
			 * @property {boolean}
			 * @readonly
			 */
			isConnected: { get: () => local != null },
		} );
	}

	/**
	 * Invokes remote procedure running on linked node.
	 *
	 * @param {string} commandName name of remote procedure to call
	 * @param {object} commandArgs arguments for called remote procedure
	 * @param {boolean} resolveWithError set true to resolve promise with Error when remote procedure fails (instead of rejecting promise)
	 * @returns {Promise} promises result of calling remote procedure
	 */
	call( commandName, commandArgs = {}, { resolveWithError = false } = {} ) {
		return this.uuid()
			.then( uuid => {
				const message = {
					from: this.me.id,
					id: uuid,
					action: commandName,
					params: commandArgs,
				};

				// include call authentication
				if ( this.options.sessionKey ) {
					const hash = Crypto.createHmac( "sha256", this.options.sessionKey );
					hash.update( uuid );
					message.key = hash.digest( "hex" );
				}


				// connect with peer and send request
				return this.connect()
					.then( socket => {
						DebugLog( `${this.me} calling "${commandName}" @ ${this.peer} with %j`, commandArgs );

						const sent = Date.now();

						socket.write( MsgPack.encode( message ) );

						return new Promise( ( resolve, reject ) => {
							const that = this;
							const pending = this._pending;

							pending.set( uuid, {
								onResponse,
								onFailure,
							} );

							// apply timeout for peer responding
							const timer = setTimeout( () => {
								pending.delete( uuid );

								const text = `timeout after ${this.options.rpcTimeout}ms on RPC "${commandName}" @ ${this.peer} w/ %j`;
								reject( Object.assign( new Error( Utility.format( text, commandArgs ) ), { code: "ETIMEDOUT" } ) );
							}, this.options.rpcTimeout );


							/**
							 * Monitors incoming replies waiting for the one
							 * matching current call.
							 *
							 * @param {*} reply payload of reply
							 * @returns {void}
							 */
							function onResponse( reply ) {
								const latency = Date.now() - sent;
								const shortError = reply.error ? reply.error.replace( /\r?\n[\s\S]*$/, "" ) : "";

								that.emit( "rpc latency", latency, that.me.id, commandName );

								DebugLog( `${that.me} calling "${commandName}" @ ${that.peer} ${reply.success ? "succeeded" : "failed"} after ${latency}ms with %j`, reply.success ? reply.result : shortError );

								clearTimeout( timer );

								pending.delete( uuid );

								if ( reply.error ) {
									const error = Object.create( Error.prototype, {
										message: { value: shortError },
										stack: { value: reply.error },
									} );

									if ( reply.code ) {
										error.code = reply.code;
									}
									if ( reply.term ) {
										error.term = reply.term;
									}
									if ( reply.leader ) {
										error.leader = reply.leader;
									}

									( resolveWithError ? resolve : reject )( error );
								} else {
									resolve( reply.result );
								}
							}

							/**
							 * Handles error encountered in context of current
							 * socket.
							 *
							 * @param {Error} error description of encountered error
							 * @returns {void}
							 */
							function onFailure( error ) {
								clearTimeout( timer );

								pending.delete( uuid );

								reject( error );
							}
						} );
					} );
			} );
	}

	/**
	 * Establishes connection with linked node.
	 *
	 * @returns {Promise<Socket>} promises local socket of established connection
	 */
	connect() {
		if ( !this._connection ) {
			DebugLog( `${this.me} connecting with ${this.peer}` );

			this._connection = new Promise( ( resolve, reject ) => {
				const that = this;
				const socket = Network.connect( this.peer.toSocketOptions() );

				let connectionError = "ECONNABORTED";

				socket
					.once( "connect", onConnect )
					.once( "error", onFailedConnection );

				const timer = setTimeout( () => {
					socket.off( "connect", onConnect );
					socket.off( "error", onFailedConnection );

					this._connection = null;

					reject( Object.assign( new Error( `establishing connection with ${this.peer} timed out` ), { code: "ETIMEDOUT" } ) );
				}, this.options.connectionTimeout );


				/**
				 * Handles error while waiting for outgoing connection being
				 * established.
				 *
				 * @param {Error} error encountered error
				 * @returns {void}
				 */
				function onFailedConnection( error ) {
					socket.off( "connect", onConnect );
					clearTimeout();

					switch ( error.code ) {
						case "ECONNREFUSED" :
							that._connection = null;
							reject( error );
							break;

						default :
							that.emit( "error", error );
					}
				}

				/**
				 * Resolves promise for established connection with its local
				 * socket.
				 *
				 * @returns {void}
				 */
				function onConnect() {
					that.local = socket.address();

					DebugLog( `${that.me} has been connected with ${that.peer} (as ${that.local})` );

					clearTimeout( timer );

					socket
						.off( "error", onFailedConnection )
						.once( "end", () => { connectionError = "ECONNRESET"; } )
						.once( "error", onError )
						.once( "close", onDisconnect );

					that.emit( "connect", that.peer );


					/*
					 * prepare socket to decode and collect replies
					 */
					socket
						.pipe( MsgPack.decoder() )
						.on( "data", reply => {
							const uuid = reply.id;

							if ( that._pending.has( uuid ) ) {
								that._pending.get( uuid ).onResponse( reply );
							}
						} )
						.on( "error", error => {
							socket.destroy( new Error( `malformed incoming data on connection with ${that.peer}: ${error.message}` ) );
						} );


					resolve( socket );
				}

				/**
				 * Handles event of loosing connection with peer.
				 *
				 * @returns {void}
				 */
				function onDisconnect() {
					that._connection = null;
					that.local = null;

					if ( connectionError ) {
						const error = Object.assign( new Error( "connection lost" ), { code: connectionError } );

						for ( const pending of that._pending.values() ) {
							pending.onFailure( error );
						}
					}

					that.emit( "disconnect", that.peer );
				}

				/**
				 * Handles event of encountering error on established connection.
				 *
				 * @param {Error} error description of error
				 * @returns {void}
				 */
				function onError( error ) {
					socket.destroy();
					socket.removeAllListeners( "end" );

					connectionError = null;

					for ( const pending of that._pending.values() ) {
						pending.onFailure( error );
					}

					switch ( error.code ) {
						case "ECONNRESET" :
						case "ECONNABORTED" :
							break;

						default :
							that.emit( "error", error );
					}
				}
			} );
		}

		return this._connection;
	}

	/**
	 * Generates random UUID as string.
	 *
	 * @returns {Promise<string>} promises random UUID
	 */
	uuid() {
		return new Promise( ( resolve, reject ) => {
			Crypto.randomBytes( 16, ( error, buffer ) => {
				if ( error ) {
					reject( error );
				} else {
					resolve( buffer.toString( "hex" ) );
				}
			} );
		} );
	}

	/**
	 * Disconnects from RPC server.
	 *
	 * @returns {Promise} promises socket closed
	 */
	end() {
		if ( !this._connection ) {
			return Promise.resolve();
		}

		return this.connect()
			.then( socket => new Promise( ( resolve, reject ) => {
				DebugLog( `${this.me} is disconnecting from ${this.peer}` );

				const that = this;

				socket.once( "error", onError );
				socket.once( "close", onClose );

				socket.end();

				/**
				 * Handles event of eventually closing socket.
				 *
				 * @returns {void}
				 */
				function onClose() {
					DebugLog( `${that.me} has been disconnected from ${that.peer}` );

					socket.off( "error", onError );
					resolve();
				}

				/**
				 * Handles error on closing socket.
				 *
				 * @param {Error} error encountered error
				 * @returns {void}
				 */
				function onError( error ) {
					ErrorLog( `${that.me} has failed to disconnect from ${that.peer}: ${error.message}` );

					socket.off( "close", onClose );
					reject( error );
				}
			} ) );
	}
}

module.exports = { RPCClient };
