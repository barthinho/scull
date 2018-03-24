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

const EventEmitter = require( "events" );

const Address = require( "./address" );


/**
 * @typedef {(Address|string|{id:(string|Address)}|{address:(string|Address)})} SupportedAddress
 */

/**
 * Manages pool of nodes currently considered part of cluster.
 *
 * This list is used to share up-to-date peer node validation between several
 * parts of skull.
 */
class Nodes extends EventEmitter {
	/**
	 * @param {SupportedAddress[]} addresses lists addresses of nodes for initializing pool
	 * @param {SupportedAddress} local marks address of local node which is always kept in list and excluded from actually listed addresses
	 */
	constructor( addresses = [], local = null ) {
		super();


		if ( !Array.isArray( addresses ) ) {
			if ( addresses ) {
				throw new TypeError( "invalid list of node addresses" );
			}

			addresses = [];
		}

		addresses = addresses
			.map( ( address, index ) => {
				try {
					return Address( address );
				} catch ( error ) {
					throw new TypeError( `${error.message} at index #${index}` );
				}
			} );

		if ( local ) {
			local = Address( local );

			addresses = addresses.filter( address => !local.matches( address ) );
		}


		Object.defineProperties( this, {
			/**
			 * Fetches copy of current addresses in pool.
			 *
			 * @name Nodes#addresses
			 * @property {Address[]}
			 * @readonly
			 */
			addresses: { get: () => addresses.slice( 0 ) },

			/**
			 * Exposes optionally provided address of local node.
			 *
			 * @name Nodes#local
			 * @property {?Address}
			 * @readonly
			 */
			local: { value: local || null },

			/**
			 * Tests if provided node is listed in pool currently.
			 *
			 * @note The provided "address" may be anything that is accepted by
			 *       normalizing method exported by module `lib/data/address`.
			 *
			 * @name Nodes#contains
			 * @property {function(SupportedAddress):boolean}
			 * @readonly
			 */
			has: {
				value: nodeOrAddress => {
					if ( !nodeOrAddress ) {
						return false;
					}

					nodeOrAddress = Address( nodeOrAddress );

					if ( local && local.matches( nodeOrAddress ) ) {
						return true;
					}

					return Boolean( addresses.find( valid => valid.matches( nodeOrAddress ) ) );
				}
			},

			/**
			 * Adds address to pool emitting `added` event on actually adding
			 * provided address.
			 *
			 * @note The provided "address" may be anything that is accepted by
			 *       normalizing method exported by module `lib/data/address`.
			 *
			 * @name Nodes#add
			 * @property {function(SupportedAddress):Nodes}
			 * @readonly
			 */
			add: {
				value: nodeOrAddress => {
					nodeOrAddress = Address( nodeOrAddress );
					if ( !local || !local.matches( nodeOrAddress ) ) {
						if ( !addresses.find( address => address.matches( nodeOrAddress ) ) ) {
							addresses.push( nodeOrAddress );

							this.emit( "added", nodeOrAddress );
						}
					}

					return this;
				}
			},

			/**
			 * Removes address from pool emitting `removed` event on actually
			 * removing provided address.
			 *
			 * @note The provided "address" may be anything that is accepted by
			 *       normalizing method exported by module `lib/data/address`.
			 *
			 * @name Nodes#remove
			 * @property {function(SupportedAddress):Nodes}
			 * @readonly
			 */
			remove: {
				value: nodeOrAddress => {
					nodeOrAddress = Address( nodeOrAddress );
					if ( !local || !local.matches( nodeOrAddress ) ) {
						const foundIndex = addresses.findIndex( address => address.matches( nodeOrAddress ) );
						if ( foundIndex > -1 ) {
							addresses.splice( foundIndex, 1 );

							this.emit( "removed", nodeOrAddress );
						}
					}

					return this;
				}
			},
		} );
	}
}

module.exports = Nodes;
