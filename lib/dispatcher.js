"use strict";

const { Writable } = require( "stream" );

const Debug = require( "debug" )( "scull.debug" );

const { deepMerge } = require( "./utils/object" );


const DEFAULT_OPTIONS = {
	maxPending: 100,
};


/**
 * Converts streamed messages into successively iterable ones.
 */
class Dispatcher extends Writable {
	/**
	 * @param {object} options options for customizing stream and max. size of queue
	 */
	constructor( options = {} ) {
		const _options = deepMerge( {}, DEFAULT_OPTIONS, options, { objectMode: true } );

		super( _options );

		Object.defineProperties( this, {
			/**
			 * Provides _options e.g. used to customize underlying stream.
			 *
			 * @name Dispatcher#_options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( _options ) },

			/**
			 * Lists pending messages.
			 *
			 * @name Dispatcher#pending
			 * @property {object[]}
			 * @readonly
			 * @protected
			 */
			pending: { value: [] },
		} );
	}

	/**
	 * Fetches next available message from queue or `null` if queue is empty.
	 *
	 * @returns {?object} fetches another pending message or null if queue is empty
	 */
	next() {
		return this.pending.shift() || null;
	}

	/** @inheritDoc */
	_write( message, _, done ) {
		Debug( "now PENDING: %j", message );

		const { pending, options } = this;
		const { maxPending = 100 } = options;

		// limit size of queue by dropping oldest message first
		if ( pending.length >= maxPending ) {
			pending.splice( 0, pending.length - maxPending - 1 );
		}

		pending.push( message );

		done();

		this.emit( "readable" );
	}
}

module.exports = Dispatcher;
