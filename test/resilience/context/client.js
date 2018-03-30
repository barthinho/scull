"use strict";

const EventEmitter = require( "events" );
const Http = require( "http" );

const MultiAddress = require( "multiaddr" );


// const keys = [ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "x", "y", "z" ];
const keys = ["a"];
const defaultOptions = {
	duration: 60000,
	retryTimeout: 500,
};


/**
 * @typedef {object} PeerAddress
 * @property {string} hostname name of peer's host
 * @property {int} port peer's port number
 */

/**
 * Implements client running resilience test by continuously reading and writing
 * values associated to randomly selected keys from/to randomly picked nodes of
 * cluster listed by addresses on constructing client.
 *
 */
class ResilienceTestClient extends EventEmitter {
	/**
	 * @param {Address[]|string[]} addresses lists addresses of currently available peers
	 * @param {object} options customizing options
	 */
	constructor( addresses, options ) {
		super();

		this.stats = {
			operationsStarted: 0,
			operationsCompleted: 0,
		};

		/**
		 * Lists qualified customizations of current client.
		 *
		 * @type {object}
		 */
		this.options = Object.assign( {}, defaultOptions, options );

		/**
		 * Addresses timer used to detect end of client's desired runtime.
		 *
		 * @type {?*}
		 */
		this.timeout = null;

		/**
		 * Addresses leader node as provided in previously failing request.
		 *
		 * @type {?PeerAddress}
		 */
		this.leader = null;

		Object.defineProperties( this, {
			/**
			 * Provides timestamp in ms since Unix Epoch of moment when client
			 * was created.
			 *
			 * @name Client#created
			 * @property {int} timestamp of having created this client
			 * @readonly
			 */
			created: { value: Date.now() },

			/**
			 * Lists addresses of all currently available endpoints for sending
			 * requests to.
			 *
			 * @name Client#endpoints
			 * @property {PeerAddress[]} timestamp of having created this client
			 * @readonly
			 */
			endpoints: { value: addresses.map( address => this.constructor.addressToUrl( address ) ) },

			/**
			 * Tracks values per key written recently.
			 *
			 * @name Client#values
			 * @property {object<string,int>}
			 * @readonly
			 */
			values: { value: {} },
		} );

		for ( let i = 0; i < keys.length; i++ ) {
			this.values[keys[i]] = 0;
		}
	}

	/**
	 * Starts process of continuously querying peers for reading/writing values.
	 *
	 * @returns {Promise} promises having passed all tests after defined runtime has elapsed
	 */
	start() {
		return new Promise( ( resolve, reject ) => {
			this.timeout = setTimeout( resolve, this.options.duration );

			return this.work().then( resolve, reject );
		} );
	}

	/**
	 * Issues requests until configured duration of test run has elapsed.
	 *
	 * @returns {Promise} promises duration of test run having elapsed w/o error
	 */
	work() {
		return new Promise( ( resolve, reject ) => {
			this.stats.operationsStarted++;

			this.makeOneRequest()
				.then( () => {
					this.emit( "operation" );

					if ( Date.now() - this.created < this.options.duration ) {
						process.nextTick( () => this.work().then( resolve ).catch( reject ) );
					} else {
						clearTimeout( this.timeout );
						resolve();
					}
				} )
				.catch( err => {
					reject( err );
				} );

			this.emit( "operation started" );
		} )
			.then( () => {
				this.stats.operationsCompleted++;
			}, error => {
				this.stats.operationsCompleted++;
				throw error;
			} );
	}

	/**
	 * Randomly issues another request for either writing or reading value
	 * associated with random key to/from endpoint.
	 *
	 * @returns {Promise} promises successful request for either reading or writing value
	 */
	makeOneRequest() {
		const key = keys[Math.floor( Math.random() * keys.length )];

		return Math.random() > 0.5 ? this.makeOnePutRequest( key ) : this.makeOneGetRequest( key );
	}

	/**
	 * Issues request for writing value at current endpoint to be associated w/
	 * provided key.
	 *
	 * @param {string} key key to be fetched from endpoint
	 * @returns {Promise} promise value written successfully after optionally retrying request on recoverable errors
	 */
	makeOnePutRequest( key ) {
		const value = String( ++this.values[key] );

		return new Promise( ( resolve, reject ) => {
			/**
			 * Issues single request for putting value.
			 *
			 * @returns {void}
			 */
			const tryPut = () => {
				const endpoint = this.pickEndpoint();

				fetch( Object.assign( {}, endpoint, {
					method: "PUT",
					path: `/${key}`,
				} ), value )
					.then( response => this.parseResponse( response, endpoint, 201, tryPut, resolve, reject ) )
					.catch( error => this.parseError( error, tryPut, reject ) );
			};

			tryPut();
		} );
	}

