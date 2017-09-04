'use strict';

const NodeState = require( './base' );

/**
 * Implements specific behaviour of a node in special _weakened_ state.
 *
 * @type {NodeStateWeakened}
 * @name NodeStateWeakened
 */
module.exports = class NodeStateWeakened extends NodeState {
	constructor( node, options ) {
		super( node, 'weakened', options );
	}

	start() {
		super.start();

		const node = this.node;

		node.untilNotWeakened( () => {
			if ( !this._stopped ) {
				node.transition( 'follower' );
			}
		} );
	}

	_onHeartbeatTimeout() {}
};
