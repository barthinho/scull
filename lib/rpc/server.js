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
const Network = require( "net" );
const Crypto = require( "crypto" );

const MsgPack = require( "msgpack5" )();
const Debug = require( "debug" );

const AddressWrapper = require( "../data/address" );


const DebugLog = Debug( "scull:rpc:server" );
const ErrorLog = Debug( "scull:error" );


const DEFAULT_OPTIONS = {};


/**
 * @typedef {object} PeerStats
 * @property {boolean} ending true if peer has ended connection, thus isn't expected to send further requests
 * @property {boolean} disconnected true if connection with peer has gone
 * @property {int} pending number of current pending procedure calls
 * @property {Socket} socket actual socket connected with peer
 */

/**
 * Implements TCP-based server for handling incoming remote procedure calls.
 *
 * The server emits "rpc" events for every incoming request for remotely running
 * a particular procedure. Listeners are invoked with
 *
 * - address of calling peer
 * - name of called procedure
 * - parameters for calling procedure
 * - Node.js callback to invoke with error (1st arg) or result (2nd arg) when
 *   procedure has finished
 */
class RPCServer extends EventEmitter {
	/**
	 * @param {Address} myAddress this node's address
	 * @param {RPCServerOptions} options parameters commonly customizing behaviour of server
	 */
	constructor( myAddress, options = {} ) {
		super();

		let onStarted, onStartFailed;

		const socket = Network.createServer( { allowHalfOpen: true } );

		Object.defineProperties( this, {
			/**
			 * Provides address of this node.
			 *
			 * @name RPCServer#me
			 * @property {Address}
			 * @readonly
			 */
			me: { value: AddressWrapper( myAddress ) },

			/**
			 * Exposes options customizing server's behaviour.
			 *
			 * @name RPCServer#options
			 * @property {RPCServerOptions}
			 * @readonly
			 */
			options: { value: Object.freeze( Object.assign( {}, DEFAULT_OPTIONS, options ) ) },

			/**
			 * Exposes internal stats managed per existing peer.
			 *
			 * @name RPCServer#_clients
			 * @property {Map<string,PeerStats>}
			 */
			_clients: { value: new Map() },

			/**
			 * Promises server started.
			 *
			 * @name RPCServer#started
			 * @property {Promise<RPCServer>}
			 * @readonly
			 */
			started: { value: new Promise( ( resolve, reject ) => {
				onStarted = resolve;
				onStartFailed = reject;
			} ) },

			/**
			 * Exposes socket used to listen for incoming connections.
			 *
			 * @name RPCServer#_socket
			 * @property {Socket}
			 * @readonly
			 * @protected
			 */
			_socket: { value: socket },
		} );


		const local = this.me.toSocketOptions();
		if ( this.options.public ) {
			local.host = local.family === 4 ? "0.0.0.0" : "::";
		}

		let requestCounter = 0;

		socket
			.once( "error", onStartFailed )
			.on( "connection", client => {
				const peerAddress = AddressWrapper( { address: client.remoteAddress, port: client.remotePort } );
				const peerId = peerAddress.id;

				if ( this._clients.has( peerId ) ) {
					ErrorLog( `${this.me} rejecting another link from same peer ${peerId} (might be due to timing issue or memory leak)` );

					client.destroy();
					return;
				}

				const stats = {
					ending: false,
					disconnected: false,
					pending: 0,
					socket: client,
				};

				this._clients.set( peerId, stats );

				DebugLog( `${this.me} accepts incoming connection from ${peerId}` );

				client.once( "end", () => {
					DebugLog( `${this.me} does not receive further requests from ${peerId} (processing ${stats.pending} request(s))` );

					if ( stats.pending > 0 ) {
						stats.ending = true;
					} else {
						client.end();
					}
				} );

				client.once( "error", error => {
					switch ( error.code ) {
						case "ETIMEDOUT" :
							ErrorLog( `${this.me} incoming connection from ${peerId} has timed out: ${error.message}` );
							break;

						case "ECONNRESET" :
						case "ECONNABORTED" :
							ErrorLog( `${this.me} incoming connection from ${peerId} lost: ${error.message}` );
							break;

						default :
							ErrorLog( `${this.me} socket of incoming connection from ${peerId} has failed: ${error.message}` );
							this.emit( "error", error );
					}

					client.destroy();
				} );

				client.once( "close", () => {
					stats.disconnected = true;

					this._clients.delete( peerId );
				} );


				const decoder = MsgPack.decoder();
				client.pipe( decoder );

				const { sessionKey } = this.options;

				decoder.on( "data", request => {
					const that = this;
					const requestId = "@" + String( ++requestCounter ).padStart( 8, "0" );
					const { from, id, key, action, params } = request || {};

					if ( !from || !id || !action ) {
						DebugLog( `${this.me} ${requestId} ignoring invalid call from ${peerId}` );
						return;
					}

					let _from;

					try {
						_from = AddressWrapper( from );
					} catch ( e ) {
						ErrorLog( `${this.me} ${requestId} ignoring call w/o valid sender ID ${from}` );
						return;
					}

					stats.pending++;

					if ( sessionKey ) {
						// require authenticated calls
						if ( !request.key ) {
							ErrorLog( `${this.me} ${requestId} missing authentication for calling "${action}" from ${_from} (${peerId})` );
							respond( Object.assign( new Error( "missing authentication" ), { code: "EACCES" } ) );
							return;
						}

						const hash = Crypto.createHmac( "sha256", sessionKey );
						hash.update( id );
						if ( key !== hash.digest( "hex" ) ) {
							ErrorLog( `${this.me} ${requestId} invalid authentication for calling "${action}" from ${_from} (${peerId})` );
							respond( Object.assign( new Error( "invalid authentication" ), { code: "EACCES" } ) );
							return;
						}
					} else if ( key ) {
						ErrorLog( `${this.me} ${requestId} unexpected authentication for calling "${action}" from ${_from} (${peerId})` );
						respond( Object.assign( new Error( "unexpected authentication" ), { code: "EACCES" } ) );
						return;
					}

					DebugLog( `${this.me} ${requestId} incoming request from ${_from} (${peerId}) for calling "${action}" with %j`, params );

					try {
						if ( !this.emit( "rpc", _from, action, params || {}, respond ) ) {
							// noinspection ExceptionCaughtLocallyJS
							throw new Error( "missing RPC call handler" );
						}
					} catch ( error ) {
						respond( error );
					}


					/**
					 * Responds to incoming RPC request.
					 *
					 * @param {?Error} error description of error to report back to requesting client
					 * @param {*} result result to return to requesting client
					 * @returns {void}
					 */
					function respond( error = null, result = null ) {
						if ( stats.disconnected ) {
							ErrorLog( `${that.me} ${requestId} dropping reply for ${action} to now disconnected client at ${_from} (${peerId})` );
							return;
						}

						const message = { id };

						if ( error ) {
							if ( process.env.NODE_ENV === "production" ) {
								message.error = String( error.message || error || "unknown error" );
							} else {
								message.error = String( error.stack || error.message || error || "unknown error" );
							}

							message.error = message.error.replace( /^Error:\s/, "" );

							if ( error.code ) {
								message.code = error.code;
							}
							if ( error.term ) {
								message.term = error.term;
							}
							if ( error.leader ) {
								message.leader = error.leader;
							}

							switch ( error.code ) {
								case "EOUTDATEDTERM" :
									DebugLog( `${that.me} ${requestId} calling "${action}" from ${_from} (${peerId}) failed: %s`, error.message );
									break;

								default :
									ErrorLog( `${that.me} ${requestId} calling "${action}" from ${_from} (${peerId}) failed: %s`, error.message );
							}
						} else {
							message.result = result;

							DebugLog( `${that.me} ${requestId} responds to call for "${action}" from ${_from} (${peerId}) with %j`, message.result );
						}

						--stats.pending;

						if ( stats.ending && stats.pending < 1 ) {
							DebugLog( `${that.me} ${requestId} sends last response to ${_from} (${peerId})` );

							client.end( MsgPack.encode( message ) );
						} else {
							client.write( MsgPack.encode( message ) );
						}
					}
				} );

				decoder.on( "error", error => {
					client.destroy( new Error( `decoding request package from ${peerId} failed: ${error.message || error}` ) );
				} );
			} )
			.listen( local.port, local.host, () => {
				DebugLog( `${this.me} is listening for incoming requests on port ${socket.address().address}:${socket.address().port} now` );

				socket.off( "error", onStartFailed );
				onStarted( this );
			} );
	}

