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


/* global suite,test */
suite( "class Request", () => {

	test( "is exposed", () => {
		Should.exist( Request );
	} );

	test( "requires four valid arguments on constructing", () => {
		( () => new Request() ).should.throw();

		( () => new Request( null ) ).should.throw();
		( () => new Request( undefined ) ).should.throw();
		( () => new Request( false ) ).should.throw();
		( () => new Request( true ) ).should.throw();
		( () => new Request( 0 ) ).should.throw();
		( () => new Request( 1 ) ).should.throw();
		( () => new Request( [] ) ).should.throw();
		( () => new Request( {} ) ).should.throw();
		( () => new Request( () => {} ) ).should.throw();
		( () => new Request( function() {} ) ).should.throw();
		( () => new Request( ["foo"] ) ).should.throw();
		( () => new Request( { foo: "bar" } ) ).should.throw();

		return Uuid.generate()
			.then( uuid => {
				( () => new Request( uuid, null ) ).should.throw();
				( () => new Request( uuid, undefined ) ).should.throw();
				( () => new Request( uuid, false ) ).should.throw();
				( () => new Request( uuid, true ) ).should.throw();
				( () => new Request( uuid, 0 ) ).should.throw();
				( () => new Request( uuid, 1 ) ).should.throw();
				( () => new Request( uuid, [] ) ).should.throw();
				( () => new Request( uuid, {} ) ).should.throw();
				( () => new Request( uuid, () => {} ) ).should.throw();
				( () => new Request( uuid, function() {} ) ).should.throw();
				( () => new Request( uuid, ["foo"] ) ).should.throw();
				( () => new Request( uuid, { foo: "bar" } ) ).should.throw();
				( () => new Request( uuid, "/ip4/tcp/0.0.0.0/54321" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/tcp/0.0.0.0/54321" ) ) ).should.throw();

				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", null ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", undefined ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", false ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", true ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", 0 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", 1 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", [] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", () => {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", function() {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", ["foo"] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ) ).should.throw();

				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), null ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), false ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), true ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), [] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ) ).should.throw();

				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", undefined ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", null ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", false ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", true ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", 0 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", 1 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", [] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", () => {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", function() {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", ["foo"] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "    \r\n\t    " ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "    foo    " ) ).should.throw();

				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", undefined ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", null ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", false ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", true ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", 0 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", 1 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", [] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", () => {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", function() {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", ["foo"] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "    \r\n\t    " ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "    foo    " ) ).should.throw();

				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ) ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), null ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), false ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), true ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), [] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "    \r\n\t    " ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "    foo    " ) ).should.throw();

				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ) ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), null ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), false ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), true ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), [] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "    \r\n\t    " ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "    foo    " ) ).should.throw();

				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", undefined ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", null ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", false ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", true ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", 0 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", 1 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", [] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", "" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", "foo" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", {} ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", { foo: "bar" } ) ).should.not.throw();

				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo" ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", undefined ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", null ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", false ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", true ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", 0 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", 1 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", [] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", "" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", "foo" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", {} ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", { foo: "bar" } ) ).should.not.throw();

				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", undefined ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", null ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", false ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", true ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 0 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 1 ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", [] ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "foo" ) ).should.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", {} ) ).should.not.throw();
				( () => new Request( uuid, "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", { foo: "bar" } ) ).should.not.throw();

				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", undefined ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", null ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", false ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", true ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 0 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 1 ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", [] ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "foo" ) ).should.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", {} ) ).should.not.throw();
				( () => new Request( uuid, Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", { foo: "bar" } ) ).should.not.throw();
			} );
	} );

	test( "is inheriting from Message", () => {
		return Uuid.generate()
			.then( uuid => {
				new Request( uuid, "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" ).should.be.instanceOf( Message );
			} );
	} );

	test( "exposes static method for creating request", () => {
		Request.should.have.property( "createRequest" ).which.is.a.Function().and.has.length( 3 );

		return Promise.all( [
			Request.createRequest().should.be.Promise().which.is.rejected(),
			Request.createRequest( undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),

			Request.createRequest( "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ).should.be.Promise().which.is.rejected(),

			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ).should.be.Promise().which.is.rejected(),

			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "    \r\n\t    " ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "    foo    " ).should.be.Promise().which.is.rejected(),

			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "    \r\n\t    " ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "    foo    " ).should.be.Promise().which.is.rejected(),

			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "    \r\n\t    " ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "    foo    " ).should.be.Promise().which.is.rejected(),

			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ) ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), undefined ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), () => {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), function() {} ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), ["foo"] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), { foo: "bar" } ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "    \r\n\t    " ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "    foo    " ).should.be.Promise().which.is.rejected(),

			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ).should.be.Promise().which.is.fulfilled(),
		] )
			.then( () => Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" ) )
			.then( request => {
				Should.exist( request );
				request.should.be.instanceOf( Request );
			} )
			.then( () => Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo" ) )
			.then( request => {
				Should.exist( request );
				request.should.be.instanceOf( Request );
			} )
			.then( () => Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ) )
			.then( request => {
				Should.exist( request );
				request.should.be.instanceOf( Request );
			} )
			.then( () => Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ) )
			.then( request => {
				Should.exist( request );
				request.should.be.instanceOf( Request );
			} );
	} );

	test( "takes optional data object on creating request", () => {
		return Promise.all( [
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", undefined ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", "" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", "foo" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", {} ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo", { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),

			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", undefined ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "foo" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", {} ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( "/ip4/0.0.0.0/tcp/54321", Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),

			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", undefined ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", "" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", "foo" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", {} ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), "/ip4/0.0.0.0/tcp/54321", "foo", { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),

			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo" ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", undefined ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", null ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", false ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", true ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 0 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", 1 ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", [] ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", "foo" ).should.be.Promise().which.is.rejected(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", {} ).should.be.Promise().which.is.fulfilled(),
			Request.createRequest( Address( "/ip4/0.0.0.0/tcp/54321" ), Address( "/ip4/0.0.0.0/tcp/54321" ), "foo", { foo: "bar" } ).should.be.Promise().which.is.fulfilled(),
		] );
	} );

	test( "exposes uuid as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/54321", "foo" )
			.then( request => {
				request.should.have.property( "uuid" ).which.is.an.instanceof( Uuid );
			} );
	} );

	test( "exposes sender's address as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo" )
			.then( request => {
				request.should.have.property( "sender" ).which.is.an.instanceof( Address.Address );
				request.sender.toString().should.equal( "/ip4/0.0.0.0/tcp/54321" );
			} );
	} );

	test( "exposes receiver's address as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo" )
			.then( request => {
				request.should.have.property( "receiver" ).which.is.an.instanceof( Address.Address );
				request.receiver.toString().should.equal( "/ip4/0.0.0.0/tcp/12345" );
			} );
	} );

	test( "exposes action name as property", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo" )
			.then( request => {
				request.should.have.property( "action" ).which.is.a.String().and.equals( "foo" );
			} );
	} );

	test( "exposes empty data object as property by default", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo" )
			.then( request => {
				request.should.have.property( "data" ).which.is.an.Object().and.is.empty();
			} );
	} );

	test( "exposes data object optionally given on creating request as property", () => {
		const data = {};

		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo", data )
			.then( request => {
				request.should.have.property( "data" ).which.is.an.Object().and.equal( data );
			} );
	} );

	test( "exposes method for compiling message to serializable object", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo" )
			.then( request => {
				request.should.have.property( "compile" ).which.is.a.Function().and.has.length( 0 );
				request.compile.bind( request ).should.not.throw();

				const compiled = request.compile();
				compiled.should.be.Object().and.have.properties( "i", "f", "t", "R", "d" ).and.have.size( 5 );

				( () => JSON.parse( JSON.stringify( compiled ) ) ).should.not.throw();
				const serialized = JSON.parse( JSON.stringify( compiled ) );
				serialized.should.be.Object().and.have.properties( "i", "f", "t", "R", "d" ).and.have.size( 5 );
				serialized.i.should.equal( compiled.i );
				serialized.f.should.equal( compiled.f );
				serialized.t.should.equal( compiled.t );
				serialized.R.should.equal( compiled.R );
				Should.deepEqual( serialized.d, compiled.d );

				return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo", { foo: "bar", baz: 3 } )
					.then( request => {
						request.compile.bind( request ).should.not.throw();

						const compiled = request.compile();
						compiled.should.be.Object().and.have.properties( "i", "f", "t", "R", "d" ).and.have.size( 5 );

						( () => JSON.parse( JSON.stringify( compiled ) ) ).should.not.throw();
						const serialized = JSON.parse( JSON.stringify( compiled ) );
						serialized.should.be.Object().and.have.properties( "i", "f", "t", "R", "d" ).and.have.size( 5 );
						Should.deepEqual( serialized.d, compiled.d );
					} );
			} );
	} );

	test( "exposes static method for parsing compiled message", () => {
		return Request.createRequest( "/ip4/0.0.0.0/tcp/54321", "/ip4/0.0.0.0/tcp/12345", "foo", { foo: "bar", baz: 3 } )
			.then( request => {
				const compiled = JSON.parse( JSON.stringify( request.compile() ) );

				Request.should.have.property( "parse" ).which.is.a.Function().and.has.length( 1 );

				( () => Request.parse( compiled ) ).should.not.throw();
				const parsed = Request.parse( compiled );
				Should.exist( parsed );

				return parsed.should.be.Promise().which.is.fulfilled()
					.then( () => parsed )
					.then( parsed => {
						parsed.uuid.should.not.equal( request.uuid );
						parsed.uuid.toString().should.equal( request.uuid.toString() );
						parsed.sender.should.not.equal( request.sender );
						parsed.sender.toString().should.equal( request.sender.toString() );
						parsed.receiver.should.not.equal( request.receiver );
						parsed.receiver.toString().should.equal( request.receiver.toString() );
						parsed.action.should.equal( request.action );
						parsed.data.should.not.equal( request.data );
						Should.deepEqual( parsed.data, request.data );
					} );
			} );
	} );

} );
