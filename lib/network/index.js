'use strict';

const PassiveNetwork = require( './passive' );
const ActiveNetwork = require( './active' );

module.exports = function createNetwork( options ) {
	return {
		active: new ActiveNetwork( options.active ),
		passive: new PassiveNetwork( options.passive )
	};
};
