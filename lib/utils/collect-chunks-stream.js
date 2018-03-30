"use strict";

const { Transform } = require( "stream" );

const defaultOptions = {
	batchSize: 10,
	objectMode: true
};

/**
 * @typedef {object} CollectedChunks
 * @property {object[]} chunks list of collected chunks
 * @property {boolean} finished set true if stream has been finished
 */

/**
 * Implements transformation stream collecting input chunks to be pushed as a
 * single output chunk on reaching certain amount.
 *
 * @name CollectChunksStream
 * @property {object<string,*>} options
 * @property {Array} chunks collected input chunks, representing single output chunk
 * @property {Boolean} finished marks if input has drained before; can be set, only
 */
module.exports = class CollectChunksStream extends Transform {
	/**
	 * @param {object} options customizations
	 */
	constructor( options ) {
		options = Object.assign( {}, defaultOptions, options || {} );

		super( options );

		const chunks = [];
		let finished = false;

		Object.defineProperties( this, {
			options: { value: options },
			chunks: { value: chunks },
			finished: {
				get: () => finished,
				set: () => { finished = true; },
			},
		} );
	}

	/** @inheritDoc */
	_transform( chunk, _, callback ) {
		this.chunks.push( chunk );

		process.nextTick( () => {
			if ( this.chunks.length >= this.options.batchSize ) {
				this._definitelyPush();
			}

			callback();
		} );
	}

	/** @inheritDoc */
	_flush() {
		this.finished = true;
		this._definitelyPush();
	}

	/**
	 * Pushes previously collected input chunks as single output chunk.
	 *
	 * @see installSnapshotPushCollectedChunk() is processing output chunks
	 *
	 * @returns {void}
	 * @private
	 */
	_definitelyPush() {
		// create copy of collected chunks to be pushed as single output chunk
		const chunks = this.chunks.slice();

		this.push( {
			finished: this.finished,
			chunks
		} );

		// reset internal list of collected chunks
		this.chunks.splice( 0, chunks.length );
	}
};
