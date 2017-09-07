'use strict';

const { experiment: describe, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const MockUps = require( '../lib/utils/mockups' );


const {
	hasOutputOnStdError: hasStdError,
	resetOutputOnStdError: resetStdError,
} = MockUps;


describe( 'Leakage testing', () => {

	it( 'creates Dispatcher', done => {
		const Dispatcher = require( '../lib/incoming-dispatcher' );

		resetStdError();

		for ( let i = 0; i < 50; i++ ) {
			create();
		}

		function create() {
			return hasStdError() || new Dispatcher();
		}

		done();
	} );

	it( 'passed creating Dispatcher w/o writing to stderr', done => {
		expect( hasStdError() ).to.be.false();

		done();
	} );

	it( 'passes on creating Connections', done => {
		MockUps.generateShell( ( shell, finished ) => {
			const Connections = require( '../lib/data/connections' );

			resetStdError();

			for ( let i = 0; i < 50; i++ ) {
				create();
			}

			function create() {
				return hasStdError() || new Connections( shell, shell.options.peers ).stop();
			}

			finished();
		}, () => {
			expect( hasStdError() ).to.be.false();

			done();
		} );
	} );

} );
