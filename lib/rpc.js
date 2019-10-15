"use strict";

const Debug = require( "debug" )( "scull:rpc:debug" );
const Traffic = require( "debug" )( "scull:rpc:traffic" );

const Uuid = require( "./data/uuid" );


/**
 * Describes single remote procedure call.
 *
 * @typedef {object} RPC
 */

/**
 * Describes reply to remote procedure call.
 *
 * @typedef {object} RPCReply
 */

/**
 * Send remote procedure call to designated peer node for processing waiting for
 * reply from selected peer node with result of call.
 *
 * @param {Node} node manager of local node
 * @param {object<string,*>} call remote procedure call to be handled in context of local node
 * @returns {Promise<object>} promises RPC handled
 */
module.exports = function rpc( node, call ) {
	const { id, term } = node;

	const me = String( id );
	const timeoutMS = call.timeout || node.options.rpcTimeoutMS;
	const started = Date.now();
	const receiver = String( call.to );

	return Uuid.generate()
		.then( uuid => {
			uuid = String( uuid );

			const message = {
				from: me,
				to: receiver,
				id: uuid,
				type: "request",
				action: call.action,
				params: call.params,
			};

			if ( call.action !== "AppendEntries" ) {
				Traffic( "RPC  %s  => %s  %s  %s   %j", message.from, message.to, message.id, call.action, message.params );
			}

			return new Promise( ( resolve, reject ) => {
				const timeout = setTimeout( onTimeout, timeoutMS );

				// listen for all upcoming RPC replies waiting for the one
				// matching request sent before
				node.rpcReplies.on( "data", onReplyData );

				node.requestOut.write( message, error => {
					if ( error ) {
						detach();
						reject( error );
						return;
					}

					node.emit( "message sent", message );
					node.emit( "rpc sent", call.action );
				} );


				/**
				 * Handles reply to outgoing RPC request.
				 *
				 * @param {RPCReply} reply describes reply message
				 * @returns {void}
				 */
				function onReplyData( reply ) {
					const matchingRequest = reply.type === "reply" &&
					                        String( reply.from ) === receiver &&
					                        String( reply.to ) === me &&
					                        reply.id === uuid;

					Debug( `${me}:${matchingRequest ? " matching" : " mismatching"} RPC REPLY: %j`, reply );

					if ( matchingRequest ) {
						const latency = Date.now() - started;

						if ( !reply.fake ) {
							process.nextTick( () => node.emit( "rpc latency", latency ) );
						}

						detach();

						const { params } = reply;
						const action = params.replyTo || reply.action || reply.type;

						if ( node.term > term ) {
							// RPC was sent in previous term of current node
							if ( action !== "AppendEntries" ) {
								Traffic( "RPC* %s <=  %s  %s  %s %dms", reply.to, reply.from, reply.id, action, latency );
							}

							reject( Object.assign( new Error( "outdated term" ), { code: "EOUTDATEDTERM" } ) );
							return;
						}

						if ( action !== "AppendEntries" ) {
							Traffic( "RPC  %s <=  %s  %s  %s %dms   %j", reply.to, reply.from, reply.id, action, latency, reply.params );
						}

						const error = reply.error;
						if ( error ) {
							reject( Object.assign( error, { uuid: reply.id } ) );
						} else {
							resolve( reply );
						}
					}
				}

				/**
				 * Handles timeout on waiting for reply to sent RPC request.
				 *
				 * @returns {void}
				 */
				function onTimeout() {
					Debug( "%s: RPC timeout on %s with ID %s", node.id, call.action, uuid );
					detach();

					reject( Object.assign( new Error( `RPC to ${call.to}, action = ${call.action}, id = ${uuid}` ), { code: "ETIMEDOUT" } ) );
				}

				/**
				 * Stops listening for more incoming RPC replies.
				 *
				 * @returns {void}
				 */
				function detach() {
					node.rpcReplies.removeListener( "data", onReplyData );

					clearTimeout( timeout );
				}
			} );
		} );
};
