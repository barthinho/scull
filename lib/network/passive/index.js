'use strict';

const Network = require( './network' );

module.exports = function createNetwork( options ) {
	return new Network( options );
};
