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

const { suite, test } = require( "mocha" );
const Should = require( "should" );

const ObjectUtils = require( "../../lib/utils/object" );


suite( "Object utilities", () => {
	test( "are available", () => {
		Should.exist( ObjectUtils );
	} );

	suite( "expose function `deepMerge()` which", () => {
		const { deepMerge } = ObjectUtils;

		test( "is a function", () => {
			deepMerge.should.be.Function().which.has.length( 1 );
		} );

		test( "returns object provided in first argument", () => {
			const object = {};

			deepMerge( object ).should.be.equal( object );
		} );

		test( "puts properties found in second argument in target object provided in first argument", () => {
			const object = {};

			deepMerge( object, { first: "set" } ).should.be.equal( object );
			object.first.should.be.equal( "set" );
		} );

		test( "creates copies of properties with object values", () => {
			const object = {};
			const original = { info: "original" };

			deepMerge( object, { first: original } ).should.be.equal( object );
			object.first.should.not.be.equal( original );
			object.first.should.be.eql( original );
		} );

		test( "creates copies of properties with array of object values", () => {
			const object = {};
			const some = { info: "some" };
			const source = { info: "source" };
			const list = [ some, source ];

			deepMerge( object, { first: list } ).should.be.equal( object );
			object.first.should.not.be.equal( list );
			object.first.should.be.eql( list );

			object.first[0].should.not.be.equal( list[0] );
			object.first[0].should.be.eql( list[0] );

			object.first[1].should.not.be.equal( list[1] );
			object.first[1].should.be.eql( list[1] );
		} );

		test( "creates copies of properties with array of object values containing arrays", () => {
			const object = {};
			const some = { info: ["some"] };
			const source = { info: [{}] };
			const list = [ some, source ];

			deepMerge( object, { first: list } ).should.be.equal( object );
			object.first.should.not.be.equal( list );
			object.first.should.be.eql( list );

			object.first[0].should.not.be.equal( list[0] );
			object.first[0].should.be.eql( list[0] );

			object.first[0].info.should.not.be.equal( list[0].info );
			object.first[0].info.should.be.eql( list[0].info );

			object.first[1].info.should.not.be.equal( list[1].info );
			object.first[1].info.should.be.eql( list[1].info );
		} );
	} );
} );
