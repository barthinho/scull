'use strict';

const Debug = require( 'debug' )( 'skiff.rpc' );
const Traffic = require( 'debug' )( 'skiff.traffic' );
const Once = require( 'once' );
const Uuid = require( 'uuid' ).v4;

/**
 * @param {Node} node
 * @returns {function(options:object<string,*>,callback:function(error:Error))}
 */
module.exports = function createRPC( node ) {
	return function rpc( options, callback ) {
		Debug( '%s: rpc to: %s, action: %s, params: %j', node.id, options.to, options.action, options.params );

		const term = node.term;
		const done = Once( callback );
		const id = Uuid();

		const timeoutMS = options.timeout || node.options.rpcTimeoutMS;
		const timeout = setTimeout( onTimeout, timeoutMS );
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

		node.requestOut.write( message, err => {
			if ( err ) {
				detach();
				done( err );
			} else {
				node.emit( 'message sent', message );
				node.emit( 'rpc sent', options.action );
			}
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
					done( Object.assign( new Error( 'outdated term' ), { code: 'EOUTDATEDTERM' } ) );
				} else {
					Traffic( 'RPC  %s <=   %s  %s  %s %dms   %j', message.to, message.from, message.id, message.action || message.replyTo || message.type, latency, message.params );
					detach();

					const error = message.error;
					done( error, !error && message );
				}
			}
		}

		function onTimeout() {
			Debug( 'RPC timeout' );
			detach();
			done( Object.assign( new Error( `timeout RPC to ${options.to}, action = ${options.action}` ), { code: 'ETIMEDOUT' } ) );
		}

		function detach() {
			node.rpcReplies.removeListener( 'data', onReplyData );
			clearTimeout( timeout );
		}
	};
};
