'use strict';

const MemDown = require( 'memdown' );

const Shell = require( '../../shell' );
const Node = require( '../node' );

let nextPort = 9999;


let outputOnStdErr = false;

const _originalWriter = process.stderr.write;
process.stderr.write = function( chunk ) {
	if ( chunk instanceof Buffer ) {
		chunk = chunk.toString( "utf8" );
	}

	if ( typeof chunk !== "string" ) {
		chunk = String( chunk );
	}

	outputOnStdErr |= ( chunk.trim().length > 0 );

	return _originalWriter.apply( this, arguments );
};


/**
 * Implements mock-up of a node controller.
 *
 * @type {NodeMockUp}
 * @name NodeMockUp
 */
class NodeMockUp extends Node {
	/**
	 * @param {Shell} shell
	 */
	constructor( shell ) {
		super( shell.id, shell.connections, shell.dispatcher, shell.db, shell.peers.bind( shell ), shell.options );
	}
}


/**
 * Generates another unique local address for use with generating a shell or
 * node.
 *
 * Addresses are bound to localhost IP 127.0.0.1 using port in range of 10000 to
 * 59999. Range is used progressively and starts from the beginning whenever
 * it's exhausted.
 *
 * @returns {string}
 */
function generateAddress() {
	if ( ++nextPort > 59999 ) {
		nextPort = 10000;
	}

	return '/ip4/127.0.0.1/tcp/' + String( nextPort );
}

/**
 * Creates instance of shell and manages its lifetime in combination with
 * provided processor.
 *
 * Provided processor is invoked after having started shell/node. It might use
 * the shell/node. On calling additionally provided callback `finished` this
 * function is stopping node implicitly prior to invoking `done` callback.
 *
 * If `processor` is omitted the shell is passed as first argument on calling
 * `done` callback. The provided shell has been started then but must be stopped
 * explicitly.
 *
 * @param {?function(shell:Shell, finished:function=):?Promise} processor
 * @param {function(error:Error=)|function(shell:Shell)} done
 * @param {object<string,*>} options
 */
function generateShell( processor, done, options = {} ) {
	const shell = Shell( generateAddress(), Object.assign( {}, {
		db: MemDown,
	}, options ) );

	shell.start()
		.then( () => {
			if ( !processor ) {
				done( shell );
			} else if ( processor.length > 1 ) {
				processor( shell, () => {
					shell.stop().then( () => done(), done );
				} );
			} else {
				processor( shell )
					.then( () => {
						shell.stop().then( () => done, done );
					}, error => {
						shell.stop().then( () => done( error ), () => done( error ) );
					} );
			}
		} );
}

/**
 * Generates a node's mock-up to simulate its behaviour.
 *
 * @note Currently, this mock-up is an actual node with slightly extended API.
 *
 * @param {Shell} shell
 * @returns {NodeMockUp}
 */
function generateNode( shell ) {
	return new NodeMockUp( shell );
}

/**
 * Clear mark on having captured some output on stderr.
 */
function resetOutputOnStdError() {
	outputOnStdErr = false;
}

/**
 * Reads mark set on capturing non-whitespace output on stderr.
 *
 * @note Some output is generated after finishing tests, thus you might need to
 *       use separate tests to generate output in first test and detect presence
 *       of output in second test.
 *
 * @return {Boolean}
 */
function hasOutputOnStdError() {
	return Boolean( outputOnStdErr );
}


module.exports = {
	NodeMockUp,
	generateAddress, generateShell, generateNode,
	hasOutputOnStdError, resetOutputOnStdError,
};
