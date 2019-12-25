"use strict";

const { suite } = require( "mocha" );

const ResilienceTestFactory = require( "./context/resilience-runner" );

suite( "resilience, chaos, on disk", function() {
	this.timeout( 30000 );

	ResilienceTestFactory( {
		chaos: true,
		persist: true,
	} );
} );
