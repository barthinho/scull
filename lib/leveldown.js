'use strict';

const debug = require( 'debug' )( 'skiff.leveldown' );
const AbstractLevelDown = require( 'abstract-leveldown' ).AbstractLevelDOWN;

class LevelDown extends AbstractLevelDown {

	constructor( node ) {
		super( node.id.toString() );
		this._node = node;
	}

	_close( callback ) {
		this._node.stop().then( () => callback(), callback );
	}

	_get( key, options, callback ) {
		debug( 'get %j', key );
		this._node.command( { type: 'get', key }, options )
			.then( result => callback( null, result ), error => callback( error ) );
	}

	_put( key, value, options, callback ) {
		debug( 'put %j, %j', key, value );
		this._node.command( { type: 'put', key, value }, options )
			.then( result => callback( null, result ), error => callback( error ) );
	}

	_del( key, options, callback ) {
		debug( 'del %j', key );
		this._node.command( { type: 'del', key }, options )
			.then( result => callback( null, result ), error => callback( error ) );
	}

	_batch( array, options, callback ) {
		debug( 'batch %j', array );
		this._node.command( array, options )
			.then( result => callback( null, result ), error => callback( error ) );
	}

	_iterator( options ) {
		return this._node.iterator( options );
	}

}

module.exports = LevelDown;
