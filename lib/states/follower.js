"use strict";

const NodeState = require( "./base" );

/**
 * Implements specific behaviour of a node in _follower_ state.
 */
class NodeStateFollower extends NodeState {
	/**
	 * @param {Node} node manager of local node of cluster
	 * @param {object} options customizations
	 */
	constructor( node, options ) {
		super( node, "follower", options );
	}
}

module.exports = NodeStateFollower;
