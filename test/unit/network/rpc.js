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

const { describe, it, beforeEach, afterEach } = require( "mocha" );
require( "should" );

const { Address } = require( "../../../lib/data/address" );
const { RPCNetwork } = require( "../../../lib/rpc/network" );
const { RPCServer } = require( "../../../lib/rpc/server" );
const { RPCClient } = require( "../../../lib/rpc/client" );

// require( "debug" ).enable( "scull:rpc:*" );

const NODES = [
	"/ip4/127.0.0.1/tcp/5000",
	"/ip4/127.0.0.1/tcp/5001",
	"/ip4/127.0.0.1/tcp/5002",
	"/ip4/127.0.0.1/tcp/5003",
	"/ip4/127.0.0.1/tcp/5004",
	"/ip4/127.0.0.1/tcp/5005",
	"/ip4/127.0.0.1/tcp/5006",
	"/ip4/127.0.0.1/tcp/5007",
	"/ip4/127.0.0.1/tcp/5008",
	"/ip4/127.0.0.1/tcp/5009",
];


describe( "Revised RPC network", () => {
	it( "is available", () => {
		( RPCNetwork != null ).should.be.true();
	} );

	it( "supports a client", () => {
		( RPCClient != null ).should.be.true();
	} );

	it( "supports a server", () => {
		( RPCServer != null ).should.be.true();
	} );

	it( "requires local node's ID on creation", () => {
		// noinspection JSCheckFunctionSignatures
		( () => new RPCNetwork() ).should.throw();

		for ( const node of NODES ) {
			( () => new RPCNetwork( node ) ).should.not.throw();
		}
	} );

	it( "fails to provide client unless having started", () => {
		const network = new RPCNetwork( NODES[0] );

		( () => network.getPeer( NODES[1] ) ).should.throw();

		return network.start()
			.then( () => {
				( () => network.getPeer( NODES[1] ) ).should.not.throw();

				return network.stop();
			} );
	} );

	it( "provides same client instance on succeeding requests for same peer", () => {
		return new RPCNetwork( NODES[0] ).start()
			.then( network => {
				const a = network.getPeer( NODES[1] );
				const b = network.getPeer( NODES[1] );

				( a === b ).should.be.true();

				return network.stop();
			} );
	} );

	it( "provides receiver for emitting events when started", () => {
		const network = new RPCNetwork( NODES[0] );

		( () => network.getPeer( NODES[1] ) ).should.throw();

		return network.start()
			.then( () => {
				network.receiver.should.be.instanceOf( require( "events" ) );

				return network.stop();
			} );
	} );

	it( "does not provide receiver before start", () => {
		const network = new RPCNetwork( NODES[0] );

		( () => network.getPeer( NODES[1] ) ).should.throw();

		( network.receiver == null ).should.be.true();
	} );

	describe( "multiply started w/o session key on behalf of multiple nodes", () => {
		let networks;

		beforeEach( "starting all nodes' network", () => {
			return Promise.all( NODES.map( id => new RPCNetwork( id ).start() ) )
				.then( startedNetworks => { networks = startedNetworks; } );
		} );

		afterEach( "stopping all nodes' network", () => {
			return Promise.all( networks.map( network => network.stop() ) );
		} );

		it( "can connect one node with another one", () => {
			return networks[0].getPeer( networks[1].me ).connect();
		} );

		it( "emits event on incoming RPC request", () => {
			const [ tx, rx ] = networks;

			const client = tx.getPeer( rx.me );

			rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
				// any exception thrown here will be returned via RPC, thus
				// failing call() returned below
				peer.should.be.instanceOf( Address );
				peer.id.should.be.String().which.is.equal( client.me.id );

				name.should.be.String().which.is.equal( "name-of-action" );

				params.should.be.Object().which.is.empty();

				cb.should.be.Function().which.has.length( 0 );

				cb();
			} );

			return client.call( "name-of-action" );
		} );

		it( "supports set of named parameters passed to called remote procedure", () => {
			const [ tx, rx ] = networks;
			const client = tx.getPeer( rx.me );

			const args = {
				numeric: -432.567,
				boolean: false,
				missing: null,
				string: "foo",
				object: { name: "bar" },
				array: [ null, false, -654.786, "baz", { value: 23 }, [123456] ],
			};

			rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
				params.should.be.Object().which.containDeep( args );

				cb();
			} );

			return client.call( "name-of-action", args );
		} );

		it( "handles very high number of multiple calls in parallel", function() {
			this.timeout( 10000 );

			networks.map( ( network, index ) => {
				network.receiver.on( "rpc", ( peer, name, params, cb ) => {
					switch ( name ) {
						case "double" :
							cb( null, `${index}: ${params.value * 2}` );
							break;

						case "increase" :
							process.nextTick( cb, null, params.value + index + 1 );
							break;

						default :
							setTimeout( cb, Math.floor( Math.random() * 100 ) + 10, new Error( `${index}: invalid action ${name}` ) );
					}
				} );
			} );

			const tests = {
				double( index, input, result ) {
					result.should.be.String().which.is.equal( `${index}: ${input * 2}` );
				},
				increase( index, input, result ) {
					result.should.be.Number().which.is.equal( input + index + 1 );
				},
				fail( index, input, result ) {
					result.should.be.Error();
					result.message.should.be.String().which.is.equal( `${index}: invalid action fail` );
				},
			};

			const testNames = Object.keys( tests );

			// noinspection JSUnusedLocalSymbols
			return Promise.all( new Array( 10000 ).fill( 0 ).map( ( _, index ) => { // eslint-disable-line no-unused-vars
				const client = Math.floor( Math.random() * networks.length );
				let server;

				do {
					server = Math.floor( Math.random() * networks.length );
				} while ( client === server );

				const tx = networks[client];
				const rx = networks[server];

				const action = testNames[Math.floor( Math.random() * testNames.length )];
				const value = Math.floor( Math.random() * 10000 ) - 5000;

				// console.log( String( index ).padStart( 5 ), client, server, action, value );

				return new Promise( resolve => setTimeout( resolve, Math.floor( Math.random() * 300 ) + 10 ) )
					.then( () => tx.getPeer( rx.me ).call( action, { value }, { resolveWithError: true } ) )
					.then( result => {
						// eslint-disable-next-line max-len
						// console.log( String( index ).padStart( 5 ), client, server, action, value, "-->", result instanceof Error ? `ERROR: ${result.message}` : result );

						tests[action]( server, value, result );
					} );
			} ) )
				.then( () => {
					// check if either server and client has cleared internal caches
					networks.forEach( network => {
						for ( const client of network.receiver._clients.values() ) {
							client.pending.should.be.equal( 0 );
						}

						for ( const peer of network._peers.values() ) {
							peer._pending.size.should.be.equal( 0 );
						}
					} );
				} );
		} );

		it( "fails if client is using session key", () => {
			const [ tx, rx ] = networks;
			const client = tx.getPeer( rx.me, { sessionKey: " " } );

			rx.receiver.once( "rpc", ( a, b, c, cb ) => cb() );

			return client.call( "action" )
				.then( () => {
					throw new Error( "call succeeded unexpectedly" );
				}, error => {
					error.should.have.property( "code" ).which.is.equal( "EACCES" );
				} );
		} );

		describe( "supports passing back", () => {
			it( "string results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( null, "bar" );
				} );

				return client.call( "foo" ).then( result => {
					result.should.be.String().which.equals( "bar" );
				} );
			} );

			it( "numeric results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( null, -123.456 );
				} );

				return client.call( "foo" ).then( result => {
					result.should.be.Number().which.equals( -123.456 );
				} );
			} );

			it( "boolean results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( null, false );
				} );

				return client.call( "foo" ).then( result => {
					result.should.be.false();
				} );
			} );

			it( "`null` results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb();
				} );

				return client.call( "foo" ).then( result => {
					( result === null ).should.be.true();
				} );
			} );

			it( "array results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				const array = [ null, false, true, "foo", ["bar"], { response: "baz" } ];

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( null, array );
				} );

				return client.call( "foo" ).then( result => {
					result.should.be.Array().which.containDeepOrdered( array );
				} );
			} );

			it( "object results from called remote procedure in case of success", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( null, { response: "bar" } );
				} );

				return client.call( "foo" ).then( result => {
					result.should.be.Object().which.has.size( 1 ).and.has.property( "response" ).which.is.String().and.equals( "bar" );
				} );
			} );

			it( "Error instance from called remote procedure in case of failure", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				const error = new Error( "error message" );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( error );
				} );

				return client.call( "foo" )
					.then( () => {
						throw new Error( "call succeeded unexpectedly" );
					}, returnedError => {
						returnedError.should.be.instanceOf( Error );
						returnedError.should.not.equal( error );
						returnedError.message.should.equal( error.message );
					} );
			} );

			it( "error message from called remote procedure in case of failure", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					cb( "error message" );
				} );

				return client.call( "foo" )
					.then( () => {
						throw new Error( "call succeeded unexpectedly" );
					}, returnedError => {
						returnedError.should.be.instanceOf( Error );
						returnedError.message.should.equal( "error message" );
					} );
			} );
		} );

		describe( "with volatile connections", () => {
			it( "fails on client disconnecting during remote procedure call", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					setTimeout( cb, 1000, null, "bar" );
				} );

				setTimeout( () => client.connect().then( s => s.destroy() ), 500 );

				return client.call( "foo" )
					.then( () => {
						throw new Error( "call succeeded unexpectedly" );
					}, error => {
						error.should.have.property( "code" ).which.is.equal( "ECONNABORTED" );
					} );
			} );

			it( "fails on server disconnecting during remote procedure call", () => {
				const [ tx, rx ] = networks;
				const client = tx.getPeer( rx.me );
				let socket;

				// noinspection JSAccessibilityCheck
				rx.receiver._socket.once( "connection", s => { socket = s; } );

				rx.receiver.once( "rpc", ( peer, name, params, cb ) => {
					setTimeout( cb, 1000, null, "bar" );
				} );

				setTimeout( () => socket.destroy(), 500 );

				return client.call( "foo" )
					.then( () => {
						throw new Error( "call succeeded unexpectedly" );
					}, error => {
						error.should.have.property( "code" ).which.is.equal( "ECONNRESET" );
					} );
			} );
		} );
	} );

	describe( "multiply started w/ session key on behalf of multiple nodes", () => {
		const sessionKey = "secretSessionKey";
		let networks;

		beforeEach( "starting all nodes' network", () => {
			return Promise.all( NODES.map( id => new RPCNetwork( id, { sessionKey } ).start() ) )
				.then( startedNetworks => { networks = startedNetworks; } );
		} );

		afterEach( "stopping all nodes' network", () => {
			return Promise.all( networks.map( network => network.stop() ) );
		} );

		it( "can connect one node with another one", () => {
			return networks[0].getPeer( networks[1].me ).connect();
		} );

		it( "emits event on incoming RPC request", () => {
			const [ tx, rx ] = networks;
			const client = tx.getPeer( rx.me );

			rx.receiver.once( "rpc", ( a, b, c, cb ) => cb() );

			return client.call( "action" ).should.be.resolvedWith( null );
		} );

		it( "fails if client is missing session key", () => {
			const [ tx, rx ] = networks;
			const client = tx.getPeer( rx.me, { sessionKey: null } );

			rx.receiver.once( "rpc", ( a, b, c, cb ) => cb() );

			return client.call( "action" )
				.then( () => {
					throw new Error( "call succeeded unexpectedly" );
				}, error => {
					error.should.have.property( "code" ).which.is.equal( "EACCES" );
				} );
		} );

		it( "fails if client is using different session key", () => {
			const [ tx, rx ] = networks;
			const client = tx.getPeer( rx.me, { sessionKey: sessionKey + " " } );

			rx.receiver.once( "rpc", ( a, b, c, cb ) => cb() );

			return client.call( "action" )
				.then( () => {
					throw new Error( "call succeeded unexpectedly" );
				}, error => {
					error.should.have.property( "code" ).which.is.equal( "EACCES" );
				} );
		} );
	} );
} );
