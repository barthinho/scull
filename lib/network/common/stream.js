/**
 * (c) 2018 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 cepharum GmbH
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

const Net = require( "net" );
const { Duplex } = require( "stream" );

const Debug = require( "debug" )( "scull.stream" );

const Address = require( "../../data/address" );


/**
 * Implements stream for reading from/writing to underlying TCP socket which is
 * kept re-connecting to given address.
 */
class Stream extends Duplex {
	/**
	 * @param {AnyAddress} address address to connect with
	 * @param {?EventEmitter} emitter optional emitter to use instead of current instance for emitting events
	 * @param {object} options customizations e.g. for underlying duplex stream
	 */
	constructor( address, emitter = null, options = {} ) {
		super( options );

		const normalized = Address( address );

		let connectedBefore = false;
		let ended = false;

		Object.defineProperties( this, {
			/**
			 * Provides address of peer this instance keeps connecting with.
			 *
			 * @name Stream#address
			 * @property {Address}
			 * @readonly
			 */
			address: { value: normalized },

			/**
			 * Refers to EventEmitter instance to be used for emitting stream-
			 * related events.
			 *
			 * @name Stream#emitter
			 * @property {EventEmitter}
			 * @readonly
			 */
			emitter: { value: emitter || this },

			/**
			 * Provides customizations e.g. used on underlying duplex stream.
			 *
			 * @name Stream#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( options ) },

			/**
			 * Indicates if this stream has been connected ever before.
			 *
			 * @name Stream#connectedBefore
			 * @property {boolean}
			 * @readonly
 			 */
			connectedBefore: {
				get: () => connectedBefore,
				set: state => {
					if ( state ) {
						connectedBefore = Boolean( state );
					}
				},
			},

			/**
			 * Indicates if stream has been ended before.
			 *
			 * This flag is used to stop reconnecting managed socket.
			 *
			 * @name Stream#ended
			 * @property {boolean}
			 * @protected
			 */
			ended: {
				get: () => ended,
				set: state => {
					if ( state ) {
						ended = Boolean( state );
					}
				}
			}
		} );

		/**
		 * Promises underlying network socket.
		 *
		 * @name Stream#_socket
		 * @type {Promise<Socket>}
		 * @protected
		 */
		this._socket = null;

		/**
		 * Exposes current state of stream being connected or not.
		 *
		 * @name Stream#isConnected
		 * @type {boolean}
		 */
		this.isConnected = false;
	}

	/**
	 * Ends current stream.
	 *
	 * @returns {void}
	 */
	end() {
		this.ended = true;

		super.end();
	}

	/** @inheritDoc */
	_read() {} // eslint-disable-line no-empty-function

	/** @inheritDoc */
	_write( data, encoding, doneFn ) {
		const that = this;
		let attempt = 0;

		process.nextTick( trySending );

		/**
		 * Tries to send data to remote socket.
		 *
		 * @returns {void}
		 */
		function trySending() {
			if ( that.ended ) {
				if ( attempt === 0 ) {
					doneFn( Object.assign( new Error( "stream has been ended before" ), { code: "EPIPE" } ) );
				} else {
					doneFn();
				}

				return;
			}

			attempt++;

			that.getSocket()
				.then( socket => {
					socket.once( "error", handleError );
					socket.write( data, encoding, () => {
						socket.removeListener( "error", handleError );

						// make sure to invoke doneFn once, only
						const cb = doneFn;
						if ( cb ) {
							doneFn = null;
							cb();
						}
					} );
				} )
				.catch( handleError );
		}

		/**
		 * Handles error on sending by emitting warning event prior to trying
		 * again.
		 *
		 * @param {Error} error description of encountered error
		 * @returns {void}
		 */
		function handleError( error ) {
			const { emitter, address } = that;

			switch ( error.code ) {
				case "EPIPE" :
				case "ECONNRESET" :
					Debug( `lost connection w/ ${address.id} -> try new connection in 50ms` );

					setTimeout( trySending, 50 );
					return;

				case "ECONNREFUSED" :
					Debug( `failed to connect w/ ${address.id} -> try again in 50ms` );

					setTimeout( trySending, 50 );
					return;
			}

			emitter.emit( "error", error );

			// make sure to invoke doneFn once, only
			const cb = doneFn;
			if ( cb ) {
				doneFn = null;
				cb();
			}
		}
	}

