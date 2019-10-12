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

/**
 * Deeply merges provided objects into provided target object.
 *
 * @param {object} target object adjusted due to merging properties of sources
 * @param {object} sources list of source objects to be merged into target
 * @returns {object} provided target object
 */
function deepMerge( target, ...sources ) {
	const _target = target || {};

	for ( let si = 0, numSources = sources.length; si < numSources; si++ ) {
		const source = sources[si];

		if ( source && typeof source === "object" ) {
			const keys = Object.keys( source );

			for ( let ki = 0, numKeys = keys.length; ki < numKeys; ki++ ) {
				const key = keys[ki];

				switch ( key ) {
					case "__proto__" :
					case "prototype" :
					case "constructor" :
						break;

					default : {
						const value = source[key];

						switch ( typeof value ) {
							case "object" :
								if ( Array.isArray( value ) ) {
									_target[key] = deepCopyArray( value );
									break;
								} else if ( value && value.constructor === Object ) {
									_target[key] = deepMerge( {}, value );
									break;
								}

							// falls through
							default :
								_target[key] = value;
						}
					}
				}
			}
		}
	}

	return _target;
}

/**
 * Creates deep copy of provided array.
 *
 * @param {Array} source some array to be copied
 * @returns {Array} deep copy of provided array
 */
function deepCopyArray( source ) {
	const length = source.length;
	const copy = new Array( length );

	for ( let i = 0; i < length; i++ ) {
		const item = source[i];

		switch ( typeof item ) {
			case "object" :
				if ( Array.isArray( item ) ) {
					copy[i] = deepCopyArray( item );
					break;
				} else if ( item && item.constructor === Object ) {
					copy[i] = deepMerge( {}, item );
					break;
				}

				// falls through
			default :
				copy[i] = item;
		}
	}

	return copy;
}

module.exports = { deepMerge };
