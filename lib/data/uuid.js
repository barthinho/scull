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

const Crypt = require( "crypto" );


/**
 * Manages wrapped access on a UUID.
 *
 * @type {Uuid}
 * @name Uuid
 * @property {Buffer} binary 16-byte buffer containing UUID value
 */
class Uuid {
	/**
	 * @param {Buffer} buffer binary buffer of 16 bytes containing UUIDv4 value
	 */
	constructor( buffer ) {
		if ( !Buffer.isBuffer( buffer ) || buffer.length !== 16 ) {
			throw new TypeError( "invalid buffer" );
		}

		Object.defineProperties( this, {
			binary: { value: buffer },
		} );
	}

	/**
	 * Wraps UUIDv4 base64-encoded for transmission.
	 *
	 * @param {string} base64 BASE64-encoded UUID
	 * @returns {Uuid} managed UUID loaded from provided string
	 */
	static loadFromBase64( base64 ) {
		return new Uuid( Buffer.from( String( base64 ), "base64" ) );
	}

	/**
	 * Generates random UUIDv4.
	 *
	 * @returns {Promise<Uuid>} promises generated UUID
	 */
	static generate() {
		return new Promise( ( resolve, reject ) => {
			Crypt.randomBytes( 16, convertToUuid );

			/**
			 * Handles provided error or marks binary data as UUIDv4 value and
			 * wraps it in an instance of Uuid class.
			 *
			 * @param {?Error} error error encountered on fetching random data
			 * @param {Buffer=} buffer buffer filled w/ random data on success
			 * @returns {Promise<Uuid>} promises managed UUID
			 */
			function convertToUuid( error, buffer ) {
				if ( error ) {
					return reject( new Error( "fetching random data failed: " + error ) );
				}

				// mark buffer to contain UUIDv4
				buffer[6] = ( buffer[6] & 0x0f ) | 0x40;
				buffer[8] = ( buffer[8] & 0x3f ) | 0x80;

				return resolve( new Uuid( buffer ) );
			}
		} );
	}

	/**
	 * Compares this wrapped UUID with provided one supporting any sort of
	 * representation on the latter.
	 *
	 * @param {Uuid|Buffer|string} remote some probable UUID value to compare current with
	 * @returns {boolean} true if values of both UUID match
	 */
	equals( remote ) {
		if ( !remote ) {
			return false;
		}

		if ( remote instanceof Uuid ) {
			return this.binary.equals( remote.binary );
		}

		if ( Buffer.isBuffer( remote ) ) {
			return this.binary.equals( remote );
		}

		remote = String( remote );

		return remote === this.toString() || remote === this.toBase64();
	}

	/**
	 * Converts wrapped UUIDv4 to BASE64-encoded string suitable for
	 * transmission.
	 *
	 * @returns {string} BASE64-encoded version of current UUID
	 */
	toBase64() {
		return this.binary.toString( "base64" );
	}

	/**
	 * Converts wrapped UUIDv4 to commonly formatted string representation.
	 *
	 * @returns {string} current UUID as string
	 */
	toString() {
		// convert to hex-encoded UUID string
		const asString = this.binary.toString( "hex" );

		return asString.substr( 0, 8 ) + "-" +
		       asString.substr( 8, 4 ) + "-" +
		       asString.substr( 12, 4 ) + "-" +
		       asString.substr( 16, 4 ) + "-" +
		       asString.substr( 20, 12 );
	}
}

module.exports = Uuid;
