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

		// normalize and validate provided addresses
		let _addresses = addresses;

		if ( !Array.isArray( _addresses ) ) {
			if ( _addresses ) {
				throw new TypeError( "invalid list of node addresses" );
			}

			_addresses = [];
		}

		_addresses = _addresses
			.map( ( address, index ) => {
				try {
					return Address( address );
				} catch ( error ) {
					throw new TypeError( `${error.message} at index #${index}` );
				}
			} );

		const _local = local && Address( local );
		if ( _local ) {
			_addresses = _addresses.filter( address => !_local.matches( address ) );
		}


		Object.defineProperties( this, {
			/**
			 * Lists addresses of all currently known peer nodes in cluster.
			 *
			 * @note Fetched list is always a copy of internally managed set to
			 *       prevent accidental change of accepted peers.
			 *
			 * @name Nodes#addresses
			 * @property {Address[]}
			 * @readonly
			 */
			addresses: { get: () => _addresses.slice( 0 ) },

			/**
			 * Exposes optionally provided address of local node.
			 *
			 * @name Nodes#local
			 * @property {?Address}
			 * @readonly
			 */
			local: { value: _local || null },

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

					const _nodeOrAddress = Address( nodeOrAddress );

					if ( _local && _local.matches( _nodeOrAddress ) ) {
						return true;
					}

					return Boolean( _addresses.find( valid => valid.matches( _nodeOrAddress ) ) );
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
					const _nodeOrAddress = Address( nodeOrAddress );
					if ( !_local || !_local.matches( _nodeOrAddress ) ) {
						if ( !_addresses.find( address => address.matches( _nodeOrAddress ) ) ) {
							_addresses.push( _nodeOrAddress );

							this.emit( "added", _nodeOrAddress );
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
					const _nodeOrAddress = Address( nodeOrAddress );
					if ( !_local || !_local.matches( _nodeOrAddress ) ) {
						const foundIndex = _addresses.findIndex( address => address.matches( _nodeOrAddress ) );
						if ( foundIndex > -1 ) {
							_addresses.splice( foundIndex, 1 );

							this.emit( "removed", _nodeOrAddress );
						}
					}

					return this;
				}
			},
		} );
	}

	/**
	 * Exports current list of addresses as array of strings (e.g. for loggin or
	 * for serialization).
	 *
	 * @returns {string[]} resulting list of addresses
	 */
	toJSON() {
		return this.addresses.map( address => address.toString() );
	}
}

module.exports = Nodes;
