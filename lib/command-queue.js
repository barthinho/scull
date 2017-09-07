'use strict';

const Debug = require( 'debug' )( 'skiff.command-queue' );
const Writable = require( 'stream' ).Writable;
const Merge = require( 'deepmerge' );

const defaultOptions = {
	objectMode: true
};

module.exports = class CommandQueue extends Writable {
	constructor( options ) {
		options = Merge( defaultOptions, options || {} );

		super( options );

		Object.defineProperties( this, {
			options: { value: options },
			pending: { value: [] },
		} );
	}

	next( /*message*/ ) {
		return this.pending.shift();
	}

	_write( message, _, callback ) {
		Debug( '_write %j', message );

		this.pending.push( message );

		callback();

		this.emit( 'readable' );
	}
};