	/**
	 * Sends provided chunk of data over socket.
	 *
	 * @param {Buffer} data data to be sent
	 * @returns {Promise} promises data sent
	 */
	send( data ) {
		return new Promise( ( resolve, reject ) => {
			this.write( data, () => {
				this.removeListener( "error", reject );
				resolve();
			} );

			this.once( "error", reject );
		} );
	}

	/**
	 * Fetches promise for socket connected with selected remote socket.
	 *
	 * @returns {Promise<Socket>} promises connected socket
	 */
	getSocket() {
		if ( !this._socket ) {
			const newPromise = this._socket = new Promise( ( resolve, reject ) => {
				const that = this;
				const { emitter, address } = this;

				let retryTimeoutMS = 0;


				Debug( `try connecting w/ remote socket at ${address.id}` );

				process.nextTick( tryConnecting );


				/**
				 * Tries to establish connection with remote socket.
				 *
				 * @returns {void}
				 */
				function tryConnecting() {
					let socket = new Net.Socket( that.options );

					socket.once( "connect", onConnect );
					socket.on( "error", onError );

					socket.connect( address.toSocketOptions() );


					/**
					 * Handles case of having established connection with remote
					 * socket.
					 *
					 * @returns {void}
					 */
					function onConnect() {
						Debug( `connection established w/ remote socket at ${address.id}` );

						socket.removeListener( "error", onError );

						emitter.emit( "connect", address, socket );

						if ( that.connectedBefore ) {
							emitter.emit( "reconnect", address, socket );
						} else {
							that.connectedBefore = true;
						}

						socket.on( "data", onData );
						socket.on( "finish", onDisconnect );
						socket.on( "end", onDisconnect );
						socket.on( "close", onDisconnect );

						that.isConnected = true;
						resolve( socket );
					}

					/**
					 * Handles data received via connected socket.
					 *
					 * @param {Buffer} chunk received chunk of data
					 * @returns {void}
					 */
					function onData( chunk ) {
						that.push( chunk );
					}

					/**
					 * Handles first event indicating loss of connection with
					 * remote socket.
					 *
					 * @returns {void}
					 */
					function onDisconnect() {
						if ( socket ) {
							Debug( `closing connection w/ remote socket at ${address.id}` );

							emitter.emit( "disconnect", address );

							socket.removeListener( "data", onData );
							socket.removeListener( "finish", onDisconnect );
							socket.removeListener( "end", onDisconnect );
							socket.removeListener( "close", onDisconnect );

							that.isConnected = false;

							if ( that._socket === newPromise ) {
								that._socket = null;
							}

							socket = null;
						}
					}

					/**
					 * Handles error encountered on socket while trying to connect
					 * with remote socket.
					 *
					 * @param {Error} error encountered error
					 * @returns {void}
					 */
					function onError( error ) {
						socket.removeListener( "connect", onConnect );

						switch ( error.code ) {
							case "EPIPE" :
							case "ECONNRESET" :
							case "ECONNREFUSED" :
								emitter.emit( "warning", error, address );
								retryTimeoutMS = Math.max( 50, Math.min( 5000, retryTimeoutMS * 2 ) );
								setTimeout( tryConnecting, retryTimeoutMS );
								break;

							default :
								emitter.emit( "error", error, address );
								reject( error );
						}
					}
				}
			} );
		}

		return this._socket;
	}

	/**
	 * Disconnects stream.
	 *
	 * Due to the nature of this stream this won't stop the stream from
	 * reconnecting again. This method is primarily available unit-testing
	 * the code.
	 *
	 * Use `Stream#end()` to explicitly shut down the stream.
	 *
	 * @returns {Promise<Socket>} promises stream disconnected
	 */
	disconnect() {
		return this.getSocket().then( socket => {
			socket.setTimeout( 1 );
			socket.end();
		} );
	}
}

module.exports = Stream;
