"use strict";

const { suite, test, setup, teardown } = require( "mocha" );

const Setup = require( "./context/setup" );
const ResilienceTestClient = require( "./context/client" );


// fails due to exceeding maximum number of listeners for event emitters
suite.skip( "resilience, large cluster, chaos, on disk", function() {
	this.timeout( 30000 );

	const { before, after, addresses, isLive, LogServer } = Setup( {
		chaos: true,
		persist: true,
		nodeCount: 7,
	} );

	setup( before );
	teardown( after );


	const duration = Math.max( parseInt( process.env.DURATION_MINS ) || 10, 1 );

	test( "works", function() {
		LogServer.log( "starting test for %d minute(s)", duration );

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
					LogServer.log( "stats: %j", client.stats );
					resolve();
				} )
				.catch( error => {
					clearTimeout( timeout );
					LogServer.log( "stats: %j", client.stats );
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
		} )
			.catch( error => LogServer.dump( 1 ).then( () => { throw error; } ) );
	} );
} );
