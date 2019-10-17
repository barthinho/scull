"use strict";

const Net = require( "net" );
const { Duplex } = require( "stream" );

const Debug = require( "debug" )( "scull:network:server" );
const MsgPack = require( "msgpack5" );

const { NetworkMessage } = require( "../common/message" );



const DEFAULT_OPTIONS = {};


/**
 * Implements TCP socket listening for incoming connections from peers.
 *
 * - Server is a duplex stream.
 * - Incoming messages can be read from stream.
 * - Messages written to stream are sent to connected peer if there was an
 *   incoming message from that peer before.
 *
 *   @emits listening when listener socket starts listening
 */
class NetworkTcpServer extends Duplex {
	/**
	 * @param {ReceivingNetwork} network refers to manager of network this server is used for
	 * @param {object} options options for customizing server stream and socket
	 */
	constructor( network, options = {} ) {
		// normalize options, make sure object mode is enabled
		const _options = Object.assign( {}, DEFAULT_OPTIONS, options, {
			objectMode: true,
		} );

		super( _options );


		Debug( "creating with options %j", _options );

		// create server handling incoming TCP connections for sending encoded messages
		const listener = Net.createServer( socket => {
			const remoteId = `${socket.remoteAddress}:${socket.remotePort}`;

			Debug( `new connection from ${remoteId}` );


			// inject message codecs into input and output streams
			const msgPack = MsgPack();
			const decodingRx = msgPack.decoder();
			socket
				.pipe( decodingRx )
				.on( "error", error => {
					Debug( `error on receiving: ${error.stack}` );
					this.emit( "warning", error );
				} );

			const encodingTx = msgPack.encoder();
			encodingTx.pipe( socket )
				.on( "error", error => {
					Debug( `error on transmitting: ${error.stack}` );
					this.emit( "warning", error );
				} );


			// Handle incoming messages:
			// - Register stream for sending responses to peer message claims to
			//   originate from.
			// - Forward message to stream of current listener instance.
			decodingRx.on( "data", decodedData => {
				const message = NetworkMessage.normalize( decodedData );

				const { from } = message;
				if ( !from ) {
					Debug( `IGNORING message w/o sender from peer at ${remoteId}` );
					return;
				}

				if ( !network.nodesPool.has( from ) ) {
					Debug( `IGNORING message from external peer at ${remoteId}` );
					return;
				}

				Debug( "message from %s: %j", from, message );

				const responder = this.responders[from];
				if ( !responder || responder.stream !== encodingTx ) {
					Debug( `${responder ? "replacing" : "preparing"} responder to ${from}` );

					const newResponder = this.responders[from] = {
						stream: encodingTx,
						onFinish: () => {
							this.responders[from] = undefined;
						},
					};

					socket.once( "finish", newResponder.onFinish );

					if ( responder ) {
						// replaced some existing responder cached before
						// -> close/release previous one

						socket.removeListener( "finish", responder.onFinish );
						responder.stream.end();
					}
				}


				this.push( message );
			} );


			socket.once( "finish", () => Debug( `connection from ${remoteId} closed` ) );
		} );

		Object.defineProperties( this, {
			/**
			 * @name NetworkTcpServer#options
			 * @type {object}
			 * @readonly
			 */
			options: { value: Object.seal( _options ) },

			/**
			 * Exposes listening socket of server.
			 *
			 * @name NetworkTcpServer#socket
			 * @type {Server}
			 * @readonly
			 */
			socket: { value: listener },

			/**
			 * Maps addresses of peers requests have been received from before
			 * into writable streams available for sending replies to either
			 * peer.
			 *
			 * @name NetworkTcpServer#responders
			 * @type {object<string,{stream:Writable, onFinish:function}>}
			 * @readonly
			 */
			responders: { value: {} },

			/**
			 * Provides this listener's address.
			 *
			 * @note This property is `null` until the server is listening.
			 *
			 * @name NetworkTcpServer#address
			 * @type {?string}
			 * @readonly
			 */
			address: {
				value: null,
				configurable: true,
			},

			/**
			 * Promises server has stopped.
			 *
			 * @name NetworkTcpServer#onStopped
			 * @property {Promise}
			 * @readonly
			 */
			onStopped: { value: new Promise( resolve => listener.once( "close", resolve ) ) },
		} );


		const connections = [];

		listener.on( "connection", trackConnection );

		this.once( "closing", () => {
			connections.forEach( connection => {
				connection.setTimeout( 1 );
				connection.end();
			} );

			listener.removeListener( "connection", trackConnection );
		} );

		listener.once( "close", () => this.emit( "close" ) );
		listener.once( "error", socketError => this.emit( "error", socketError ) );

		listener.listen( _options, () => {
			const { family, address, port } = listener.address();

			Debug( `now listening at ${family} ${address}:${port}` );

			Object.defineProperties( this, {
				address: { value: `/${family.replace( /^ipv?(\d)$/i, "ip$1" )}/${address}/tcp/${port}` },
			} );

			this.emit( "listening", _options );
		} );

		/**
		 * Collects list of active connections this server is serving.
		 *
		 * @param {Socket} socket refers to socket freshly connected to another peer
		 * @returns {void}
		 */
		function trackConnection( socket ) {
			connections.push( socket );

			socket.once( "close", () => {
				const index = connections.findIndex( i => i === socket );
				if ( index > -1 ) {
					connections.splice( index, 1 );
				}
			} );
		}
	}

	/**
	 * Shuts down listener.
	 *
	 * @returns {void}
	 */
	close() {
		this.emit( "closing" );
		this.socket.close();
	}

	/** @inheritDoc */
	_read() {} // eslint-disable-line no-empty-function

	/** @inheritDoc */
	_write( message, _, doneFn ) {
		const recipientId = message.to.id;

		const responder = this.responders[recipientId];
		if ( responder ) {
			// got a request from given peer before -> send reply now
			Debug( `REPLY to ${recipientId}` );
			responder.stream.write( NetworkMessage.copyToSerializable( message ), doneFn );
		} else {
			Debug( `REJECTING REPLY to ${recipientId} w/o received request first` );
			doneFn();
		}
	}
}

module.exports = { NetworkTcpServer };
