"use strict";

const EventEmitter = require( "events" );
const Http = require( "http" );
const Utility = require( "util" );

const MultiAddress = require( "multiaddr" );
const ClientLog = require( "debug" )( "scull:resilience:client" );
const LogServer = require( "./log-server" );

// ClientLog.log = LogServer.log;
ClientLog.log = LogServer.collect;
ClientLog.enabled = true;

const keys = [ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "x", "y", "z" ];
const defaultOptions = {
	duration: 60000,
	retryTimeout: 500,
	isLive() { return true; },
	nextStep( endpoints, options, pc ) {
		return {
			key: keys[Math.floor( Math.random() * keys.length )],
			put: Math.random() >= 0.5,
		};
	}
};


/**
 * @typedef {object} PeerAddress
 * @property {string} rawAddress original address in multiaddr format
 * @property {string} hostname name of peer's host
 * @property {int} port peer's port number
 */

/**
 * @typedef {function(endpoints: Array<PeerAddress>, options: ResilienceTestClientOptions, pc: int):{endpoint: PeerAddress, key: string, put: Boolean}} StepGenerator
 */

/**
 * @typedef {object} ResilienceTestClientOptions
 * @property {StepGenerator} nextStep callback invoked to describe next client action to perform
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
	 * @param {ResilienceTestClientOptions} options customizing options
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

		/**
		 * Indicates if client is meant to work currently.
		 *
		 * @type {boolean}
		 */
		this.running = false;

		Object.defineProperties( this, {
			/**
			 * Lists addresses of all currently available endpoints for sending
			 * requests to.
			 *
			 * @name Client#endpoints
			 * @property {PeerAddress[]}
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
	}

	before() {
		for ( let i = 0; i < keys.length; i++ ) {
			this.values[keys[i]] = -1;
		}

		console.log( "resetting database ..." );

		return new Promise( ( resolve, reject ) => {
			const putInitial = ( index, stopAt ) => {
				if ( index >= stopAt ) {
					console.log( "database reset" );

					setTimeout( resolve, 200 );
				} else {
					this.makeOnePutRequest( this.pickEndpoint(), keys[index] )
						.then( () => {
							process.nextTick( putInitial, index + 1, stopAt );
						} )
						.catch( reject );
				}
			};

			putInitial( 0, keys.length );
		} );
	}

	after() {
		console.log( "checking database ..." );

		return new Promise( ( resolve, reject ) => {
			const checkValue = ( index, stopAt ) => {
				if ( index >= stopAt ) {
					console.log( "database checked" );

					setTimeout( resolve, 200 );
				} else {
					this.makeOneGetRequest( this.pickEndpoint(), keys[index] )
						.then( () => process.nextTick( checkValue, index + 1, stopAt ) )
						.catch( reject );
				}
			};

			checkValue( 0, keys.length );
		} );
	}

	/**
	 * Starts process of continuously querying peers for reading/writing values.
	 *
	 * @returns {Promise} promises having passed all tests after defined runtime has elapsed
	 */
	start() {
		this.running = true;

		return this.before()
			.then( () => new Promise( ( resolve, reject ) => {
				this.timeout = setTimeout( () => {
					this.running = false;
				}, this.options.duration );

				this.work( error => {
					if ( error ) {
						reject( error );
					} else {
						this.after().then( resolve ).catch( reject );
					}
				} );
			} ) );
	}

	/**
	 * Issues requests until configured duration of test run has elapsed.
	 *
	 * @param {function(?Error)} doneFn callback invoked on error or when done
	 * @returns {void}
	 */
	work( doneFn ) {
		let { endpoint, key, put } = this.options.nextStep( this.endpoints, this.options, this.stats.operationsStarted++ ) || {};

		if ( endpoint == null ) {
			endpoint = this.pickEndpoint();
		}

		( put ? this.makeOnePutRequest( endpoint, key ) : this.makeOneGetRequest( endpoint, key ) )
			.then( () => {
				this.emit( "operation" );

				this.stats.operationsCompleted++;

				if ( this.running ) {
					process.nextTick( () => this.work( doneFn ) );
				} else {
					doneFn();
				}
			} )
			.catch( doneFn );

		this.emit( "operation started" );
	}

	/**
	 * Issues request for writing value at current endpoint to be associated w/
	 * provided key.
	 *
	 * @param {PeerAddress} endpoint node of cluster to query for request
	 * @param {string} key key to be fetched from endpoint
	 * @returns {Promise} promise value written successfully after optionally retrying request on recoverable errors
	 */
	makeOnePutRequest( endpoint, key ) {
		const value = String( ++this.values[key] );
		let attempts = 0;

		ClientLog( `PUT ${key} = %j ???`, value );

		return new Promise( ( resolve, reject ) => {
			/**
			 * Issues single request for putting value.
			 *
			 * @returns {void}
			 */
			const tryPut = () => {
				let peer = endpoint;

				if ( attempts > 2 ) {
					peer = this.pickEndpoint();
				}

				ClientLog( `... ${peer.port} @${++attempts}`, value );

				fetch( Object.assign( {}, peer, {
					method: "PUT",
					path: `/${key}`,
				} ), value )
					.then( response => this.parseResponse( response, peer, 201, tryPut, resolve, reject ) )
					.catch( error => this.parseError( error, tryPut, reject ) );
			};

			tryPut();
		} )
			.then( data => {
				ClientLog( `PUT ${key} = %j OK!`, value );
				return data;
			} );
	}

	/**
	 * Issues request for reading back value associated w/ given key from
	 * current endpoint.
	 *
	 * @param {PeerAddress} endpoint node of cluster to query for request
	 * @param {string} key key to be fetched from endpoint
	 * @returns {Promise} promise value read back successfully after optionally retrying request on recoverable errors
	 */
	makeOneGetRequest( endpoint, key ) {
		const expectedValue = this.values[key];
		let fastGet = true;
		let peer = endpoint;
		let attempts = 0;

		ClientLog( `GET ${key} ???` );

		return new Promise( ( resolve, reject ) => {
			/**
			 * Issues single request for reading value.
			 *
			 * @returns {void}
			 */
			const tryGet = () => {
				if ( attempts > 2 ) {
					peer = this.pickEndpoint();
				}

				ClientLog( `... ${peer.port} @${++attempts}${fastGet ? " (fast get)" : ""}` );

				fetch( Object.assign( {}, peer, {
					method: "GET",
					path: `/${key}`,
					headers: Object.assign( {}, fastGet ? {
						"x-consensus": 0,
					} : {} ),
				} ) )
					.then( response => this.parseResponse( response, peer, 200, tryGet, value => {
						if ( Number( value ) === expectedValue ) {
							// got expected value ...
							resolve( value );
						} else if ( fastGet ) {
							// haven't got expected value, but wasn't waiting for consensus, so try again w/ waiting
							fastGet = false;
							process.nextTick( tryGet );
						} else {
							reject( new Error( Utility.format( `GETting from %j for key ${key}: expected ${expectedValue}, got %j`, peer, value ) ) );
						}
					}, reject ) )
					.catch( error => this.parseError( error, tryGet, reject ) );
			};

			tryGet();
		} )
			.then( data => {
				ClientLog( `GET ${key} = %j`, data );
				return data;
			} );
	}

	/**
	 * Randomly picks currently running endpoint returning its address.
	 *
	 * @returns {PeerAddress} address of endpoint
	 */
	pickEndpoint() {
		const options = this.options;
		const endpoints = this.endpoints;
		const numEndpoints = endpoints.length;
		const indexes = [];

		for ( let i = 0; i < 100; i++ ) {
			const index = Math.floor( Math.random() * numEndpoints );
			const endpoint = endpoints[index];

			indexes.push( index );

			if ( options.isLive( endpoint ) ) {
				return endpoint;
			}
		}

		throw new Error( Utility.format( "RNG issue? failed picking endpoint: %j", indexes ) );
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

			case "ECONNREFUSED" :
				if ( !this.options.isLive( endpoint, true ) ) {
					// endpoint might have been killed intermittently
					setTimeout( retry, 1000 );
					break;
				}

				// falls through
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
		return Object.create( {}, {
			rawAddress: { value: address, enumerable: true },
			hostname: { value: "127.0.0.1", enumerable: true },
			port: { value: Number( MultiAddress( address.toString() ).nodeAddress().port ) + 1, enumerable: true },
		} );
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
