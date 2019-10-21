/**
 * (c) 2019 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 cepharum GmbH
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

const Shell = require( "../../" );

describe( "Cluster node shell", () => {
	let node;

	beforeEach( () => {
		node = null;
	} );

	afterEach( () => {
		return node ? node.stop() : undefined;
	} );

	it( "is available", () => {
		Shell.should.be.ok();
	} );

	it( "throws when instantiated w/o ID", () => {
		( () => new Shell() ).should.throw();
	} );

	it( "does not throw when instantiated w/ ID", () => {
		( () => { node = new Shell( "/ip4/127.0.0.1/tcp/9201" ); } ).should.not.throw();
	} );

	it( "exposes its node manager", () => {
		node = new Shell( "/ip4/127.0.0.1/tcp/9201" );

		node.should.have.property( "node" ).which.is.instanceof( require( "../../lib/node" ) );
	} );

	it( "exposes its database manager", () => {
		node = new Shell( "/ip4/127.0.0.1/tcp/9201" );

		node.should.have.property( "db" ).which.is.instanceof( require( "../../lib/db" ) );
	} );
} );
