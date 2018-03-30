"use strict";

const NodeState = require( "./base" );

const stateModules = {
	follower: require( "./follower" ),
	candidate: require( "./candidate" ),
	leader: require( "./leader" ),
	weakened: require( "./weakened" )
};

/**
 * Finds class implement a node's behaviour specific to state selected by name.
 *
 * @param {string} stateName name of state
 * @param {?Node=} andCreateOnNode provide Node to fetch new instance of matching class rather than class itself
 * @param {?object=} withOptions options to apply on created state
 * @returns {Function|NodeState} implementation of found state or instance of it
 */
module.exports = function findState( stateName, andCreateOnNode = null, withOptions = {} ) {
	const State = stateModules[stateName];
	if ( !State ) {
		throw new TypeError( "state not found: " + stateName );
	}

	return andCreateOnNode ? new State( andCreateOnNode, withOptions ) : State;
};

module.exports.Leader = stateModules.leader;

/**
 * Detects if provided name is a valid state name.
 *
 * @param {*} item some value to be tested
 * @returns {boolean} true if provided value is implementation of a state
 */
module.exports.isState = item => item instanceof NodeState;

/**
 * Detects if provided name is a valid state name.
 *
 * @param {string} name probable name of a state
 * @returns {boolean} true if provided name is actually valid name of state
 */
module.exports.isValidName = name => stateModules.hasOwnProperty( name );
