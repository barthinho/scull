"use strict";

const MemDown = require( "memdown" );

const Shell = require( "../../" );
const Node = require( "../../lib/node" );

let nextPort = 9999;
let outputOnStdErr = false;

/**
 * Enable monitoring of stderr output.
 */
const _originalWriter = process.stderr.write;
process.stderr.write = function( chunk ) {
	if ( chunk instanceof Buffer ) {
		chunk = chunk.toString( "utf8" );
	}

	if ( typeof chunk !== "string" ) {
		chunk = String( chunk );
	}

	outputOnStdErr |= chunk.trim().length > 0;

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
		super( shell.id, shell.db, shell.options );
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

	return "/ip4/127.0.0.1/tcp/" + String( nextPort );
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
 * @param {object<string,*>} options
 * @returns {Promise<(Shell|*)>} promises generated shell or result of processing it
 */
function generateShell( processor, options = {} ) {
	const _options = typeof processor === "function" ? options : processor;

	const shell = new Shell( generateAddress(), Object.assign( {}, {
		db: MemDown(),
	}, _options ) );

	return shell.start()
		.then( () => {
			if ( typeof processor !== "function" ) {
				return shell;
			}

			if ( processor.length > 1 ) {
				return new Promise( ( resolve, reject ) => {
					processor( shell, ( error, result ) => {
						shell.stop()
							.catch( error => console.error( "stopping node failed:", error ) )
							.then( () => {
								if ( error ) {
									reject( error )
								} else {
									resolve( result );
								}
							} );
					} );
				} );
			}

			return processor( shell )
				.finally( () => {
					return shell.stop()
						.catch( error => console.error( "stopping node failed:", error ) );
				} );
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

/**
 * Starts cluster of nodes waiting for its first leader election.
 *
 * @param {string[]} peers lists multiaddr-formatted addresses of nodes to start
 * @param {string[]} dontStart lists peers' addresses not to be started initially
 * @param {object} options custom options to use on every created node of cluster
 * @returns {Promise<Node[]>} promises all nodes (with some/all of them started)
 */
function startCluster( peers, dontStart = [], options = {} ) {
	const nodes = peers.map( address => new Shell( address, Object.assign( {
		db: MemDown(),
		peers: peers.filter( addr => addr !== address )
	}, options ) ) );

	return Promise.all( nodes.map( node => {
		if ( dontStart.findIndex( id => id === node.id.id ) < 0 ) {
			return node.start( true )
		}
	} ) )
		.then( () => nodes );
}

/**
 * Stops all provided nodes.
 *
 * @param {Array<Node>} nodes list of previously started nodes
 * @returns {Promise} promises nodes stopped
 */
function stopCluster( nodes ) {
	return Promise.all( nodes.map( node => node.stop() ) );
}

/**
 * Picks current leader and some follower from provided nodes of a cluster.
 *
 * @param {Node[]} nodes nodes of a cluster
 * @returns {{leader: Node, follower: Node}} leader and one follower of cluster of nodes
 */
function getLeaderAndFollower( nodes ) {
	const leader = nodes.find( node => node.is( "leader" ) );
	const follower = nodes.find( node => node.is( "follower" ) );

	follower.should.not.be.undefined();
	leader.should.not.be.undefined();
	leader.should.not.equal( follower );

	return { leader, follower };
}

/**
 * Asynchronously iterates over provided collection invoking callback on every
 * item.
 *
 * @param {Array} items collection of items
 * @param {function(item:*, index:Number, items:Array):*} cb callback invoked per item
 * @returns {Promise} promises iterated collection
 */
function asyncEach( items, cb ) {
	return new Promise( ( resolve, reject ) => {
		const write = ( current, stopAt ) => {
			if ( current >= stopAt ) {
				resolve( items );
			} else {
				Promise.resolve( cb( items[current], current, items ) )
					.then( () => process.nextTick( write, current + 1, stopAt ) )
					.catch( reject );
			}
		};

		write( 0, items.length );
	} );
}


module.exports = {
	NodeMockUp,
	generateAddress, generateShell, generateNode,
	startCluster, stopCluster, getLeaderAndFollower,
	hasOutputOnStdError, resetOutputOnStdError,
	asyncEach,
};
