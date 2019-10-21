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

const AbstractCommand = require( "./abstract" );
const Address = require( "../data/address" );


/**
 * Implements command for adding new node to cluster at runtime.
 */
class JoinCommand extends AbstractCommand {
	/**
	 * @param {string|Address} peer address/ID of node joining cluster
	 * @param {object} options additional options customizing command behaviour
	 */
	constructor( peer, options = {} ) {
		super( { peer }, options );
	}

	/** @inheritDoc */
	static get topology() { return true; }

	/** @inheritDoc */
	static get name() { return "join"; }

	/** @inheritDoc */
	execute( node ) {
		const { peer } = this.args;
		const { peers } = node;
		const consensuses = [peers.addresses];
		let change;

		if ( !peers.has( peer ) ) {
			change = Address( peer );

			// temporarily add joining node to enable communication with it
			peers.add( change );

			consensuses.push( peers.addresses.concat( change ) );
		}

		return node._state.seekConsensus( consensuses, this )
			.catch( error => {
				// consensus failed -> need to revoke temporarily added peer
				if ( change ) {
					peers.remove( change );
				}

				throw error;
			} );
	}
}

module.exports = JoinCommand;
