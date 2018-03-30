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

const { ReceivingNetwork, NetworkMessage, NetworkTcpClient } = require( "../../../lib/network/index" );

const Address = require( "../../../lib/data/address" );


const MY_ADDRESS = "/ip4/127.0.0.1/tcp/8080/what/ever";

const REMOTE_ADDRESSES = [
	"/ip4/127.0.0.1/tcp/8081/what/ever",
	"/ip4/127.0.0.1/tcp/8082/what/ever",
	"/ip4/127.0.0.1/tcp/8083/what/ever",
];


suite( "A receiving network", () => {
	test( "is available", () => {
		Should( ReceivingNetwork ).be.ok();
	} );

	test.skip( "can be created w/ local node's address required for listening", () => {
		( () => new ReceivingNetwork() ).should.throw();

		const network = new ReceivingNetwork( MY_ADDRESS );
		network.end();

		return new Promise( resolve => network.once( "close", resolve ) );
	} );

	test.skip( "exposes writable stream", () => {
		const network = new ReceivingNetwork( MY_ADDRESS );

		network.should.be.instanceOf( require( "stream" ).Writable );

		const promise = new Promise( resolve => network.once( "close", resolve ) );
		network.end();
		return promise;
	} );
} );
