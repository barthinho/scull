/**
 * (c) 2018 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

"use strict";

const Crypto = require( "crypto" );

const { suite, test, setup, suiteSetup } = require( "mocha" );
const Should = require( "should" );

const Stream = require( "../../../lib/network/common/stream" );


const SERVER_ADDRESS = { address: "127.0.0.1", port: 54321 };

suite( "Network stream", function() {
	test( "is available", () => {
		Should( Stream ).be.ok();
	} );

	suite( "supports communicating with listening server", function() {
		let server;
		let received = [];

		const createServer = options => {
			return new Promise( ( resolve, reject ) => {
				const newServer = require( "net" ).createServer();

				newServer.on( "data", chunk => {
					received.push( chunk );
				} );

				const links = [];
				newServer.on( "connection", socket => {
					links.push( socket );
				} );

				newServer.listen( options, () => resolve( newServer ) );
				newServer.on( "error", reject );
				newServer.on( "connection", socket => {
					socket.on( "data", ( ...args ) => newServer.emit( "data", ...args ) );
					socket.on( "error", ( ...args ) => newServer.emit( "error", ...args ) );
					socket.on( "close", () => socket.removeAllListeners() );
				} );

				newServer._close = () => {
					return new Promise( onClosed => {
						newServer.once( "close", onClosed );
						newServer.close();

						links.forEach( socket => {
							socket.setTimeout( 1 );
							socket.end();
						} );
					} );
				};
			} )
				.then( createdServer => {
					server = createdServer;
				} );
		};

		suiteSetup( () => createServer( SERVER_ADDRESS ) );

		setup( () => {
			received = [];
		} );

		test( "properly sending chunks to server", () => {
			const socket = new Stream( SERVER_ADDRESS );

			return new Promise( ( resolve, reject ) => {
				server.once( "data", () => {
					Buffer.concat( received ).toString( "utf8" ).should.equal( "H" );
					resolve();
				} );

				socket.send( Buffer.from( "H", "utf8" ) )
					.catch( reject );
			} );
		} );

		test( "implicitly reconnects after loosing connection while sending data w/o loosing any data or emitting any error", function( done ) {
			this.timeout( 20000 );

			const size = 4096;
			const chunkSize = Math.floor( size / 100 );

			Crypto.randomBytes( size, ( error, message ) => {
				const socket = new Stream( SERVER_ADDRESS );

				let cursor = 0;
				let disconnected = 0;
				let errors = 0;

				socket.on( "disconnect", () => disconnected++ );
				socket.on( "error", () => errors++ );

				setTimeout( writer, 100 );
				setTimeout( () => server._close(), 1500 );
				setTimeout( () => createServer( SERVER_ADDRESS ), 4000 );
				setTimeout( () => server._close(), 7000 );
				setTimeout( () => createServer( SERVER_ADDRESS ), 14000 );

				function writer() { // eslint-disable-line require-jsdoc
					if ( cursor < message.length ) {
						socket.write( message.slice( cursor, cursor + chunkSize ) );
						cursor += chunkSize;

						setTimeout( writer, 100 );
					} else {
						check();
					}
				}

				function check() { // eslint-disable-line require-jsdoc
					const result = Buffer.concat( received );
					if ( result.length >= size ) {
						if ( !result.equals( message ) ) {
							done( new Error( "invalid data received" ) );
						} else if ( disconnected < 2 ) {
							done( new Error( "haven't disconnected" ) );
						} else if ( errors > 0 ) {
							done( new Error( "unexpectedly emitted errors" ) );
						} else {
							done();
						}
					} else {
						setTimeout( check, 50 );
					}
				}
			} );
		} );
	} );
} );
