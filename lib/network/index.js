'use strict';

const PassiveNetwork = require( './passive/network' );
const ActiveNetwork = require( './active/network' );

module.exports = function createNetwork( options = {} ) {
	return {
		active: new ActiveNetwork( options.active ),
		passive: new PassiveNetwork( options.passive )
	};
};
