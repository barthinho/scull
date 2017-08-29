'use strict';

const stateModules = {
	follower: require( './follower' ),
	candidate: require( './candidate' ),
	leader: require( './leader' ),
	weakened: require( './weakened' )
};

module.exports = function findState( stateName ) {
	const state = stateModules[stateName];
	if ( !state ) {
		throw new TypeError( 'state not found: ' + stateName );
	}

	return state;
};
