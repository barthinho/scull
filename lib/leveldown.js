"use strict";

const Debug = require( "debug" )( "scull.leveldown" );
const { AbstractLevelDOWN } = require( "abstract-leveldown" );

/**
 * @typedef {object} DBAction
 * @property {string} type
 */

/**
 * @typedef {DBAction} WriteAction
 * @property {string} key
 * @property {string} value
 */

/**
 * @typedef {DBAction} ReadAction
 * @property {string} key
 */

/**
 * @typedef {DBAction} RemoveAction
 * @property {string} key
 */


/**
 * Exposes LevelDown API for use with current cluster node.
 */
class LevelDown extends AbstractLevelDOWN {
	/**
	 * @param {Shell} shell shell controlling local node of cluster
	 * @param {function(options:object):Iterator} iteratorFactory callback returning iterator instance on invocation
	 */
	constructor( shell, iteratorFactory ) {
		super( shell.id.toString() );

		Object.defineProperties( this, {
			/**
			 * Refers to shell controlling local node of cluster.
			 *
			 * @name LevelDown#shell
			 * @property {Shell}
			 * @readonly
			 */
			shell: { value: shell },

			/**
			 * Exposes callback retrieving iterator instances on invocation.
			 *
			 * @name LevelDown#iteratorFactory
			 * @property {function(options:object):Iterator}
			 * @readonly
			 */
			iteratorFactory: { value: iteratorFactory },
		} );
	}

	/**
	 * Releases resources on closing LevelDOWN API.
	 *
	 * @param {function(?Error)} doneFn callback invoked when resources have been release
	 * @returns {void}
	 * @protected
	 */
	_close( doneFn ) {
		this.shell.stop()
			.then( () => doneFn() )
			.catch( doneFn );
	}

	/**
	 * Implements code for fetching single record from database selected by its
	 * key.
	 *
	 * @param {string} key key of record to be fetched
	 * @param {object} options options for customizing retrieval of records
	 * @param {function(error:Error, record:object=)} doneFn callback invoked with eventually fetched record or on encountering error
	 * @returns {void}
	 * @private
	 */
	_get( key, options, doneFn ) {
		Debug( "get %j", key );

		this.shell.command( { type: "get", key }, options )
			.then( result => {
				Debug( "get %s: %j", key, result );
				doneFn( null, result );
			} )
			.catch( doneFn );
	}

	/**
	 * Implements code for writing single record into database.
	 *
	 * @param {string} key key of record
	 * @param {string} value value of record
	 * @param {object} options customizations
	 * @param {function(error:Error, record:object=)} doneFn callback invoked with result on success or on encountering error
	 * @returns {void}
	 * @private
	 */
	_put( key, value, options, doneFn ) {
		Debug( "put %j, %j", key, value );

		this.shell.command( { type: "put", key, value }, options )
			.then( result => doneFn( null, result ) )
			.catch( doneFn );
	}

	/**
	 * Implements code for removing single record from database selected by its
	 * key.
	 *
	 * @param {string} key key of record to be removed
	 * @param {object} options options for customizing removal of records
	 * @param {function(error:Error, record:object=)} doneFn callback invoked with result of removing record or on encountering error
	 * @returns {void}
	 * @private
	 */
	_del( key, options, doneFn ) {
		Debug( "del %j", key );

		this.shell.command( { type: "del", key }, options )
			.then( result => doneFn( null, result ) )
			.catch( doneFn );
	}

	/**
	 * Implements code writing and removing several records of database in a
	 * batch.
	 *
	 * @param {(WriteAction|RemoveAction)[]} array list of actions
	 * @param {object} options customizations
	 * @param {function(error:Error, record:object=)} doneFn callback invoked with result of removing record or on encountering error
	 * @returns {void}
	 * @private
	 */
	_batch( array, options, doneFn ) {
		Debug( "batch %j", array );

		this.shell.command( array, options )
			.then( result => doneFn( null, result ) )
			.catch( doneFn );
	}

	/**
	 * Retrieves iterator for successively fetching records from database.
	 *
	 * @param {object} options customizations
	 * @returns {void}
	 * @protected
	 */
	_iterator( options ) {
		return this.iteratorFactory( options );
	}
}

module.exports = LevelDown;
