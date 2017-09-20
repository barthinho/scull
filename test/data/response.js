/**
 * (c) 2017 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 cepharum GmbH
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


const Should = require( "should" );

const Uuid = require( "../../lib/data/uuid" );
const Address = require( "../../lib/data/address" );
const Message = require( "../../lib/data/message" );
const Request = require( "../../lib/data/request" );
const Response = require( "../../lib/data/response" );


/* global suite,test */
suite( "class Request", () => {

	test( "is exposed", () => {
		Should.exist( Response );
	} );

	test( "requires valid request and optional data on constructing", () => {
		( () => new Response() ).should.throw();

		( () => new Response( null ) ).should.throw();
		( () => new Response( undefined ) ).should.throw();
		( () => new Response( false ) ).should.throw();
		( () => new Response( true ) ).should.throw();
		( () => new Response( 0 ) ).should.throw();
		( () => new Response( 1 ) ).should.throw();
		( () => new Response( [] ) ).should.throw();
		( () => new Response( {} ) ).should.throw();
		( () => new Response( () => {} ) ).should.throw();
		( () => new Response( function() {} ) ).should.throw();
		( () => new Response( ["foo"] ) ).should.throw();
		( () => new Response( { foo: "bar" } ) ).should.throw();

		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				( () => new Response( request, null ) ).should.throw();
				( () => new Response( request, false ) ).should.throw();
				( () => new Response( request, true ) ).should.throw();
				( () => new Response( request, 0 ) ).should.throw();
				( () => new Response( request, 1 ) ).should.throw();
				( () => new Response( request, [] ) ).should.throw();
				( () => new Response( request, () => {} ) ).should.throw();
				( () => new Response( request, function() {} ) ).should.throw();
				( () => new Response( request, ["foo"] ) ).should.throw();
				( () => new Response( request, "/ip4/0.0.0.0/tcp/54321" ) ).should.throw();

				( () => new Response( request ) ).should.not.throw();
				( () => new Response( request, undefined ) ).should.not.throw();
				( () => new Response( request, {} ) ).should.not.throw();
				( () => new Response( request, { foo: "bar" } ) ).should.not.throw();
				( () => new Response( request, Address( "/ip4/0.0.0.0/tcp/54321" ) ) ).should.not.throw();
			} );
	} );

	test( "is inheriting from Message", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				new Response( request ).should.be.instanceOf( Message );
			} );
	} );

	test( "is not inheriting from Request", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				new Response( request ).should.not.be.instanceOf( Request );
			} );
	} );

	test( "exposes static method for creating response", () => {
		Response.should.have.property( "createResponse" ).which.is.a.Function().and.has.length( 1 );

		return Promise.all( [
			Response.createResponse().should.be.Promise().which.is.rejected(),
			Response.createResponse( undefined ).should.be.Promise().which.is.rejected(),
			Response.createResponse( null ).should.be.Promise().which.is.rejected(),
			Response.createResponse( false ).should.be.Promise().which.is.rejected(),
			Response.createResponse( true ).should.be.Promise().which.is.rejected(),
			Response.createResponse( 0 ).should.be.Promise().which.is.rejected(),
			Response.createResponse( 1 ).should.be.Promise().which.is.rejected(),
			Response.createResponse( [] ).should.be.Promise().which.is.rejected(),
			Response.createResponse( {} ).should.be.Promise().which.is.rejected(),
			Response.createResponse( () => {} ).should.be.Promise().which.is.rejected(),
			Response.createResponse( function() {} ).should.be.Promise().which.is.rejected(),
			Response.createResponse( ["foo"] ).should.be.Promise().which.is.rejected(),
			Response.createResponse( { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Response.createResponse( "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Response.createResponse( Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),
		] )
			.then( () => Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
				foo: "bar",
				baz: 3
			} ) )
			.then( request => {
				return Promise.all( [
					Response.createResponse( request, null ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, false ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, true ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, 0 ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, 1 ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, [] ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, () => {} ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, function() {} ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, ["foo"] ).should.be.Promise().which.is.rejected(),
					Response.createResponse( request, "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),

					Response.createResponse( request ).should.be.Promise().which.is.fulfilled(),
					Response.createResponse( request, undefined ).should.be.Promise().which.is.fulfilled(),
					Response.createResponse( request, {} ).should.be.Promise().which.is.fulfilled(),
					Response.createResponse( request, { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),
					Response.createResponse( request, Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.fulfilled(),
				] );
			} );
	} );

	test( "takes optional data object on creating request", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => Promise.all( [
				Response.createResponse( request ).should.be.Promise().which.is.fulfilled(),
				Response.createResponse( request, undefined ).should.be.Promise().which.is.fulfilled(),
				Response.createResponse( request, null ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, false ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, true ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, 0 ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, 1 ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, [] ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, "" ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, "foo" ).should.be.Promise().which.is.rejected(),
				Response.createResponse( request, {} ).should.be.Promise().which.is.fulfilled(),
				Response.createResponse( request, { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),
			] ) );
	} );

	test( "can be derived from request instance taking optional response data as well", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				request.deriveResponse.bind( request ).should.not.throw();
				request.deriveResponse.bind( request, undefined ).should.not.throw();
				request.deriveResponse.bind( request, null ).should.throw();
				request.deriveResponse.bind( request, false ).should.throw();
				request.deriveResponse.bind( request, true ).should.throw();
				request.deriveResponse.bind( request, 0 ).should.throw();
				request.deriveResponse.bind( request, 1 ).should.throw();
				request.deriveResponse.bind( request, [] ).should.throw();
				request.deriveResponse.bind( request, "" ).should.throw();
				request.deriveResponse.bind( request, "foo" ).should.throw();
				request.deriveResponse.bind( request, {} ).should.not.throw();
				request.deriveResponse.bind( request, { foo: "bar" } ).should.not.throw();
			} );
	} );

	test( "exposes uuid as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "uuid" ).which.is.an.instanceof( Uuid );

				response.uuid.toString().should.be.equal( request.uuid.toString() );
			} );
	} );

	test( "exposes sender's address as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "sender" ).which.is.an.instanceof( Address.Address );

				response.sender.toString().should.be.equal( request.receiver.toString() );
			} );
	} );

	test( "exposes receiver's address as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "receiver" ).which.is.an.instanceof( Address.Address );

				response.receiver.toString().should.be.equal( request.sender.toString() );
			} );
	} );

	test( "exposes action name as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "action" ).which.is.a.String();

				response.action.toString().should.be.equal( request.action.toString() );
			} );
	} );

	test( "exposes empty data object as property by default", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "data" ).which.is.an.Object().and.is.empty();
			} );
	} );

	test( "exposes data object optionally given on creating request as property", () => {
		const data = {};

		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse( data );

				response.should.have.property( "data" ).which.is.an.Object().and.equal( data );
			} );
	} );

	test( "exposes related request as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "relatedRequest" ).which.is.an.instanceOf( Request );

				response.relatedRequest.should.be.equal( request );
			} );
	} );

	test( "exposes method for compiling message to serializable object", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse();

				response.should.have.property( "compile" ).which.is.a.Function().and.has.length( 0 );
				response.compile.bind( response ).should.not.throw();

				const compiled = response.compile();
				compiled.should.be.Object().and.have.properties( "i", "f", "t", "r", "d" ).and.have.size( 5 );

				( () => JSON.parse( JSON.stringify( compiled ) ) ).should.not.throw();
				const serialized = JSON.parse( JSON.stringify( compiled ) );
				serialized.should.be.Object().and.have.properties( "i", "f", "t", "r", "d" ).and.have.size( 5 );
				serialized.i.should.equal( compiled.i );
				serialized.f.should.equal( compiled.f );
				serialized.t.should.equal( compiled.t );
				serialized.r.should.equal( compiled.r );
				Should.deepEqual( serialized.d, compiled.d );

				return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
					foo: "bar",
					baz: 3
				} )
					.then( request => {
						const response = request.deriveResponse( { bar: "baz" } );

						response.compile.bind( response ).should.not.throw();

						const compiled = response.compile();
						compiled.should.be.Object().and.have.properties( "i", "f", "t", "r", "d" ).and.have.size( 5 );

						( () => JSON.parse( JSON.stringify( compiled ) ) ).should.not.throw();
						const serialized = JSON.parse( JSON.stringify( compiled ) );
						serialized.should.be.Object().and.have.properties( "i", "f", "t", "r", "d" ).and.have.size( 5 );
						Should.deepEqual( serialized.d, compiled.d );
					} );
			} );
	} );

	test( "exposes static method for parsing compiled message", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "fooAction", {
			foo: "bar",
			baz: 3
		} )
			.then( request => {
				const response = request.deriveResponse( { bar: "baz" } );

				const compiled = JSON.parse( JSON.stringify( response.compile() ) );

				Response.should.have.property( "parse" ).which.is.a.Function().and.has.length( 1 );

				( () => Response.parse( compiled ) ).should.not.throw();
				const parsed = Response.parse( compiled );
				Should.exist( parsed );

				return parsed.should.be.Promise().which.is.fulfilled()
					.then( () => parsed )
					.then( parsed => {
						parsed.uuid.should.not.equal( response.uuid );
						parsed.uuid.toString().should.equal( response.uuid.toString() );
						parsed.sender.should.not.equal( response.sender );
						parsed.sender.toString().should.equal( response.sender.toString() );
						parsed.receiver.should.not.equal( response.receiver );
						parsed.receiver.toString().should.equal( response.receiver.toString() );
						parsed.action.should.equal( response.action );
						parsed.data.should.not.equal( response.data );
						Should.deepEqual( parsed.data, response.data );

						parsed.relatedRequest.should.not.equal( request ).and.not.equal( response.relatedRequest );

						const reparsed = Response.parse( compiled, request );
						Should.exist( reparsed );

						return reparsed.should.be.Promise().which.is.fulfilled()
							.then( () => reparsed )
							.then( parsed => {
								parsed.uuid.should.equal( response.uuid );
								parsed.uuid.toString().should.equal( response.uuid.toString() );
								parsed.sender.should.equal( response.sender );
								parsed.sender.toString().should.equal( response.sender.toString() );
								parsed.receiver.should.equal( response.receiver );
								parsed.receiver.toString().should.equal( response.receiver.toString() );
								parsed.action.should.equal( response.action );
								parsed.data.should.not.equal( response.data );
								Should.deepEqual( parsed.data, response.data );

								parsed.relatedRequest.should.equal( request ).and.equal( response.relatedRequest );
							} );
					} );
			} );
	} );

} );
