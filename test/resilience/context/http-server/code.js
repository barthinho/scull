"use strict";

/**
 * Implements HTTP server exposing read/write access on scull-based cluster for
 * testing purposes.
 *
 * This server is running in a separate sub-process controlled by HttpServerNode
 * implemented in local file process.js.
 */

const Http = require( "http" );
const { join } = require( "path" );

const MemDown = require( "memdown" );

const Shell = require( "../../../../" );


const port = Number( process.argv[2] );
const address = `/ip4/127.0.0.1/tcp/${port}`;
const options = Object.assign( {},
	process.argv[3] ? JSON.parse( process.argv[3] ) : {},
	{
		location: join( __dirname, "..", "..", "data" )
	}
);

if ( !options.persist ) {
	options.db = MemDown();
}



const node = new Shell( address, options );
node.on( "warning", err => { throw err; } );

const db = node.levelDown();


const server = Http.createServer( function( req, res ) {
	const key = req.url.substring( 1 );

	switch ( req.method ) {
		case "PUT" : {
			const body = [];

			req
				.on( "data", chunk => body.push( chunk ) )
				.once( "end", () => {
					db.put( key, Number( Buffer.concat( body ).toString( "utf8" ) ), generateDbResultHandler( key, res, 201 ) );
				} );

			break;
		}

		case "GET" :
			db.get( key, generateDbResultHandler( key, res ) );
			break;

		default :
			res.statusCode = 404;
			res.end( encodeError( new Error( "Not found" ) ) );
	}
} );


let timer = Date.now();

Promise.all( [
	new Promise( resolve => server.listen( port + 1, resolve ) ),
	node.start( true ),
] )
	.then( () => {
		console.log( `server ${address} started${node.is( "leader" ) ? " as leader" : ""}` ); // eslint-disable-line no-console

		node.on( "new state", ( state, oldState ) => {
			const now = Date.now();
			const delay = now - timer;
			timer = now;

			console.log( "new state: %s -> %s   %s ms", ( oldState || "" ).padStart( 10 ), state.padStart( 10 ), String( "+" + delay ).padStart( 6 ) );
		} );

		node.on( "up-to-date", () => {
			const now = Date.now();
			const delay = now - timer;
			timer = now;

			console.log( "up-to-date   %s ms", String( "+" + delay ).padStart( 6 ) );
		} );
	} )
	.catch( error => {
		console.log( `server ${address} failed: ${error.message}` ); // eslint-disable-line no-console
		throw error;
	} );


/**
 * Renders JSON describing essential parts of provided error.
 *
 * @param {Error} error error instance to be described
 * @returns {string} JSON-formatted description of error instance
 */
function encodeError( error ) {
	return JSON.stringify( {
		error: {
			message: error.stack,
			code: error.code,
			leader: error.leader
		}
	} );
}

/**
 * Generates callback for handling result of database actions.
 *
 * @param {string} key key of record processed in database
 * @param {ServerResponse} res refers to API for rendering server response
 * @param {int} code HTTP status code to return in case of success
 * @returns {Function} callback handling result of any database action
 */
function generateDbResultHandler( key, res, code = 200 ) {
	return function( err, value ) {
		if ( err ) {
			if ( err.message.match( /not found/ ) ) {
				res.statusCode = code || 200;
				res.end( JSON.stringify( { ok: true } ) );
			} else {
				res.statusCode = 500;
				res.end( encodeError( err ) );
			}
		} else {
			res.statusCode = code || 200;
			if ( value ) {
				res.end( value.toString() );
			} else {
				res.end( JSON.stringify( { ok: true } ) );
			}
		}
	};
}
