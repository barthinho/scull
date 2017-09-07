'use strict';

const debug = require( 'debug' )( 'skiff.network.peer' );
const Duplex = require( 'stream' ).Duplex;
const Msgpack = require( 'msgpack5' );

const Address = require( '../../data/address' );
const reconnect = require( './reconnect' );
const OK_ERRORS = require( './errors' ).OK_ERRORS;

const defaultOptions = {
	objectMode: true,
	highWaterMark: 50,
	inactivityTimeout: 5000
};

const interestingEvents = [
	'connect',
	'reconnect',
	'disconnect',
	'error'
];

const reconnectOptions = {
	immediate: true,
	maxDelay: 5000
};

class Peer extends Duplex {

	constructor( address, _options ) {
		debug( 'constructing peer from address %j', address );
		const options = Object.assign( {}, defaultOptions, _options );
		super( options );
		this._options = options;
		this._address = Address( address );

		this._stats = {
			receivedMessageCount: 0,
			sentMessageCount: 0,
			lastReceived: 0,
			lastSent: 0
		};

		this.once( 'finish', this._finish.bind( this ) );

		this._connect();
	}

	end( buf ) {
		debug( 'peer end() called for peer %s', this._address );
		super.end( buf );
	}

	_connect() {
		debug( 'connecting to %s', this._address );
		const self = this;

		this._reconnect = reconnect( reconnectOptions, ( peerRawConn ) => {
			debug( 'connected to peer %s', this._address );
			let inactivityTimeout;
			resetInactivityTimeout();

			const msgpack = Msgpack();

			// to peer
			this._out = msgpack.encoder();

			this._out.pipe( peerRawConn );

			// from peer
			const fromPeer = msgpack.decoder();
			peerRawConn.pipe( fromPeer );

			fromPeer.on( 'data', ( data ) => {
				this._stats.lastReceived = Date.now();
				this._stats.receivedMessageCount++;
				resetInactivityTimeout();
				debug( 'some data from peer: %j', data );
				self.push( data );
			} );

			peerRawConn.on( 'error', handlePeerError );
			fromPeer.on( 'error', handlePeerError );

			peerRawConn.on( 'close', () => {
				this._out = undefined;
				clearTimeout( inactivityTimeout );
			} );

			process.nextTick( () => self.emit( 'connect' ) );

			function resetInactivityTimeout() {
				if ( inactivityTimeout ) {
					clearTimeout( inactivityTimeout );
				}
				inactivityTimeout = setTimeout( onInactivityTimeout, self._options.inactivityTimeout );
			}

			function onInactivityTimeout() {
				self.emit( 'inactivity timeout' );
			}
		} )
			.on( 'error', handlePeerError )
			.on( 'disconnect', () => {
				debug( 'disconnected from %s', this._address );
				this._out = undefined;
				this.emit( 'disconnect' );
			} );

		interestingEvents.forEach( ( event ) => {
			this._reconnect.on( event, ( payload ) => {
				this.emit( event, payload );
			} );
		} );

		this._reconnect.connect( this._address );

		function handlePeerError( err ) {
			if ( OK_ERRORS.indexOf( err.code ) === -1 ) {
				debug( 'relaying error:\n%s', err.stack );
				self.emit( 'error', err );
			}
		}
	}

	_read( /*size*/ ) {
		// do nothing, we'll emit data when the peer emits data
	}

	_write( message, encoding, callback ) {
		debug( 'writing %j to %s', message, this._address );

		if ( !message ) {
			return;
		}
		if ( message.to ) {
			message.to = message.to.toString();
		}
		if ( message.from ) {
			message.from = message.from.toString();
		}

		if ( this._out ) {
			try {
				this._out.write( message, ( err ) => {
					if ( err ) {
						this.emit( 'warning', err );
					}
					// keep the juice flowing
					callback();
				} );
				this._stats.lastSent = Date.now();
				this._stats.sentMessageCount++;
			} catch ( err ) {
				this.emit( 'warning', err, this._address.toString() );
			}
		} else {
			debug( 'have message, but not connected to peer %s', this._address );
			// if we're not connected we discard the message
			// and reply with error
			setImmediate( () => {
				this.push( {
					type: 'reply',
					from: message.to,
					id: message.id,
					error: 'not connected',
					fake: true,
					params: {
						success: false,
						reason: 'not connected'
					}
				} );
			} );
			callback();
		}
	}

	_finish() {
		debug( 'finishing connection to peer %s', this._address );
		this._reconnect.disconnect();
	}

	stats() {
		return this._stats;
	}

}

module.exports = Peer;
