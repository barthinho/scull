"use strict";

const Debug = require( "debug" )( "scull:command-queue" );
const Writable = require( "stream" ).Writable;

const defaultOptions = {
	objectMode: true
};


/**
 * Implements queue of pending commands to be processed. Commands are enqueued
 * using writable stream API.
 */
class CommandQueue extends Writable {
	/**
	 * @param {object} options customizations applied to underlying stream
	 */
	constructor( options ) {
		options = Object.assign( {}, defaultOptions, options || {} );

		super( options );

		Object.defineProperties( this, {
			/**
			 * Provides customizing options.
			 *
			 * @name CommandQueue#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( options ) },

			/**
			 * Lists pending commands.
			 *
			 * @name CommandQueue#pending
			 * @property {object[]}
			 * @protected
			 * @readonly
			 */
			pending: { value: [] },
		} );
	}

	/**
	 * Retrieves next command from queue.
	 *
	 * @returns {object} next command in queue, `undefined` if queue is empty
	 */
	next() {
		return this.pending.shift();
	}

	/** @inheritDoc */
	_write( message, _, callback ) {
		Debug( "_write %j", message );

		this.pending.push( message );

		callback();

		this.emit( "readable" );
	}
}

module.exports = CommandQueue;
