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

const Debug = require( "debug" )( "scull:network:message" );

const Address = require( "../../data/address" );

/**
 * @typedef {object} NormalizedNetworkMessage
 * @property {Address} from
 * @property {Address} to
 */

/**
 * Wraps single message transmitted to or received from peer node via network.
 *
 * @note This class is used for commonly accessing messages. It isn't encoding
 *       or decoding messages for actual transfer.
 */
class NetworkMessage {
	/**
	 * Validates and normalizes provided message object.
	 *
	 * @note This method is validating sender and recipient in message and
	 *       write-protects either property.
	 *
	 * @param {object} data raw data of message (e.g. as received from peer node)
	 * @returns {NormalizedNetworkMessage} normalized and validated message object
	 * @throws Error if provided message data is invalid.
	 */
	static normalize( data ) {
		if ( !data ) {
			throw new TypeError( "missing message object" );
		}

		if ( !data._normalizedMessage ) {
			if ( data.from ) {
				Object.defineProperty( data, "from", {
					value: Address( data.from ),
					enumerable: true,
				} );
			} else {
				throw new TypeError( "missing sender address" );
			}

			if ( data.to ) {
				Object.defineProperty( data, "to", {
					value: Address( data.to ),
					enumerable: true,
				} );
			} else {
				throw new TypeError( "missing recipient address" );
			}

			Object.defineProperty( data, "_normalizedMessage", { value: true } );
		}


		return data;
	}

	/**
	 * Creates copy of provided message object suitable for serialization.
	 *
	 * @param {object} message message data
	 * @returns {object} serializable copy of provided message object
	 */
	static copyToSerializable( message ) {
		const copy = {};
		const keys = Object.keys( message );

		for ( let i = 0, length = keys.length; i < length; i++ ) {
			const key = keys[i];
			let value = message[key];

			switch ( key ) {
				case "from" :
				case "to" :
					value = Address( value ).id;
					break;
			}

			copy[key] = value;
		}

		return copy;
	}

	/**
	 * Derives copy of current message prepared for responding.
	 *
	 * Basically this response is prepared with addresses of sender and
	 * receiver flipped. Any field/property listed in `keepFields` is included
	 * with resulting object, too.
	 *
	 * @param {object} message message considered request to respond to
	 * @param {boolean|string[]} keepFields lists names of message fields to keep in response, provide true for keeping all fields
	 * @returns {object} response message suitable for responding to given request
	 */
	static deriveResponse( message, keepFields = false ) {
		const keys = Object.keys( message );
		const response = {};
		let _keepFields = keepFields;

		if ( _keepFields === true ) {
			_keepFields = keys;
		} else if ( !_keepFields ) {
			_keepFields = [];
		} else if ( !Array.isArray( _keepFields ) ) {
			throw new TypeError( "invalid list of fields to keep in response" );
		}


		for ( let i = 0, length = keys.length; i < length; i++ ) {
			const key = keys[i];

			switch ( key ) {
				case "from" :
					Object.defineProperty( response, "to", {
						value: Address( message.from ),
						enumerable: true,
					} );
					break;

				case "to" :
					Object.defineProperty( response, "from", {
						value: Address( message.to ),
						enumerable: true,
					} );
					break;

				default :
					if ( _keepFields.indexOf( key ) > -1 ) {
						response[key] = message[key];
					}
			}
		}

		return response;
	}

	/**
	 * Detects if two given messages are equal or not.
	 *
	 * @note This method is comparing every shallow property of either given
	 *       message by using string-representation of every property.
	 *
	 * @param {object} a first of two messages to be compared w/ each other
	 * @param {object} b second of two messages to be compared w/ each other
	 * @returns {boolean} true if both messages are considered equivalent
	 */
	static compare( a, b ) {
		for ( let keys = Object.keys( a ), length = keys.length, i = 0; i < length; i++ ) {
			const key = keys[i];

			if ( !( key in b ) ) {
				Debug( `2nd missing ${key}` );
				return false;
			}

			if ( key === "from" || key === "to" ) {
				if ( a[key] instanceof Address.Address ) {
					if ( !a[key].matches( b[key] ) ) {
						Debug( `different ${key}` );
						Debug( a[key] );
						Debug( b[key] );
						return false;
					}

					continue;
				}
			}

			if ( String( a[key] ) !== String( b[key] ) ) {
				Debug( `different ${key}` );
				Debug( a[key] );
				Debug( b[key] );
				return false;
			}
		}

		for ( let keys = Object.keys( b ), length = keys.length, i = 0; i < length; i++ ) {
			const key = keys[i];

			if ( !( key in a ) ) {
				Debug( `1st missing ${key}` );
				return false;
			}
		}

		return true;
	}
}

module.exports = { NetworkMessage };
