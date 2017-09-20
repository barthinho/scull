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


/* global suite,test */
suite( "class Message", () => {

	test( "is exposed", () => {
		Should.exist( Message );
	} );

	test( "requires three valid arguments on constructing", () => {
		( () => new Message() ).should.throw();

		( () => new Message( null ) ).should.throw();
		( () => new Message( undefined ) ).should.throw();
		( () => new Message( false ) ).should.throw();
		( () => new Message( true ) ).should.throw();
		( () => new Message( 0 ) ).should.throw();
		( () => new Message( 1 ) ).should.throw();
		( () => new Message( [] ) ).should.throw();
		( () => new Message( {} ) ).should.throw();
		( () => new Message( () => {} ) ).should.throw();
		( () => new Message( function() {} ) ).should.throw();
		( () => new Message( ["foo"] ) ).should.throw();
		( () => new Message( { foo: "bar" } ) ).should.throw();

		return Uuid.generate()
			.then( uuid => {
				( () => new Message( uuid, null ) ).should.throw();
				( () => new Message( uuid, undefined ) ).should.throw();
				( () => new Message( uuid, false ) ).should.throw();
				( () => new Message( uuid, true ) ).should.throw();
				( () => new Message( uuid, 0 ) ).should.throw();
				( () => new Message( uuid, 1 ) ).should.throw();
				( () => new Message( uuid, [] ) ).should.throw();
				( () => new Message( uuid, {} ) ).should.throw();
				( () => new Message( uuid, () => {} ) ).should.throw();
				( () => new Message( uuid, function() {} ) ).should.throw();
				( () => new Message( uuid, ["foo"] ) ).should.throw();
				( () => new Message( uuid, { foo: "bar" } ) ).should.throw();
				( () => new Message( uuid, "/ip4/tcp/0.0.0.0/54321" ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/tcp/0.0.0.0/54321" ) ) ).should.throw();

				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", null ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", undefined ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", false ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", true ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", 0 ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", 1 ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", [] ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", {} ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", () => {} ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", function() {} ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", ["foo"] ) ).should.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ) ).should.throw();

				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), null ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), false ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), true ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), [] ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), {} ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ) ).should.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ) ).should.throw();

				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" ) ).should.not.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321" ) ).should.not.throw();
				( () => new Message( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ) ) ).should.not.throw();
				( () => new Message( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ) ) ).should.not.throw();
			} );
	} );

	test( "exposes static method for creating message", () => {
		Message.should.have.property( "createMessage" ).which.is.a.Function().and.has.length( 2 );

		return Promise.all( [
			Message.createMessage().should.be.Promise().which.is.rejected(),
			Message.createMessage( undefined ).should.be.Promise().which.is.rejected(),
			Message.createMessage( null ).should.be.Promise().which.is.rejected(),
			Message.createMessage( false ).should.be.Promise().which.is.rejected(),
			Message.createMessage( true ).should.be.Promise().which.is.rejected(),
			Message.createMessage( 0 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( 1 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( [] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( () => {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( function() {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( ["foo"] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),

			Message.createMessage( "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", undefined ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", null ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", false ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", true ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", 0 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", 1 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", [] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", () => {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", function() {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", ["foo"] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ).should.be.Promise().which.is.rejected(),

			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.fulfilled(),
			Message.createMessage( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.fulfilled(),

			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), null ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), false ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), true ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), [] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ).should.be.Promise().which.is.rejected(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ).should.be.Promise().which.is.rejected(),

			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.fulfilled(),
			Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.fulfilled(),
		] )
			.then( () => Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" ) )
			.then( message => {
				Should.exist( message );
				message.should.be.instanceOf( Message );
			} )
			.then( () => Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321" ) )
			.then( message => {
				Should.exist( message );
				message.should.be.instanceOf( Message );
			} )
			.then( () => Message.createMessage( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ) ) )
			.then( message => {
				Should.exist( message );
				message.should.be.instanceOf( Message );
			} )
			.then( () => Message.createMessage( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ) ) )
			.then( message => {
				Should.exist( message );
				message.should.be.instanceOf( Message );
			} );
	} );

	test( "exposes uuid as property", () => {
		return Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" )
			.then( message => {
				message.should.have.property( "uuid" ).which.is.an.instanceof( Uuid );
			} );
	} );

	test( "exposes sender's address as property", () => {
		return Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345" )
			.then( message => {
				message.should.have.property( "sender" ).which.is.an.instanceof( Address.Address );
				message.sender.toString().should.equal( "/ip4/0.0.0.0/tcp/54321" );
			} );
	} );

	test( "exposes receiver's address as property", () => {
		return Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345" )
			.then( message => {
				message.should.have.property( "receiver" ).which.is.an.instanceof( Address.Address );
				message.receiver.toString().should.equal( "/ip4/0.0.0.0/tcp/12345" );
			} );
	} );

	test( "exposes method for compiling message to serializable object", () => {
		return Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345" )
			.then( message => {
				message.should.have.property( "compile" ).which.is.a.Function().and.has.length( 0 );
				message.compile.bind( message ).should.not.throw();

				const compiled = message.compile();
				compiled.should.be.Object().and.have.properties( "i", "f", "t" ).and.have.size( 3 );

				( () => JSON.parse( JSON.stringify( compiled ) ) ).should.not.throw();
				const serialized = JSON.parse( JSON.stringify( compiled ) );
				serialized.should.be.Object().and.have.properties( "i", "f", "t" ).and.have.size( 3 );
				serialized.i.should.equal( compiled.i );
				serialized.f.should.equal( compiled.f );
				serialized.t.should.equal( compiled.t );
			} );
	} );

	test( "exposes static method for parsing compiled message", () => {
		return Message.createMessage( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345" )
			.then( message => {
				const compiled = JSON.parse( JSON.stringify( message.compile() ) );

				Message.should.have.property( "parse" ).which.is.a.Function().and.has.length( 1 );

				( () => Message.parse( compiled ) ).should.not.throw();
				const parsed = Message.parse( compiled );
				Should.exist( parsed );

				return parsed.should.be.Promise().which.is.fulfilled()
					.then( () => parsed )
					.then( parsed => {
						parsed.uuid.should.not.equal( message.uuid );
						parsed.uuid.toString().should.equal( message.uuid.toString() );
						parsed.sender.should.not.equal( message.sender );
						parsed.sender.toString().should.equal( message.sender.toString() );
						parsed.receiver.should.not.equal( message.receiver );
						parsed.receiver.toString().should.equal( message.receiver.toString() );
					} );
			} );
	} );

} );
