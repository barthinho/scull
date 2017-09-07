'use strict';

const Transform = require( 'stream' ).Transform;

const defaultOptions = {
	batchSize: 10,
	objectMode: true
};

/**
 * Implements transformation stream collecting input chunks to be pushed as a
 * single output chunk on reaching certain amount.
 *
 * @type {CollectChunksStream}
 * @name CollectChunksStream
 * @property {object<string,*>} options
 * @property {Array} chunks collected input chunks, representing single output chunk
 * @property {Boolean} finished marks if input has drained  before
 */
module.exports = class CollectChunksStream extends Transform {
	constructor( options ) {
		options = Object.assign( {}, defaultOptions, options || {} );

		super( options );

		let chunks = [];
		let finished = false;

		Object.defineProperties( this, {
			options: { value: options },
			chunks: { value: chunks },
			finished: {
				get: () => finished,
				set: () => finished = true,
			},
		} );
	}

	/**
	 * Collects another input chunk sending off output chunk on reaching desired
	 * output chunk size.
	 *
	 * @param {object} chunk
	 * @param {string} _ _unused_
	 * @param {function} callback to be called after processing provided chunk
	 * @private
	 */
	_transform( chunk, _, callback ) {
		this.chunks.push( chunk );

		process.nextTick( () => {
			if ( this.chunks.length >= this.options.batchSize ) {
				this._definitelyPush();
			}

			callback();
		} );
	}

	/**
	 * Processes previously collected input chunks left unsent on input draining
	 * including mark on having sent last package.
	 *
	 * This method is always pushing another output chunk to ensure sending mark
	 * on having pushed all available chunks.
	 *
	 * @see installSnapshotPushCollectedChunk() is processing output chunks
	 *
	 * @protected
	 */
	_flush() {
		this.finished = true;
		this._definitelyPush();
	}

	/**
	 * Pushes previously collected input chunks as single output chunk.
	 *
	 * @see installSnapshotPushCollectedChunk() is processing output chunks
	 *
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
