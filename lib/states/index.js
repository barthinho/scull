'use strict';

const NodeState = require( './base' );

const stateModules = {
	follower: require( './follower' ),
	candidate: require( './candidate' ),
	leader: require( './leader' ),
	weakened: require( './weakened' )
};

/**
 * Finds class implement a node's behaviour specific to state selected by name.
 *
 * @param {string} stateName name of state
 * @param {?Node=} andCreateOnNode provide Node to fetch new instance of matching class rather than class itself
 * @param {?object=} withOptions options to apply on created state
 * @returns {Function|NodeState}
 */
module.exports = function findState( stateName, andCreateOnNode = null, withOptions = {} ) {
	const state = stateModules[stateName];
	if ( !state ) {
		throw new TypeError( 'state not found: ' + stateName );
	}

	return andCreateOnNode ? new state( andCreateOnNode, withOptions ) : state;
};

module.exports.Leader = stateModules.leader;

/**
 * Detects if provided name is a valid state name.
 *
 * @param {*} item
 * @returns {boolean}
 */
module.exports.isState = item => item instanceof NodeState;

/**
 * Detects if provided name is a valid state name.
 *
 * @param {string} name
 * @returns {boolean}
 */
module.exports.isValidName = name => stateModules.hasOwnProperty( name );
