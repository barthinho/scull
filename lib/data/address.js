"use strict";

const MultiAddr = require( "multiaddr" );


/**
 * @typedef {object} RawNodeAddress
 * @property {int} port port number
 * @property {string} host IP address
 */

/**
 * @typedef {RawNodeAddress} RawFamilyNodeAddress
 * @property {int} family version of IP stack, which is either 4 or 6
 */

/**
 * @typedef {RawFamilyNodeAddress} RawSocketOptions
 * @property {string} transport either "tcp" or "udp"
 */

/**
 * @typedef {object} RawMultiAddress
 * @property {int} port port number
 * @property {string} address IP address
 */

/**
 * @typedef {RawMultiAddress} RawFamilyMultiAddress
 * @property {int} family version of IP stack, which is either 4 or 6
 */

/**
 * @typedef {RawNodeAddress|RawMultiAddress} RawAddress
 */

/**
 * @typedef {RawAddress} RawFamilyAddress
 * @property {string} family
 */

/**
 * @typedef {(RawAddress|Address|string)} AnyAddress
 */



const PatternPort = /^\d+$/;
const PatternHost = /^(?:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|([0-9a-f:]{2,39}))$/i;
const PatternFormat = /^(\/(?:ip4\/\d+(?:\.\d+){3}|ip6\/[0-9a-f:]{2,39})\/[a-z]+\/\d+).*$/i;


/**
 * Describes address of a single node in cluster.
 *
 * @name Address
 */
class Address {
	/**
	 * @param {Address|string} address a network socket's address
	 */
	constructor( address ) {
		let multi;

		if ( address instanceof Address ) {
			// expose same address as provided instance
			multi = address.address;
		} else {
			const asString = address.toString();
			const match = PatternFormat.exec( asString );

			if ( !match ) {
				throw new TypeError( `invalid address: ${asString}` );
			}

			multi = MultiAddr( match[1].toLowerCase() );
		}

		Object.defineProperties( this, {
			/**
			 * Provides parsed address.
			 *
			 * @name Address#address
			 * @property {MultiAddr}
			 * @readonly
			 */
			address: { value: multi },

			/**
			 * Provides string representation of address.
			 *
			 * @name Address#id
			 * @property {string}
			 * @readonly
			 */
			id: { value: multi.toString() },
		} );
	}

	/**
	 * Provides current address as node-compatible object.
	 *
	 * @returns {RawFamilyMultiAddress} wrapped address of network socket
	 */
	nodeAddress() {
		return this.address.nodeAddress();
	}

	/**
	 * Provides current address as node-compatible socket options object.
	 *
	 * @returns {RawSocketOptions} wrapped address of network socket
	 */
	toSocketOptions() {
		const options = this.address.toOptions();

		switch ( options.family ) {
			case "ipv4" :
				options.family = 4;
				break;

			case "ipv6" :
				options.family = 6;
				break;

			default :
				throw new Error( `unsupported family: ${options.family}` );
		}

		return options;
	}

	/**
	 * Retrieves normalized address as string.
	 *
	 * @example /ip4/127.0.0.1/tcp/9490
	 *
	 * @returns {string} current sockets address formatted as multiaddr address
	 */
	toString() {
		return this.id;
	}

	/**
	 * Retrieves current address value as "JSON".
	 *
	 * This is primarily used on debug() including %j marker in log messages.
	 *
	 * @returns {string} serialized address suitable for putting in a JSON object
	 */
	toJSON() {
		return this.id;
	}

	/**
	 * Detects if provided address is selecting TCP socket.
	 *
	 * @returns {boolean} true if address is selecting TCP
	 */
	isTCP() {
		return this.address.toOptions().transport === "tcp";
	}

	/**
	 * Detects if provided address matches current one.
	 *
	 * @note This comparison ignores all but the first four segments of either
	 *       address.
	 *
	 * @param {AnyAddress} address some address to compare with
	 * @returns {boolean} true if provided address matches wrapped one
	 */
	matches( address ) {
		return this.id.toLowerCase() === generator( address ).id.toLowerCase();
	}

	/**
	 * Compiles `MultiAddr` string describing network address according to given
	 * options object providing a host's IP address and port number separately.
	 *
	 * @param {RawAddress} socketOptions description of network socket
	 * @param {boolean} requireHost set true to require host address selecting some host explicitly (rejecting ANY_HOST or some network address)
	 * @returns {string} multiaddr-formatted string describing network socket
	 */
	static compileString( socketOptions, { requireHost = false } = {} ) {
		if ( !socketOptions || typeof socketOptions !== "object" ) {
			throw new TypeError( "missing address information" );
		}

		const port = socketOptions.port;
		let host = String( socketOptions.host || socketOptions.ip || socketOptions.address ).trim();

		if ( !parseInt( port ) || !PatternPort.test( port ) || port > 65535 ) {
			throw new TypeError( `invalid port number: ${port}` );
		}

		const match = PatternHost.exec( host );
		if ( !match ) {
			throw new TypeError( `invalid host: ${host}` );
		}

		if ( match[1] ) {
			// IPv4
			host = host
				.split( "." )
				.map( b => parseInt( b ) );

			if ( host.length !== 4 || ( !host[0] && host.some( b => b ) ) || !host.every( b => b > -1 && b < 0x100 ) ) {
				throw new TypeError( `invalid IPv4 host address: ${match[1]}` );
			}

			if ( requireHost && !host.some( b => b ) ) {
				throw new TypeError( `invalid IPv4 non-host address: ${match[1]}` );
			}
		} else {
			// IPv6
			let split = -1;

			host = host.split( ":" );
			host.map( ( b, index ) => {
				if ( b === "" ) {
					if ( index === 0 || index === host.length - 1 ) {
						return "";
					}

					if ( split < 0 ) {
						split = index;
						return "";
					}

					throw new TypeError( `invalid IPv6 host address: ${match[2]}` );
				}

				return parseInt( b, 16 );
			} );

			if ( host.length > 8 || ( split < 0 && host.length !== 8 ) ) {
				throw new TypeError( `invalid IPv6 host address: ${match[2]}` );
			}

			if ( !host.every( b => b === "" || ( b > -1 && b < 0x10000 ) ) ) {
				throw new TypeError( `invalid IPv6 host address: ${match[2]}` );
			}

			if ( requireHost ) {
				if ( !host.some( b => b ) ) {
					throw new TypeError( `invalid IPv6 non-host address: ${match[2]}` );
				}
			}
		}

		return `/ip${match[1] ? "4" : "6"}/${match[1] || match[2]}/tcp/${port}`;
	}
}



/**
 * Creates instance of Address from provided string keeping given address as-is
 * on providing existing instance of Address.
 *
 * @param {AnyAddress} address arbitrary description of address
 * @returns {Address} normalized description of address
 */
function generator( address ) {
	if ( address instanceof Address ) {
		return address;
	}

	switch ( typeof address ) {
		case "string" :
			break;

		case "object" :
			if ( address ) {
				if ( address.id ) {
					return generator( address.id );
				}

				if ( !address.hasOwnProperty( "port" ) ) {
					const sub = address.address;
					switch ( typeof sub ) {
						case "string" :
						case "object" :
							if ( sub ) {
								return generator( sub );
							}
					}
				}

				address = Address.compileString( address );
				break;
			}

			// falls through
		default :
			throw new TypeError( "invalid type of address" );
	}

	return new Address( address );
}

// expose class as static property of generator function exposed basically
generator.Address = Address;



module.exports = generator;