	/**
	 * Shuts down server.
	 *
	 * @returns {Promise} promises listener for incoming request has been shut down and all outgoing replies have been sent
	 */
	shutdown() {
		const processes = [
			new Promise( ( resolve, reject ) => {
				DebugLog( `${this.me} stops listening for incoming requests` );

				this._socket.close( error => {
					if ( error ) {
						ErrorLog( `${this.me} failed to stop listening for incoming requests: ${error.message}` );
						reject( error );
					} else {
						DebugLog( `${this.me} has stopped listening for incoming requests` );
						resolve();
					}
				} );
			} ),
		].concat(
			Array.from( this._clients.entries() )
				.map( ( [ clientId, client ] ) => new Promise( ( resolve, reject ) => {
					DebugLog( `${this.me} is disconnecting from ${clientId}` );

					const that = this;
					const { pending, socket } = client;

					if ( pending > 0 ) {
						client.ending = true;
					} else {
						client.socket.end();
					}

					socket.once( "close", onClose );
					socket.once( "error", onError );

					/**
					 * Handles event of client socket closed.
					 *
					 * @returns {void}
					 */
					function onClose() {
						DebugLog( `${that.me} has been disconnected from ${clientId}` );

						socket.off( "error", onError );
						resolve();
					}

					/**
					 * Handles event of client socket failure before closing it.
					 *
					 * @param {Error} error socket failure
					 * @returns {void}
					 */
					function onError( error ) {
						ErrorLog( `${that.me} failed to disconnect from ${clientId}: ${error.message}` );

						socket.off( "close", onClose );
						reject( error );
					}
				} ) )
		);

		return Promise.all( processes );
	}
}

module.exports = { RPCServer };
