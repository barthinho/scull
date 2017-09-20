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
const Uuid = require( "./uuid" );


/**
 * Implements generic structure and behaviour of responding messages.
 *
 * @name Response
 * @property {Request} relatedRequest refers to request this message is responding to
 * @property {object} data response data
 */
class Response extends Message {
	/**
	 * @param {Request} request related request
	 * @param {object} data response data
	 */
	constructor( request, data = {} ) {
		if ( !( request instanceof require( "./request" ) ) ) {
			throw new TypeError( "invalid request" );
		}

		if ( !data || typeof data !== "object" || Array.isArray( data ) ) {
			throw new TypeError( "invalid response data" );
		}

		super( request.uuid, request.receiver, request.sender );

		Object.defineProperties( this, {
			relatedRequest: { value: request },
			action: { value: request.action },
			data: { value: data }
		} );
	}

	/**
	 * Creates response message responding to provided request with given data.
	 *
	 * @param {Request} request request response is related to
	 * @param {object} data response data
	 * @returns {Promise.<Response>} promises created response
	 */
	static createResponse( request, data = {} ) {
		return new Promise( resolve => resolve( new Response( request, data ) ) );
	}

	/** @inheritDoc */
	compile() {
		let compiled = super.compile();

		compiled.r = this.relatedRequest.action;
		compiled.d = this.data;

		return compiled;
	}

	/** @inheritDoc */
	static isValidCompilation( compiled ) {
		return super.isValidCompilation( compiled ) && compiled.r && compiled.d && typeof compiled.d === "object";
	}

	/**
	 * Creates wrapper for accessing compiled response message.
	 *
	 * @param {object} compiled object describing message in format as returned by `Response#compile()`
	 * @param {Request} request request message this response is expected to be related to
	 * @returns {Promise<Response>}
	 */
	static parse( compiled, request = null ) {
		if ( !this.isValidCompilation( compiled ) ) {
			return Promise.reject( new TypeError( "invalid/malformed message" ) );
		}

		if ( request ) {
			if ( !( request instanceof require( "./request" ) ) ) {
				return Promise.reject( new TypeError( "invalid request" ) );
			}

			if ( !request.uuid.equals( compiled.i ) || request.action !== compiled.r ||
			     request.receiver.toString() !== compiled.f || request.sender.toString() !== compiled.t ) {
				return Promise.reject( new TypeError( "response does not match provided request" ) );
			}
		} else {
			request = new (require( "./request" ))( Uuid.loadFromBase64( compiled.i ), compiled.t, compiled.f, compiled.r );
		}

		return Promise.resolve( new Response( request, compiled.d ) );
	}
}

module.exports = Response;
