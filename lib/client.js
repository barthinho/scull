"use strict";

const Debug = require( "debug" )( "scull.client" );

const NotLeaderError = require( "./utils/not-leader-error" );

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
	 * @param {Node} node manager of local cluster node
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
	 * @param {object<string,*>=} options customizations
	 * @returns {Promise} promises command processed
	 */
	command( command, options = {} ) {
		Debug( "command %j", command );

		const { node: localNode, options: localNodeOptions } = this;

		options.tries = ( options.tries || 0 ) + 1;


		// get address of current leader or some other node in cluster
		// knowing current leader
		let forwardTo = localNode.leader;
		if ( !forwardTo ) {
			const { peers } = localNode;

			forwardTo = peers[Math.floor( Math.random() * peers.length )];
		}

		if ( !forwardTo ) {
			// neither know current leader nor some other node in cluster
			// -> pretty stuck ...
			return Promise.reject( new NotLeaderError( localNode.leader ) );
		}

		forwardTo = String( forwardTo );


		if ( forwardTo === localNode.id ) {
			// local call
			return localNode.command( command, options )
				.catch( handleError );
		}


		// remote call
		Debug( "forwarding command to %s: %j", forwardTo, command );

		const rpcOptions = Object.assign( {}, options, { remote: true } );

		return localNode.rpc( {
			from: localNode.id,
			to: forwardTo,
			action: "Command",
			params: { command, options: rpcOptions }
		} )
			.then( extractRemoteResult )
			.catch( handleError );

		/**
		 * Handles error on requesting RPC from remote node.
		 *
		 * @param {Error} error description of error to be handled
		 * @returns {Promise} promises error handled
		 */
		function handleError( error ) {
			Debug( "reply to command %j failed: %s, reply: %j", command, error && error.message );

			switch ( error.code ) {
				case "not connected" :
					return maybeRetry();

				case "ENOTLEADER" :
				case "ENOMAJORITY" :
				case "EOUTDATEDTERM" :
					return maybeRetry( Boolean( error.leader ) );
			}

			throw error;
		}

		/**
		 * Retries RPC request unless having exceeded maximum number of retries.
		 *
		 * @param {boolean} immediate set true to retry immediately
		 * @returns {Promise} promises current command processed after another retry
		 */
		function maybeRetry( immediate = false ) {
			if ( options.tries < localNodeOptions.clientMaxRetries ) {
				if ( immediate ) {
					return localNode.command( command, options );
				}

				return new Promise( ( resolve, reject ) => {
					setTimeout( () => {
						localNode.command( command, options )
							.then( resolve )
							.catch( reject );
					}, localNodeOptions.clientRetryRPCTimeout );
				} );
			}

			throw new NotLeaderError( localNode.leader );
		}
	}
}

/**
 * Extracts information from result sent back by remote node on processing RPC.
 *
 * @param {object} reply RPC reply message
 * @returns {object} result extracted from RPC reply
 */
function extractRemoteResult( reply ) {
	if ( reply.params && reply.params.error ) {
		let { error } = reply.params;
		if ( typeof error === "object" ) {
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
