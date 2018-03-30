"use strict";


/**
 * Implements dynamic map of actually connected peer nodes of cluster.
 *
 * @name Connections
 */
module.exports = class Connections {
	/**
	 * @param {Shell} shell refers to node manager this pool is associated with
	 * @param {Nodes} peers provides managed pool of current peers in cluster
	 */
	constructor( shell, peers ) {
		const pool = {};

		peers.addresses.forEach( add );

		Object.defineProperties( this, {
			/**
			 * Maps addresses of nodes into state marking whether having
			 * established connection to either node or not.
			 *
			 * @name Connections#pool
			 * @property {object<string,boolean>}
			 * @readonly
			 */
			pool: { value: pool },

			/**
			 * Stops connection pool releasing any resources.
			 *
			 * @name Connections#stop
			 * @property {function}
			 * @readonly
			 */
			stop: {
				value: () => {
					shell.removeListener( "connect", mark );
					shell.removeListener( "disconnect", clear );

					peers.removeListener( "added", add );
					peers.removeListener( "removed", remove );
				},
			},
		} );

		shell.on( "connect", mark );
		shell.on( "disconnect", clear );

		peers.on( "added", add );
		peers.on( "removed", remove );


		/**
		 * Marks connection to provided address established.
		 *
		 * @param {Address|string} address address of peer node connection has been established with
		 * @returns {void}
		 */
		function mark( address ) {
			address = String( address );
			if ( pool[address] === false ) {
				pool[address] = true;
			}
		}

		/**
		 * Clears mark on connection to provided address being established.
		 *
		 * @param {Address|string} address address of peer node connection has been lost with
		 * @returns {void}
		 */
		function clear( address ) {
			address = String( address );
			if ( pool[address] === true ) {
				pool[address] = false;
			}
		}

		/**
		 * Adds connection state tracker for new node in cluster.
		 *
		 * @param {Address} address address of peer node joining cluster
		 * @returns {void}
		 */
		function add( address ) {
			pool[String( address )] = false;
		}

		/**
		 * Disables connection state tracking on node in cluster.
		 *
		 * @param {Address} address address of peer node leaving cluster
		 * @returns {void}
		 */
		function remove( address ) {
			pool[String( address )] = undefined;
		}
	}

	/**
	 * Detects if node is currently connected to provided address.
	 *
	 * @param {Address|string} address ID/address of peer node to check connection status
	 * @returns {boolean} true if local node is currently connected to selected node
	 */
	isConnectedTo( address ) {
		return Boolean( this.pool[address.toString()] );
	}
};
