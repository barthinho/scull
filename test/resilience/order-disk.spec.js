"use strict";

const { suite } = require( "mocha" );

const ResilienceTestFactory = require( "./context/resilience-runner" );

suite( "resilience, no chaos, on disk", function() {
	this.timeout( 30000 );

	ResilienceTestFactory( {
		chaos: false,
		persist: true,
	} );
} );
