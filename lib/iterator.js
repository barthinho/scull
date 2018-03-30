"use strict";

const { AbstractIterator } = require( "abstract-leveldown" );

/**
 * Implements iterator successively exposing entries of provided database as
 * (key,value)-tuples.
 */
class Iterator extends AbstractIterator {
	/**
	 * @param {Node} node manager of local node of cluster
	 * @param {DB} db actually used database backend
	 * @param {object} options options customizing stream used to read keys from database
	 */
	constructor( node, db, options ) {
		super( db );

		Object.defineProperties( this, {
			/**
			 * Refers to database iterated entries are streamed from.
			 *
			 * @name Iterator#db
			 * @property {DB}
			 * @readonly
			 */
			db: { value: db },

			/**
			 * Refers to manager of local node in cluster.
			 *
			 * @name Iterator#node
			 * @property {Node}
			 * @readonly
			 */
			node: { value: node },

			/**
			 * Provides options e.g. for customizing stream used to fetch
			 * iterated entries from database.
			 *
			 * @name Iterator#options
			 * @property {object}
			 * @readonly
			 */
			options: { value: Object.seal( options ) },
		} );

		this._haveConsensus = false;
	}

	/**
	 * Fetches next available entry from stream.
	 *
	 * @param {function(error:Error,key:string=,value:string=)} doneFn callback invoked w/ error or next available entry
	 * @returns {void}
	 */
	_next( doneFn ) {
		if ( !this._haveConsensus ) {
			this.node.readConsensus()
				.then( () => {
					this._haveConsensus = true;
					this._next( doneFn );
				} )
				.catch( doneFn );
			return;
		}

		if ( !this._stream ) {
			this._stream = this.db.createReadStream( this.options );
		}

		const stream = this._stream;

		const item = stream.read();
		if ( item ) {
			doneFn( null, item.key, item.value );
			return;
		}


		// there is no key available currently -> wait for another key, but
		// prepare to handle end of stream and errors as well
		stream.on( "close", onClose );
		stream.on( "end", onClose );
		stream.on( "finish", onClose );
		stream.on( "error", onError );

		stream.once( "readable", () => {
			cleanup();
			this._next( doneFn );
		} );

		/**
		 * Removes all listeners on stream handling special situations such as
		 * stream closed or encountering errors.
		 *
		 * @returns {void}
		 */
		function cleanup() {
			stream.removeListener( "close", onClose );
			stream.removeListener( "end", onClose );
			stream.removeListener( "finish", onClose );
			stream.removeListener( "error", onError );
		}

		/**
		 * Handles case of stream closed by notifying lack of any other key.
		 *
		 * @returns {void}
		 */
		function onClose() {
			cleanup();
			doneFn( null );
		}

		/**
		 * Handles stream error by forwarding it to iterator.
		 *
		 * @param {Error} error encountered error
		 * @returns {void}
		 */
		function onError( error ) {
			cleanup();
			doneFn( error );
		}
	}

	/**
	 * Handles case of ending iterator prematurely.
	 *
	 * @param {function} doneFn callback invoked when resources have been released
	 * @returns {void}
	 */
	_end( doneFn ) {
		this._stream.once( "close", doneFn );
		this._stream.destroy();
	}
}

module.exports = Iterator;
