"use strict";

const { Duplex } = require( "stream" );

const Debug = require( "debug" )( "scull.network.client" );
const MsgPack = require( "msgpack5" );

const { NetworkMessage } = require( "../common/message" );
const Address = require( "../../data/address" );
const Stream = require( "../common/stream" );



const DEFAULT_OPTIONS = {
	objectMode: true,
	highWaterMark: 50,
	inactivityTimeout: 5000,
};


/**
 * @typedef {object} NetworkStats
 * @property {int} receivedMessageCount total number of messages received from peer
 * @property {int} sentMessageCount total number of messages sent to peer
 * @property {int} lastReceived timestamp in milliseconds since Unix Epoch of last received message
 * @property {int} lastSent timestamp in milliseconds since Unix Epoch of last sent message
 */


/**
 * Manages communication channel to peer node.
 *
 * - This socket is a duplex stream in object mode.
 * - Written objects are binarily encoded and transmitted to peer via TCP
 *   connection.
 * - Binary data received from peer is decoded back into object and provided
 *   for reading from this stream.
 *
 * @name NetworkTcpClient
 * @extends Duplex
 */
class NetworkTcpClient extends Duplex {
	/**
	 * @param {Address|string} remoteAddress address of peer node to connect with
	 * @param {object} options custom options
	 */
	constructor( remoteAddress, options ) {
		const address = Address( remoteAddress );

		if ( !address.isTCP() ) {
			throw new TypeError( "invalid address of non-TCP peer socket rejected" );
		}

		Debug( `created client for emitting requests to ${address}` );

		options = Object.assign( {}, DEFAULT_OPTIONS, options );

		super( options );

		Object.defineProperties( this, {
			/**
			 * @name NetworkTcpClient#options
			 * @type {object}
			 * @readonly
			 */
			options: { value: options },

			/**
			 * Provides address of peer node this socket is connecting with.
			 *
			 * @name NetworkTcpClient#address
			 * @type {Address}
			 * @readonly
			 */
			address: { value: address },

			/**
			 * Provides ID of peer node derived from its address.
			 *
			 * @name NetworkTcpClient#id
			 * @type {string}
			 * @readonly
			 */
			id: { value: address.id },

			/**
			 * Provides statistical information on communication with peer node.
			 *
			 * @name NetworkTcpClient#stats
			 * @type {NetworkStats}
			 * @readonly
			 */
			stats: {
				value: {
					receivedMessageCount: 0,
					sentMessageCount: 0,
					lastReceived: 0,
					lastSent: 0,
				}
			},

			/**
			 * Indicates if connection to peer is established currently.
			 *
			 * @name NetworkTcpClient#isConnected
			 * @property {boolean}
			 * @readonly
			 */
			isConnected: {
				get: () => Boolean( this._encodingTx ),
			},

			/**
			 * Exposes reconnecting stream to peer.
			 *
			 * @name NetworkTcpClient#stream
			 * @property {Stream}
			 * @readonly
			 */
			stream: { value: new Stream( address ) },
		} );

		this.once( "finish", this._finish.bind( this ) );

		const handleError = error => {
			switch ( error.code ) {
				case "ECONNREFUSED" :
					break;

				default :
					Debug( `client-side network error:\n${error.stack}` );
					this.emit( "error", error );
			}
		};

		const stream = this.stream;

		stream.on( "connect", connectedAddress => {
			Debug( `connected with ${connectedAddress}` );

			this.resetInactivityTimeout();
		} );


		/*
		 * attach new encoder/decoder to freshly established TCP connection
		 */
		const msgPack = MsgPack();

		// establish sending channel to raw network connection with peer
		this._encodingTx = msgPack.encoder();
		this._encodingTx.pipe( stream );

		// establish receiving channel via raw network connection with peer
		const decodingRx = msgPack.decoder();
		stream.pipe( decodingRx );

		// forward decoded messages to readable part of this stream
		decodingRx.on( "data", decodedData => {
			this.stats.lastReceived = Date.now();
			this.stats.receivedMessageCount++;

			this.resetInactivityTimeout();

			const message = NetworkMessage.normalize( decodedData );

			Debug( "REPLY from %s: %j", this.id, message );

			this.push( message );
		} );

		// handle state events on receiving streams
		stream.on( "error", handleError );
		decodingRx.on( "error", handleError );
	}

	/**
	 * Resets timer emitting event after client has been inactive for some time.
	 *
	 * @returns {void}
	 */
	resetInactivityTimeout() {
		if ( this._inactivityTimeout ) {
			clearTimeout( this._inactivityTimeout );
		}

		this._inactivityTimeout = setTimeout( () => {
			this.emit( "inactivity timeout" );
		}, this.options.inactivityTimeout );
	}

	/** @inheritDoc */
	end( buf = undefined ) {
		Debug( `ending connection with ${this.id}` );
		super.end( buf );
	}

	/** @inheritDoc */
	_read() {
		// do nothing, we'll push data whenever wrapped message decoder emits it
	}

	/** @inheritDoc */
	_write( message, _, callback ) {
		// normalize and validate provided message
		try {
			message = NetworkMessage.normalize( message );
		} catch ( error ) {
			callback( error );
			return;
		}


		if ( this._encodingTx ) {
			Debug( `SENDING to ${this.id}: %j`, message );

			// currently connected with peer -> transmit
			this._encodingTx.write( NetworkMessage.copyToSerializable( message ), error => {
				if ( error ) {
					this.emit( "warning", error, this.id );
				}
			} );

			this.stats.lastSent = Date.now();
			this.stats.sentMessageCount++;
		} else {
			Debug( `FAILED SENDING to disconnected peer at ${this.id}: %j`, message );

			// locally simulate reply with error message
			process.nextTick( () => {
				this.push( Object.assign( NetworkMessage.deriveResponse( message, ["id"] ), {
					type: "reply",
					error: "not connected",
					fake: true,
					params: {
						success: false,
						reason: "not connected",
					},
				} ) );
			} );
		}

		callback();
	}

	/** @inheritDoc */
	_finish() {
		Debug( `finishing connection with ${this.id}` );
		this.stream.end();
	}
}

module.exports = { NetworkTcpClient };
