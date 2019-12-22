"use strict";

const { suite, test, setup, teardown } = require( "mocha" );

const Setup = require( "./context/setup" );
const ResilienceTestClient = require( "./context/client" );


suite( "resilience, chaos, on disk", function() {
	this.timeout( 30000 );

	const { before, after, addresses, isLive } = Setup( {
		chaos: true,
		persist: true,
		nodeCount: 10,
	} );

	setup( before );
	teardown( after );


	const duration = Math.min( parseInt( process.env.DURATION_MINS ) || 60, 1 );

	test( "works", function() {
		this.timeout( ( duration * 60000 ) + 120000 );

		return new Promise( ( resolve, reject ) => {
			let timeout = null;

			const client = new ResilienceTestClient( addresses, {
				duration: duration * 60000,
				isLive,
			} );

			resetOperationTimeout();
			client.on( "operation", resetOperationTimeout );
			client.on( "warning", () => {
				reject( new Error( "server process writing to stderr unexpectedly" ) );
			} );

			client.start()
				.then( () => {
					clearTimeout( timeout );
					console.log( "stats: %j", client.stats ); // eslint-disable-line no-console
					resolve();
				} )
				.catch( error => {
					clearTimeout( timeout );
					console.log( "stats: %j", client.stats ); // eslint-disable-line no-console
					reject( error );
				} );


			/**
			 * Handles single request in a sequence of testing requests having
			 * timed out.
			 *
			 * @returns {void}
			 */
			function onOperationTimeout() {
				reject( new Error( "no operation for more than 11 seconds" ) );
			}

			/**
			 * Resets per-request timeout detection due to client having started
			 * another request.
			 *
			 * @returns {void}
			 */
			function resetOperationTimeout() {
				if ( timeout ) {
					clearTimeout( timeout );
				}

				timeout = setTimeout( onOperationTimeout, 11000 );
			}
		} );
	} );
} );
