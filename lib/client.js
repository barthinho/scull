"use strict";

const Debug = require( "debug" );

const NotLeaderError = require( "./utils/not-leader-error" );


const DebugLog = Debug( "scull:client" );


/**
 * Implements client forwarding commands to node currently leading cluster.
 */
class Client {
	/**
	 * @param {Node} node manager of local cluster node
	 */
	constructor( node ) {
		Object.defineProperties( this, {
			/**
			 * Refers to node this client is used by.
			 *
			 * @name Client#node
			 * @property {Node}
			 * @readonly
			 */
			node: { value: node },

			/**
			 * Exposes options of node this client is used by.
			 *
			 * @name Client#options
			 * @property {object}
			 * @readonly
			 */
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
	 * @param {AbstractCommand} command command to be executed remotely
	 * @returns {Promise} promises command processed
	 */
	command( command ) {
		const { node: localNode, options: localNodeOptions } = this;

		command.options.tries = ( command.options.tries || 0 ) + 1;


		// forward to current leader of cluster
		const forwardTo = localNode.leader;
		if ( !forwardTo ) {
			return Promise.reject( new NotLeaderError() );
		}

		if ( localNode.id.matches( forwardTo ) ) {
			return localNode.command( command )
				.catch( handleError );
		}


		DebugLog( `forwarding ${command} to ${forwardTo}` );

		return localNode.network.getPeer( forwardTo )
			.call( "Command", {
				name: command.constructor.name,
				args: command.args,
				options: command.options,
			} )
			.then( reply => {
				if ( reply ) {
					return reply.result;
				}

				throw new Error( `forwarding ${command} to ${forwardTo} yielded no result` );
			} )
			.catch( handleError );

		/**
		 * Handles error on requesting RPC from remote node.
		 *
		 * @param {Error} error description of error to be handled
		 * @returns {Promise} promises error handled
		 */
		function handleError( error ) {
			DebugLog( `${error ? error.message : "unknown error"} in reply to ${command}` );

			switch ( error.code ) {
				case "ECONNABORTED" :
				case "ECONNRESET" :
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
			if ( command.options.tries < localNodeOptions.clientMaxRetries ) {
				if ( immediate ) {
					return localNode.command( command );
				}

				return new Promise( ( resolve, reject ) => {
					setTimeout( () => {
						localNode.command( command )
							.then( resolve )
							.catch( reject );
					}, localNodeOptions.clientRetryRPCTimeout );
				} );
			}

			throw new NotLeaderError( localNode.leader );
		}
	}
}

module.exports = Client;
