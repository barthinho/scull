"use strict";

const NodeState = require( "./base" );


/**
 * Implements specific behaviour of a node in special _weakened_ state.
 *
 * @type {NodeStateWeakened}
 * @name NodeStateWeakened
 */
class NodeStateWeakened extends NodeState {
	/**
	 * @param {Node} node reference on local node's basic manager
	 * @param {object} options customizing options
	 */
	constructor( node, options ) {
		super( node, "weakened", options );
	}

	/** @inheritDoc */
	start() {
		super.start();

		const node = this.node;

		node.untilNotWeakened( () => {
			if ( !this._stopped ) {
				node.transition( "follower" );
			}
		} );
	}

	/** @inheritDoc */
	_onHeartbeatTimeout() {} // eslint-disable-line no-empty-function
}

module.exports = NodeStateWeakened;
