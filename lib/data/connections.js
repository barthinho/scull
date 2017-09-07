'use strict';

const Address = require( './address' );


/**
 * Implements pool of connected peers.
 *
 * @type {Connections}
 * @name Connections
 * @property {object<string,boolean>} pool
 */
module.exports = class Connections {
	/**
	 * @param {Shell} shell
	 * @param {string[]} configuredPeers
	 */
	constructor( shell, configuredPeers ) {
		Object.defineProperties( this, {
			pool: { value: {} },
			shell: { value: shell },
		} );

		if ( Array.isArray( configuredPeers ) ) {
			const myAddress = shell.id.toString();

			for ( let i = 0, length = configuredPeers.length; i < length; i++ ) {
				let address = configuredPeers[i];
				if ( address ) {
					address = Address( address ).toString();

					if ( address !== myAddress ) {
						this.mark( address );
					}
				}
			}
		}

		Object.defineProperties( this, {
			_boundMark: { value: this.mark.bind( this ) },
			_boundClear: { value: this.clear.bind( this ) },
		} );

		shell.on( 'connect', this._boundMark );
		shell.on( 'disconnect', this._boundClear );
	}

	stop() {
		this.shell.removeListener( 'connect', this._boundMark );
		this.shell.removeListener( 'disconnect', this._boundClear );
	}

	isConnectedTo( address ) {
		return Boolean( this.pool[address.toString()] );
	}

	mark( address ) {
		this.pool[address.toString()] = true;
	}

	clear( address ) {
		this.pool[address.toString()] = false;
	}
};
