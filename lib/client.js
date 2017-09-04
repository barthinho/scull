'use strict';

const debug = require( 'debug' )( 'skiff.client' );

const NotLeaderError = require( './utils/not-leader-error' );

/**
 * Implements client forwarding requests to current leader if current node must
 * not perform them.
 *
 * @type {Client}
 * @name Client
 * @property {Node} node
 * @property {object<string,*>} options
 */
class Client {
	/**
	 * @param {Node} node
	 */
	constructor( node ) {
		Object.defineProperties( this, {
			node: { value: node },
			options: { value: node.options },
		} );
	}

	/**
	 * Forwards given command to peer node in cluster for processing remotely.
	 *
	 * @note This method is picking remote node automatically preferring current
	 *       leader node if known or some randomly chosen peer. However, basic
	 *       commands can be performed on leader node, only, thus request fails
	 *       if leader is unknown.
	 *
	 * @param {object} command actual command to be performed
	 * @param {object<string,*>=} options
	 * @returns {Promise}
	 */
	command( command, options ) {
		debug( 'command %j', command );

		const self = this;
		const node = this._pickNode();

		if ( !node ) {
			return Promise.reject( new NotLeaderError( this.node.leader() ) );
		}

		options.tries = ( options.tries || 0 ) + 1;

		if ( node === this.node.id ) {
			// local call
			return this.node.command( command, options )
				.catch( handleError );
		}

		// remote call
		debug( 'forwarding command %j to %s via RPC', node, command );

		const rpcOptions = Object.assign( {}, options, { remote: true } );

		return this.node.rpc( {
			from: this.node.id,
			to: node,
			action: 'Command',
			params: { command, options: rpcOptions }
		} )
			.then( extractRemoteResult )
			.catch( handleError );


		function handleError( error ) {
			debug( 'reply to command %j failed: %s, reply: %j', command, error && error.message );

			switch ( error.message ) {
				case 'not connected' :
					maybeRetry();
					break;

				default :
					switch ( error.code ) {
						case 'ENOTLEADER' :
						case 'ENOMAJORITY' :
						case 'EOUTDATEDTERM' :
							return maybeRetry( Boolean( error.leader ) );

						default :
							throw error;
					}
			}
		}

		function maybeRetry( immediate ) {
			if ( options.tries < self.options.clientMaxRetries ) {
				if ( immediate ) {
					return self.node.command( command, options );
				}

				return new Promise( ( resolve, reject ) => {
					setTimeout( () => {
							self.node.command( command, options )
								.then( resolve, reject );
						}, self.options.clientRetryRPCTimeout );
				} );
			}

			throw new NotLeaderError( self.node.leader() );
		}
	}

	_pickNode() {
		let node = this.node.leader();
		if ( !node ) {
			const peers = this.node.peers;

			node = peers[Math.floor( Math.random() * peers.length )];
		}

		return node.toString();
	}
}

function extractRemoteResult( reply ) {
	if ( reply.params && reply.params.error ) {
		let { error } = reply.params;
		if ( typeof error === 'object' ) {
			error = new Error( error.message );
			error.code = reply.params.error.code;
			error.leader = reply.params.error.leader;
		} else {
			error = new Error( error );
		}

		throw error;
	}

	return reply && reply.params && reply.params.result;
}

module.exports = Client;
