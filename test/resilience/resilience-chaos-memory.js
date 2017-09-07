'use strict';

const { experiment: describe, before, after, it } = exports.lab = require( 'lab' ).script();

const Setup = require( './setup' );
const Client = require( './setup/client' );

describe( 'resilience, chaos, in memory', () => {
	const setup = Setup();
	before( { timeout: 30000 }, setup.before );
	after( { timeout: 30000 }, setup.after );

	it( 'works', { timeout: 121000 }, done => {
		let timeout;
		const client = Client( setup.addresses, { duration: 120000 } );
		const emitter = client( ( err ) => {
			clearTimeout( timeout );
			console.log( 'stats: %j', emitter.stats );
			done( err );
		} );
		resetOperationTimeout();
		emitter.on( 'operation', resetOperationTimeout );

		function onOperationTimeout() {
			done( new Error( 'no operation for more than 11 seconds' ) );
		}

		function resetOperationTimeout() {
			if ( timeout ) {
				clearTimeout( timeout );
			}
			timeout = setTimeout( onOperationTimeout, 11000 );
		}
	} );
} );
