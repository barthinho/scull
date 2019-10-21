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

module.exports = {
	Consensus: require( "./consensus" ),

	// topology commands
	Peers: require( "./peers" ),
	Join: require( "./join" ),
	Leave: require( "./leave" ),

	// database commands
	Get: require( "./get" ),
	Put: require( "./put" ),
	Delete: require( "./delete" ),
	Batch: require( "./batch" ),

	/**
	 * Delivers implementation of command selected by its name.
	 *
	 * @param {string} name name of command
	 * @returns {?class<AbstractCommand>} found command implementation
	 */
	getCommandByName( name ) {
		for ( const className of Object.keys( module.exports ) ) {
			if ( className !== "getCommandByName" ) {
				const classImplementation = module.exports[className];
				if ( classImplementation.name === name ) {
					return classImplementation;
				}
			}
		}

		return null;
	}
};
