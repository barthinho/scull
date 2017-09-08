'use strict';

const Debug = require( 'debug' )( 'skiff.rpc' );
const Traffic = require( 'debug' )( 'skiff.traffic' );
const Uuid = require( 'uuid' ).v4;

/**
 * @param {Node} node
 * @returns {function(options:object<string,*>):Promise<object>}
 */
module.exports = function createRPC( node ) {
	/**
	 * Performs remote procedure call (RPC) bound to some Node instance.
	 *
	 * @name rpc
	 * @param {object<string,*>} options description of RPC to perform
	 * @returns {Promise<object>} promises result of RPC
	 */
	return function rpc( options ) {
		Debug( '%s: rpc to: %s, action: %s, params: %j', node.id, options.to, options.action, options.params );

		const term = node.term;
		const id = Uuid();

		const timeoutMS = options.timeout || node.options.rpcTimeoutMS;
		const started = Date.now();

		const receiver = options.to.toString();

		const message = {
			from: node.id.toString(),
			to: receiver,
			id,
			type: 'request',
			action: options.action,
			params: options.params,
		};

		Traffic( 'RPC  %s   => %s  %s  %s   %j', message.from, message.to, message.id, message.action || message.type, message.params );

		return new Promise( ( resolve, reject ) => {
			const timeout = setTimeout( onTimeout, timeoutMS );

			node.requestOut.write( message, error => {
				if ( error ) {
					detach();
					return reject( error );
				}

				node.emit( 'message sent', message );
				node.emit( 'rpc sent', options.action );
			} );

			node.rpcReplies.on( 'data', onReplyData );

			function onReplyData( message ) {
				const matchingRequest = ( message.type === 'reply' && message.from === receiver && message.id === id);
				if ( matchingRequest ) {
					const latency = Date.now() - started;

					if ( !message.fake ) {
						setImmediate( () => node.emit( 'rpc latency', latency ) );
					}

					if ( node.term > term ) {
						Traffic( 'RPC* %s <=   %s  %s  %s %dms', message.to, message.from, message.id, message.action || message.replyTo || message.type, latency );
						detach();
						return reject( Object.assign( new Error( 'outdated term' ), { code: 'EOUTDATEDTERM' } ) );
					}

					Traffic( 'RPC  %s <=   %s  %s  %s %dms   %j', message.to, message.from, message.id, message.action || message.replyTo || message.type, latency, message.params );
					detach();

					const error = message.error;
					if ( error ) {
						reject( error );
					} else {
						resolve( message );
					}
				}
			}

			function onTimeout() {
				Debug( '%s: RPC timeout on %s with ID %s', node.id, options.action, id );
				detach();
				reject( Object.assign( new Error( `timeout RPC to ${options.to}, action = ${options.action}` ), { code: 'ETIMEDOUT' } ) );
			}

			function detach() {
				node.rpcReplies.removeListener( 'data', onReplyData );
				clearTimeout( timeout );
			}
		} );
	};
};
