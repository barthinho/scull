'use strict';

const debug = require( 'debug' )( 'skiff.commands' );

/**
 *
 * @type {Commands}
 * @name Commands
 * @property {Address|string} id
 * @property {CommandQueue} queue
 * @property {NodeState} state
 */
module.exports = class Commands {
	/**
	 * @param {Address|string} id
	 * @param {CommandQueue} queue
	 * @param {NodeState} state
	 */
	constructor( id, queue, state ) {
		Object.defineProperties( this, {
			id: { value: id },
			queue: { value: queue },
			state: { value: state },
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

			this.state.command( command, options, ( err, result ) => {
				if ( callback ) {
					callback( err, result );
				}

				process.nextTick( this._dispatch.bind( this ) );
			} );
		}
	}
};
