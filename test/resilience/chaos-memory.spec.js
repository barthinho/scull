"use strict";

const { suite } = require( "mocha" );

const ResilienceTestFactory = require( "./context/resilience-runner" );

suite( "resilience, chaos, in memory", function() {
	this.timeout( 30000 );

	ResilienceTestFactory( {
		chaos: true,
		persist: false,
	} );
} );
