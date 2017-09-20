"use strict";

const MultiAddr = require( "multiaddr" );

/**
 * Describes address of a single node in cluster.
 *
 * @type {Address}
 * @name Address
 * @property {MultiAddr} _multiAddr
 * @property {string} _address
 */
class Address {
	constructor( address ) {
		this._multiAddr = MultiAddr( address.toString().split( "/" ).slice( 0, 5 ).join( "/" ) );
		this._address = this._multiAddr.toString();
	}

	/**
	 * Provides current address as node-compatible object.
	 *
	 * @returns {{family:string, address:string, port:Number}}
	 */
	nodeAddress() {
		return this._multiAddr.nodeAddress();
	}

	/**
	 * Retrieves normalized address as string.
	 *
	 * @example /ip4/127.0.0.1/tcp/9490
	 *
	 * @returns {string}
	 */
	toString() {
		return this._address;
	}

	/**
	 * Retrieves current address value as "JSON".
	 *
	 * This is primarily used on debug() including %j marker in log messages.
	 *
	 * @returns {string}
	 */
	toJSON() {
		return this._address;
	}
}

/**
 * Creates instance of Address from provided string keeping given address as-is
 * on providing existing instance of Address.
 *
 * @param {Address|string} address
 * @returns {Address}
 */
module.exports = function createAddress( address ) {
	if ( address instanceof Address ) {
		return address;
	}

	if ( typeof address !== "string" ) {
		throw new TypeError( "invalid type of address" );
	}

	return new Address( address );
};

module.exports.Address = Address;
