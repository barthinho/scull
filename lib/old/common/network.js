/* eslint-disable valid-jsdoc,no-unused-vars */
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

const { Writable } = require( "stream" );

const PromiseUtil = require( "promise-essentials" );



/**
 * Describes common API of network instances.
 *
 * A network is a node's view on current cluster of nodes.
 *
 * @extends Writable
 * @extends EventEmitter
 */
class Network extends Writable {
	/**
	 * Fetches node in current network representing connection to peer available
	 * at given address.
	 *
	 * @note If selected address isn't represented in network a new node is
	 *       created in scope of network.
	 *
	 * @note Providing address via instances of `Address` is preferred.
	 *
	 * @param {AnyAddress} address
	 * @param {boolean} createIfMissing set false to omit implicit creation of missing node
	 * @returns {?NetworkNode} selected node, null if node is missing and not created implicitly
	 * @abstract
	 */
	node( address, { createIfMissing = true } = {} ) {
		throw new Error( "invalid use of abstract `Network#node()`" );
	}

	/**
	 * Indicates if network knows node selected by given address.
	 *
	 * @note Providing address via instances of `Address` is preferred.
	 *
	 * @param {AnyAddress} address address of node to be tested
	 * @returns {boolean} true if node is considered valid part of network
	 * @abstract
	 */
	isValidNode( address ) { // jshint ignore:line
		throw new Error( "invalid use of abstract `Network#isValidNode()`" );
	}

	/**
	 * Drops node selected by given address in context of network.
	 *
	 * @node This is a convenient helper to check if selected node is valid
	 *       prior to dropping it.
	 *
	 * @note Providing address via instances of `Address` is preferred.
	 *
	 * @param {AnyAddress} address
	 * @param {object} options
	 * @returns {Promise} promises dropping of addressed node
	 * @abstract
	 */
	drop( address, options = {} ) {
		return Promise.reject( new Error( "invalid use of abstract `Network#drop()`" ) );
	}

	/**
	 * Sends message to this node.
	 *
	 * @note This method is a promisified version of `Writable#write()`.
	 *
	 * @param {object} message message to be sent
	 * @returns {Promise}
	 */
	send( message ) {
		return new Promise( ( resolve, reject ) => {
			this.once( "error", reject );

			this.write( message, () => {
				this.off( "error", reject );

				resolve( message );
			} );
		} );
	}

	/**
	 * Assigns nodes manager tracking addresses of valid nodes of cluster.
	 *
	 * @param {Nodes} nodes manager tracking valid nodes of cluster
	 * @returns {Network} fluent interface
	 * @abstract
	 */
	assignNodes( nodes ) {
		return this;
	}
}


module.exports = { Network };