	/**
	 * Issues request for reading back value associated w/ given key from
	 * current endpoint.
	 *
	 * @param {string} key key to be fetched from endpoint
	 * @returns {Promise} promise value read back successfully after optionally retrying request on recoverable errors
	 */
	makeOneGetRequest( key ) {
		const expectedValue = this.values[key];

		return new Promise( ( resolve, reject ) => {
			/**
			 * Issues single request for reading value.
			 *
			 * @returns {void}
			 */
			const tryGet = () => {
				const endpoint = this.pickEndpoint();

				fetch( Object.assign( {}, endpoint, {
					method: "GET",
					path: `/${key}`,
				} ) )
					.then( response => this.parseResponse( response, endpoint, 200, tryGet, payload => {
						const value = Number( payload ) || 0;
						if ( value === expectedValue ) {
							resolve();
						} else {
							reject( new Error( `GETting from ${endpoint} for key ${key}: expected ${expectedValue}, got ${value}` ) );
						}
					}, reject ) )
					.catch( error => this.parseError( error, tryGet, reject ) );
			};

			tryGet();
		} );
	}

	/**
	 * Retrieves address of current leader picking random endpoint if current
	 * leader isn't known.
	 *
	 * @returns {PeerAddress} address of endpoint
	 */
	pickEndpoint() {
		let endpoint = this.leader;
		if ( !endpoint ) {
			endpoint = this.endpoints[Math.floor( Math.random() * this.endpoints.length )];
		}

		return endpoint;
	}

	/**
	 * Parses response from endpoint.
	 *
	 * @param {ServerResponse} response response from peer
	 * @param {PeerAddress} endpoint address of endpoint
	 * @param {int} expectedHttpStatusCode expected HTTP status code
	 * @param {function} retry callback retrying action that has failed this time
	 * @param {function(*)} onPayload callback invoked w/ available payload
	 * @param {function(Error)} onFailed callback invoked on request has failed irrecoverably
	 * @returns {void}
	 */
	parseResponse( response, endpoint, expectedHttpStatusCode, retry, onPayload, onFailed ) {
		const { statusCode, payload } = response;

		if ( statusCode === expectedHttpStatusCode ) {
			onPayload( payload );
			return;
		}

		let error;
		try {
			error = JSON.parse( payload ).error;
		} catch ( e ) {
			error = {};
		}

		switch ( ( error || {} ).code ) {
			case "ENOTLEADER" :
			case "ENOMAJORITY" :
			case "EOUTDATEDTERM" :
				if ( error.leader ) {
					this.leader = this.constructor.addressToUrl( error.leader );
				} else {
					this.leader = null;
				}

				setImmediate( retry );
				break;

			case "ETIMEDOUT" :
				setImmediate( retry );
				break;

			default :
				onFailed( new Error( `response status code was ${statusCode}, response: ${payload}` ) );
		}
	}

	/**
	 * Parses low-level error encountered while trying to connect with peer.
	 *
	 * @param {Error} error encountered error
	 * @param {function} retry callback retrying action that has failed this time
	 * @param {function(Error)} fail callback marking current action to have failed
	 * @returns {void}
	 */
	parseError( error, retry, fail ) {
		switch ( error.code ) {
			case "ECONNREFUSED" :
			case "ECONNRESET" :
			case "ETIMEDOUT" :
				this.leader = null;
				setTimeout( retry, 100 );
				break;

			default :
				fail( error );
		}
	}

	/**
	 * Maps provided "multiaddr" into options fragment suitable for use with
	 * `http.request()`.
	 *
	 * @param {string} address some multiaddr instance
	 * @returns {PeerAddress} separately describes hostname and post of addressed endpoint
	 */
	static addressToUrl( address ) {
		return {
			hostname: "127.0.0.1",
			port: Number( MultiAddress( address.toString() ).nodeAddress().port ) + 1,
		};
	}
}

module.exports = ResilienceTestClient;


/**
 * Requests resource over HTTP promising response.
 *
 * @param {object} options options as provided to `http.request()`
 * @param {string|Buffer} payload payload to be sent to HTTP server
 * @returns {Promise<ServerResponse>} promises response from HTTP server
 */
function fetch( options, payload = null ) {
	return new Promise( ( resolve, reject ) => {
		const request = Http.request( Object.assign( {
			method: "GET",
			timeout: 8000,
		}, options ), function( response ) {
			response.on( "error", reject );

			const chunks = [];
			response.on( "data", chunk => chunks.push( chunk ) );
			response.on( "end", () => {
				resolve( Object.assign( {}, response, {
					payload: Buffer.concat( chunks ).toString( "utf8" ),
				} ) );
			} );
		} );

		request.on( "error", reject );

		if ( payload != null ) {
			request.write( payload );
		}

		request.end();
	} );
}
