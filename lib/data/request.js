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

const Message = require( "./message" );
const Response = require( "./response" );
const Uuid = require( "./uuid" );


/**
 * Implements generic structure and behaviour of requesting messages.
 *
 * @name Request
 * @property {string} action name of requested action
 * @property {object} data data customizing requested action
 */
class Request extends Message {
	/**
	 * @param {Uuid} uuid message's UUID
	 * @param {Address|string} from address of node considered sending this message
	 * @param {Address|string} to address of node this message is to be sent to
	 * @param {string} action name of requested action
	 * @param {object} data request data customizing requested action
	 */
	constructor( uuid, from, to, action, data = {} ) {
		super( uuid, from, to );

		if ( !action || typeof action !== "string" || !action.length || action.trim() !== action ) {
			throw new TypeError( "invalid request action name" );
		}

		if ( !data || typeof data !== "object" || Array.isArray( data ) ) {
			throw new TypeError( "invalid request data" );
		}

		Object.defineProperties( this, {
			action: { value: action },
			data: { value: data || {} }
		} );
	}

	/**
	 * Creates message requesting given action customized with provided data.
	 *
	 * @param {Address|string} from
	 * @param {Address|string} to
	 * @param {string} action
	 * @param {object} data
	 * @returns {Promise.<Request>}
	 */
	static createRequest( from, to, action, data = {} ) {
		return Uuid.generate()
			.then( uuid => new Request( uuid, from, to, action, data ) );
	}

	/**
	 * Generates response message asscoiated with current request.
	 *
	 * @param {object} data response data
	 * @returns {Response}
	 */
	deriveResponse( data = {} ) {
		return new Response( this, data );
	}

	/** @inheritDoc */
	compile() {
		let compiled = super.compile();

		compiled.R = this.action;
		compiled.d = this.data;

		return compiled;
	}

	/** @inheritDoc */
	static isValidCompilation( compiled ) {
		return super.isValidCompilation( compiled ) && compiled.R && compiled.d && typeof compiled.d === "object";
	}

	/**
	 * Creates wrapper for accessing compiled request message.
	 *
	 * @param {object} compiled object describing message in format as returned by `Request#compile()`
	 * @returns {Promise<Request>}
	 */
	static parse( compiled ) {
		if ( !this.isValidCompilation( compiled ) ) {
			return Promise.reject( new TypeError( "invalid/malformed message" ) );
		}

		return Promise.resolve( new Request( Uuid.loadFromBase64( compiled.i ), compiled.f, compiled.t, compiled.R, compiled.d ) );
	}
}

module.exports = Request;
