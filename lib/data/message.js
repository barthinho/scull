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

const Address = require( "./address" );
const Uuid = require( "./uuid" );



/**
 * Implements generic structure and behaviour of any message.
 *
 * @name Message
 * @property {Uuid} uuid message's UUID
 * @property {Address} sender
 * @property {Address} receiver
 */
class Message {
	/**
	 * @param {Uuid} uuid message's UUID
	 * @param {Address|string} sender address of node considered sending this message
	 * @param {Address|string} receiver address of node this message is to be sent to
	 */
	constructor( uuid, sender, receiver ) {
		if ( !( uuid instanceof Uuid ) ) {
			throw new TypeError( "invalid UUID" );
		}

		Object.defineProperties( this, {
			/**
			 * Provides message's unique ID.
			 *
			 * @name Message#uuid
			 * @property {Uuid}
			 * @readonly
			 */
			uuid: { value: uuid },

			/**
			 * Provides address of message's sender.
			 *
			 * @name Message#sender
			 * @property {Address}
			 * @readonly
			 */
			sender: { value: Address( sender ) },

			/**
			 * Provides address of message's recipient.
			 *
			 * @name Message#receiver
			 * @property {Address}
			 * @readonly
			 */
			receiver: { value: Address( receiver ) }
		} );
	}

	/**
	 * Compiles message into serializable object containing all essential
	 * information on message.
	 *
	 * @returns {object} compiled message
	 */
	compile() {
		return {
			i: this.uuid.toBase64(),
			f: this.sender.toString(),
			t: this.receiver.toString(),
		};
	}

	/**
	 * Detects if provided object is a valid compilation of supported message as
	 * returned by `Message#compile()` or some overloading variant.
	 *
	 * @param {object} compiled some compiled message
	 * @returns {boolean} true if object contains properly compiled message
	 */
	static isValidCompilation( compiled ) {
		return compiled && compiled.i && compiled.f && compiled.t;
	}

	/**
	 * Creates wrapper for accessing compiled message.
	 *
	 * @param {object} compiled object describing message in format as returned by `Message#compile()`
	 * @returns {Promise<Message>} promises managed message parsed from compiled message
	 */
	static parse( compiled ) {
		if ( !this.isValidCompilation( compiled ) ) {
			return Promise.reject( new TypeError( "invalid/malformed message" ) );
		}

		return Promise.resolve( new Message( Uuid.loadFromBase64( compiled.i ), compiled.f, compiled.t ) );
	}

	/**
	 * Creates new generic message.
	 *
	 * @param {Address|string} from address of message's sender
	 * @param {Address|string} to address of message's receiver
	 * @returns {Promise<Message>} promises new message created to be sent from/to given node
	 */
	static createMessage( from, to ) {
		return Uuid.generate()
			.then( uuid => new Message( uuid, from, to ) );
	}
}

module.exports = Message;
