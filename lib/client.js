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

	command( command, options, done ) {
		debug( 'command %j', command );

		const self = this;
		const node = this._pickNode();

		if ( !node ) {
			done( new NotLeaderError( this.node.leader() ) );
		} else {
			options.tries = ( options.tries || 0 ) + 1;

			if ( node === this.node.id ) {
				// local call
				this.node.command( command, options, handleReply );
			} else {
				// remote call
				debug( 'forwarding command %j to %s via RPC', node, command );

				const rpcOptions = Object.assign( {}, options, { remote: true } );
				this.node.rpc( {
					from: this.node.id,
					to: node,
					action: 'Command',
					params: { command, options: rpcOptions }
				}, handlingRPCReply( handleReply ) );
			}
		}

		function handleReply( err, result ) {
			debug( 'reply to command %j: err: %s, reply: %j', command, err && err.message, result );

			if ( err ) {
				switch ( err.message ) {
					case 'not connected' :
						maybeRetry();
						break;

					default :
						switch ( err.code ) {
							case 'ENOTLEADER' :
							case 'ENOMAJORITY' :
							case 'EOUTDATEDTERM' :
								if ( err.leader ) {
									maybeRetry( true ); // immediate
								} else {
									maybeRetry();
								}
								break;

							default :
								done( err );
						}
				}
			} else {
				done( null, result );
			}
		}

		function maybeRetry( immediate ) {
			if ( options.tries < self.options.clientMaxRetries ) {
				if ( immediate ) {
					setImmediate( () => self.node.command( command, options, done ) );
				} else {
					setTimeout( () => self.node.command( command, options, done ),
						self.options.clientRetryRPCTimeout );
				}
			} else {
				done( new NotLeaderError( self.node.leader() ) );
			}
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

function handlingRPCReply( callback ) {
	return function( err, reply ) {
		if ( !err && reply.params && reply.params.error ) {
			err = reply.params.error;
			if ( typeof err === 'object' ) {
				err = new Error( err.message );
				err.code = reply.params.error.code;
				err.leader = reply.params.error.leader;
			} else {
				err = new Error( err );
			}
		}

		callback( err, reply && reply.params && reply.params.result );
	};
}

module.exports = Client;
