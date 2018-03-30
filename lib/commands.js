"use strict";

const debug = require( "debug" )( "scull.commands" );

const CommandQueue = require( "./command-queue" );


/**
 * Implements driver for continuously fetching commands from queue of pending
 * commands for consecutive processing in context of local cluster node.
 */
class Commands {
	/**
	 * @param {Node} node local node manager
	 */
	constructor( node ) {
		Object.defineProperties( this, {
			/**
			 * Provides unique ID/address of local node.
			 *
			 * @name Commands#id
			 * @property {string}
			 * @readonly
			 */
			id: { value: String( node.id ) },

			/**
			 * Provides queue of pending commands.
			 *
			 * @name Commands#queue
			 * @property {CommandQueue}
			 * @readonly
			 */
			queue: { value: new CommandQueue() },

			/**
			 * Refers to manager of local node.
			 *
			 * @name Commands#node
			 * @property {Node}
			 * @readonly
			 */
			node: { value: node },
		} );

		this._dispatch();
	}

	/**
	 * Reads another message from stream/queue dispatching it to current node
	 * for processing contained command.
	 *
	 * @returns {void}
	 * @protected
	 */
	_dispatch() {
		const commandMessage = this.queue.next();
		if ( commandMessage ) {
			const { command, callback, options } = commandMessage;

			debug( "%s: got command from queue: %j", this.id, command );

			this.node.command( command, options )
				.then( result => {
					debug( "%s: command ok: %j", this.id, command, result );
					process.nextTick( this._dispatch.bind( this ) );

					callback( null, result );
				} )
				.catch( error => {
					debug( "%s: command failed: %j", this.id, command, error );
					process.nextTick( this._dispatch.bind( this ) );

					callback( error );
				} );
		} else {
			this.queue.once( "readable", this._dispatch.bind( this ) );
		}
	}
}

module.exports = Commands;
