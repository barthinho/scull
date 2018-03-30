"use strict";

const PromiseTool = require( "promise-essentials" );

/**
 * Removes all records from LevelUP-compatible database available through
 * `this`.
 *
 * @this LevelUp
 * @returns {Promise} promises deletion of all entries in database
 */
module.exports = function clearDB() {
	return PromiseTool( this.createKeyStream(), key => {
		return new Promise( ( resolve, reject ) => {
			this.del( key, error => ( error ? reject( error ) : resolve() ) );
		} );
	} );
};
