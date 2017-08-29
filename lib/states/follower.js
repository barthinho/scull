'use strict';

const debug = require( 'debug' )( 'skiff.states.follower' );
const NodeState = require( './base' );

/**
 * Implements specific behaviour of a node in _follower_ state.
 *
 * @type {NodeStateFollower}
 * @name NodeStateFollower
 */
module.exports = class NodeStateFollower extends NodeState {

	start() {
		debug( '%s is follower', this.id );
		this.name = 'follower';
		super.start();
	}

};
