'use strict';

const NodeState = require( './base' );

/**
 * Implements specific behaviour of a node in _follower_ state.
 *
 * @type {NodeStateFollower}
 * @name NodeStateFollower
 */
module.exports = class NodeStateFollower extends NodeState {
	constructor( node, options ) {
		super( node, 'follower', options );
	}
};
