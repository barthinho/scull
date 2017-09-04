'use strict';

const debug = require( 'debug' )( 'skiff.commands' );

/**
 *
 * @type {Commands}
 * @name Commands
 * @property {Address|string} id
 * @property {CommandQueue} queue
 * @property {Node} node
 */
module.exports = class Commands {
	/**
	 * @param {Address|string} id
	 * @param {CommandQueue} queue
	 * @param {Node} node
	 */
	constructor( id, queue, node ) {
		Object.defineProperties( this, {
			id: { value: id },
			queue: { value: queue },
			node: { value: node },
		} );

		this._dispatch();
	}

	_dispatch() {
		const commandMessage = this.queue.next();
		if ( !commandMessage ) {
			this.queue.once( 'readable', this._dispatch.bind( this ) );
		} else {
			const { command, callback, options } = commandMessage;

			debug( '%s: got command from queue: %j', this.id, command );

			this.node.command( command, options )
				.then( result => {
					debug( '%s: command ok: %j', this.id, command, result );
					process.nextTick( this._dispatch.bind( this ) );

					callback( null, result );
				}, error => {
					debug( '%s: command failed: %j', this.id, command, error );
					process.nextTick( this._dispatch.bind( this ) );

					callback( error );
				} );
		}
	}
};
