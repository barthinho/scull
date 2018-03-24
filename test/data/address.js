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

const Address = require( "../../lib/data/address" );


suite( "Code for handling addresses", () => {
	suite( "is exposing function which", () => {
		test( "is a function", () => {
			Should( Address ).be.a.Function().which.has.length( 1 );
		} );

		suite( "is returning Address matching", () => {
			test( "address provided as string", () => {
				const address = Address( "/ip4/127.0.0.1/tcp/12345" );

				address.should.be.Object();
				address.nodeAddress().should.be.Object();
				Number( address.nodeAddress().port ).should.equal( 12345 );
				address.nodeAddress().address.should.equal( "127.0.0.1" );
			} );
		} );

	} );

	suite( "is exposing data type `Address` which", () => {
		test( "is a static property of basically exposed function", () => {
			Address.Address.should.be.Function();
		} );

		test( "is suitable for testing inheritance of results of basically exposed function", () => {
			Address( "/ip4/127.0.0.1/tcp/1234" ).should.be.instanceOf( Address.Address );
		} );

		test( "compiles MultiAddr-type identifiers from an object providing IPv4 address and port number separately", () => {
			let result;

			( () => { result = Address.Address.compileString( { host: "127.0.0.1", port: 1234 } ); } ).should.not.throw();

			result.should.be.String().which.is.equal( "/ip4/127.0.0.1/tcp/1234" );
		} );

		test( "compiles MultiAddr-type identifiers from an object providing IPv6 address and port number separately", () => {
			let result;

			( () => { result = Address.Address.compileString( { host: "::1", port: 1234 } ); } ).should.not.throw();

			result.should.be.String().which.is.equal( "/ip6/::1/tcp/1234" );
		} );

		test( "validates provided information on compiling MultiAddr-type identifiers", () => {
			[
				[ "127.0.0.1", 1234, true ],
				[ "1.2.3.4", 1234, true ],
				[ "255.255.255.255", 1234, true ], // false positive
				[ "0.0.0.0", 1234, true ],
				[ "0.0.0.0", 1234, false, true ],
				[ "256.256.256.256", 1234 ],
				[ "127.0.0.0", 1234, true ],
				[ "127.0.0.0", 1234, true, true ],
				[ "0.0.0.1", 1234 ],
				[ "127.0.0.1", 0 ],
				[ "127.0.0.1", -1234 ],
				[ "127.0.0.1", 65536 ],

				[ "1:2:3:4:5:6:7:8", 1234, true ],
				[ "1:2:3:4:5:6::8", 1234, true ],
				[ "1:2:3:4:5::8", 1234, true ],
				[ "1:2:3:4::8", 1234, true ],
				[ "1:2:3::8", 1234, true ],
				[ "1:2::8", 1234, true ],
				[ "1::8", 1234, true ],
				[ ":2:3:4:5:6:7:8", 1234, true ],
				[ "1::3:4:5:6:7:8", 1234, true ],
				[ "1:2::4:5:6:7:8", 1234, true ],
				[ "1:2:3::5:6:7:8", 1234, true ],
				[ "1:2:3:4::6:7:8", 1234, true ],
				[ "1:2:3:4:5::7:8", 1234, true ],
				[ "1:2:3:4:5:6::8", 1234, true ],
				[ "1:2:3:4:5:6:7:", 1234, true ],
				[ "::1", 1234, true ],
				[ "::", 1234, true ],
				[ "::", 1234, false, true ],
				[ "::1", 0 ],
				[ "::1", -1234 ],
				[ "::1", 65536 ],
			]
				.forEach( ( [ ip, port, valid = false, requireHost = false ] ) => {
					if ( valid ) {
						( () => Address.Address.compileString( { address: ip, port }, { requireHost } ) ).should.not.throw();
						( () => Address.Address.compileString( { address: ip, port: `${port}` }, { requireHost } ) ).should.not.throw();
						( () => Address.Address.compileString( { host: ip, port }, { requireHost } ) ).should.not.throw();
						( () => Address.Address.compileString( { host: ip, port: `${port}` }, { requireHost } ) ).should.not.throw();
					} else {
						( () => Address.Address.compileString( { address: ip, port }, { requireHost } ) ).should.throw();
						( () => Address.Address.compileString( { address: ip, port: `${port}` }, { requireHost } ) ).should.throw();
						( () => Address.Address.compileString( { host: ip, port }, { requireHost } ) ).should.throw();
						( () => Address.Address.compileString( { host: ip, port: `${port}` }, { requireHost } ) ).should.throw();
					}
				} );
		} );
	} );
} );
