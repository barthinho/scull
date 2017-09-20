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


/* global suite,test */
suite( "class Uuid", () => {

	test( "is exposed", () => {
		Should.exist( Uuid );
	} );

	test( "provides static method for generating random UUID", () => {
		Uuid.generate.should.be.Function().which.has.a.length( 0 );

		Uuid.generate.bind( Uuid ).should.not.throw();
		Uuid.generate().should.be.Promise();
	} );

	test( "provides static method for generating random UUID", () => {
		Uuid.generate.should.be.Function().which.has.a.length( 0 );

		Uuid.generate.bind( Uuid ).should.not.throw();
		Uuid.generate().should.be.Promise();

		return Uuid.generate()
			.then( uuid => {
				Should.exist( uuid );

				uuid.should.be.instanceof( Uuid );
			} );
	} );

	test( "provides method for extracting commonly formatted UUID", () => {
		return Uuid.generate()
			.then( uuid => {
				uuid.should.have.property( "toString" ).which.is.a.Function().and.has.length( 0 );
				uuid.toString().should.match( /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i );
				String( uuid ).should.match( /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i );
			} );
	} );

	test( "provides method for extracting UUID value Base64-encoded", () => {
		return Uuid.generate()
			.then( uuid => {
				uuid.should.have.property( "toBase64" ).which.is.a.Function().and.has.length( 0 );
				uuid.toBase64().should.match( /^[0-9a-z/+]+=*$/i );
			} );
	} );

	test( "provides binary buffer as property", () => {
		return Uuid.generate()
			.then( uuid => {
				uuid.should.have.property( "binary" ).which.is.an.instanceof( Buffer ).and.has.length( 16 );
			} );
	} );

	test( "provides method for comparing current UUID with a given one", () => {
		return Uuid.generate()
			.then( uuid => {
				const remote = new Uuid( uuid.binary );

				uuid.should.have.property( "equals" ).which.is.a.Function().and.has.length( 1 );

				uuid.equals.bind( uuid ).should.not.throw();
				uuid.equals.bind( uuid, null ).should.not.throw();
				uuid.equals.bind( uuid, false ).should.not.throw();
				uuid.equals.bind( uuid, true ).should.not.throw();
				uuid.equals.bind( uuid, "" ).should.not.throw();
				uuid.equals.bind( uuid, Buffer.alloc( 15 ) ).should.not.throw();
				uuid.equals.bind( uuid, Buffer.alloc( 17 ) ).should.not.throw();
				uuid.equals.bind( uuid, 1 ).should.not.throw();
				uuid.equals.bind( uuid, [] ).should.not.throw();
				uuid.equals.bind( uuid, {} ).should.not.throw();

				uuid.equals.bind( uuid, remote ).should.not.throw();
				uuid.equals.bind( uuid, remote.toString() ).should.not.throw();
				uuid.equals.bind( uuid, String( remote ) ).should.not.throw();
				uuid.equals.bind( uuid, remote.toBase64() ).should.not.throw();
				uuid.equals.bind( uuid, remote.binary ).should.not.throw();

				uuid.equals().should.be.false();
				uuid.equals( null ).should.be.false();
				uuid.equals( false ).should.be.false();
				uuid.equals( true ).should.be.false();
				uuid.equals( "" ).should.be.false();
				uuid.equals( Buffer.alloc( 15 ) ).should.be.false();
				uuid.equals( Buffer.alloc( 17 ) ).should.be.false();
				uuid.equals( 1 ).should.be.false();
				uuid.equals( [] ).should.be.false();
				uuid.equals( {} ).should.be.false();

				uuid.equals( remote ).should.be.true();
				uuid.equals( remote.toString() ).should.be.true();
				uuid.equals( String( remote ) ).should.be.true();
				uuid.equals( remote.toBase64() ).should.be.true();
				uuid.equals( remote.binary ).should.be.true();
			} );
	} );

	test( "provides method for wrapping Base64-encoded UUID value in a new instance", () => {
		return Uuid.generate()
			.then( uuid => {
				const base64 = uuid.toBase64();

				Uuid.should.have.property( "loadFromBase64" ).which.is.a.Function().and.has.length( 1 );

				Uuid.loadFromBase64.bind( Uuid ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, null ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, false ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, true ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, "" ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, "something not base64" ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, "somethingNot16BytesLong" ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, Buffer.alloc( 15 ) ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, Buffer.alloc( 17 ) ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, 1 ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, [] ).should.throw();
				Uuid.loadFromBase64.bind( Uuid, {} ).should.throw();

				Uuid.loadFromBase64.bind( Uuid, base64 ).should.not.throw();

				const remote = Uuid.loadFromBase64( base64 );

				Should.exist( remote );
				remote.should.be.instanceof( Uuid ).and.not.equal( uuid );
				remote.equals( uuid ).should.be.true();
				uuid.equals( remote ).should.be.true();
			} );
	} );

} );
