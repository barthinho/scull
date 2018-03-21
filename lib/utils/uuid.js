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

const { randomBytes } = require( "crypto" );


const ptnUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;


/**
 * Generates UUIDv4 consisting of random bits.
 *
 * @name Uuid
 * @param {boolean} binary set true to get 16 bytes of binary data as Buffer
 * @returns {Promise} promises generated UUIDv4 as string (or as binary on demand)
 */
module.exports = function _uuidv4( { binary = false } = {} ) {
	return new Promise( ( resolve, reject ) => {
		randomBytes( 16, ( error, buffer ) => {
			if ( error ) {
				reject( new Error( "fetching random data failed: " + error ) );
				return;
			}

			// mark buffer to contain UUIDv4
			buffer[6] = ( buffer[6] & 0x0f ) | 0x40;
			buffer[8] = ( buffer[8] & 0x3f ) | 0x80;

			if ( binary ) {
				resolve( buffer );
			} else {
				// convert to hex-encoded UUID string
				buffer = buffer.toString( "hex" );

				resolve( buffer.substr( 0, 8 ) + "-" +
				         buffer.substr( 8, 4 ) + "-" +
				         buffer.substr( 12, 4 ) + "-" +
				         buffer.substr( 16, 4 ) + "-" +
				         buffer.substr( 20, 12 ) );
			}
		} );
	} );
};

/**
 * Detects if provided string contains UUID.
 *
 * @param {string} s some string value
 * @returns {boolean} true if provided string value is representing some UUID
 */
module.exports.isUUID = function( s ) {
	return ptnUuid.test( s );
};

/**
 * Matches well formed UUID.
 *
 * @type {RegExp}
 */
module.exports.ptnUuid = ptnUuid;
