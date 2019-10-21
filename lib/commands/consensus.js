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
const AddressWrapper = require( "../data/address" );


/**
 * Implements command for reaching consensus.
 */
class ConsensusCommand extends AbstractCommand {
	/**
	 * @param {Address|Address[]|string|string[]|Array<(Array|string)>} requiredVoters address/ID of one ore more nodes required to cast vote for consensus
	 * @param {object} options additional options customizing command behaviour
	 */
	constructor( requiredVoters, options = {} ) {
		const voters = ( Array.isArray( requiredVoters ) ? requiredVoters : [requiredVoters] )
			.map( a => AddressWrapper( a ) )
			.filter( a => a );

		super( { alsoWaitFor: voters }, options );
	}

	/** @inheritDoc */
	static get volatile() { return true; }

	/** @inheritDoc */
	static get name() { return "read"; }

	/** @inheritDoc */
	execute( node ) {
		return node._state.seekConsensus( [node.peers.addresses], this );
	}
}

module.exports = ConsensusCommand;
