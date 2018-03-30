"use strict";

/**
 * Implements common code for setting up and tearing down a set of sub-processes
 * each becoming one node in a local-only cluster exposing API for reading and
 * writing in cluster via HTTP.
 */

const Path = require( "path" );

const PromiseUtils = require( "promise-essentials" );
const { RmDir, MkDir } = require( "file-essentials" );

const HttpServerNode = require( "./http-server/process" );


const defaultOptions = {
	persist: false,
	chaos: true,
	nodeCount: 3,
	killerIntervalMS: 10000
};

module.exports = function Setup( _options ) {
	let killer, liveNodes;

	const deadNodeAdresses = [];
	const allAddresses = [];
	const options = Object.assign( {}, defaultOptions, _options );
	const maxDeadNodes = Math.ceil( options.nodeCount / 2 ) - 1;
	const dataPath = Path.resolve( __dirname, "..", "data" );

	let killing = true;

	return { before, after, addresses: allAddresses };


	/**
	 * Sets up a set of nodes constantly killed and revived.
	 *
	 * @returns {Promise} promises setup finished with all nodes initially running
	 */
	function before() {
		return setupDirs()
			.then( () => createNodes() )
			.then( () => startNodes() )
			.then( () => startKiller() );
	}

	/**
	 * Shuts down set of node kept killed and revived before.
	 *
	 * @returns {Promise} promises network of nodes being shut down properly
	 */
	function after() {
		stopKiller();

		return stopNodes();
	}

	/**
	 * Prepares some data folder clearing its content if existing.
	 *
	 * @returns {Promise} promises data folder to be available and empty
	 */
	function setupDirs() {
		return RmDir( dataPath, { subsOnly: true } )
			.then( () => MkDir( dataPath ) );
	}

	/**
	 * Creates list of all nodes considered live initially.
	 *
	 * @return {void}
	 */
	function createNodes() {
		const count = options.nodeCount;
		const ports = new Array( count );

		for ( let i = 0; i < count; i++ ) {
			ports[i] = 5300 + ( i * 2 );
		}

		ports.forEach( port => allAddresses.push( `/ip4/127.0.0.1/tcp/${port}` ) );

		liveNodes = ports.map( port => new HttpServerNode( port, {
			peers: ports.filter( p => p !== port ).map( p => `/ip4/127.0.0.1/tcp/${p}` ),
			persist: options.persist,
		} ) );
	}

	/**
	 * Starts all nodes listed to be live.
	 *
	 * @returns {Promise} promises all nodes started
	 */
	function startNodes() {
		return Promise.all( liveNodes.map( n => n.start() ) );
	}

	/**
	 * Starts repeated process continuously killing randomly selected nodes in
	 * cluster prior to reviving them.
	 *
	 * @returns {void}
	 */
	function startKiller() {
		if ( options.chaos ) {
			killer = setInterval( () => {
				killAndRevive( err => {
					if ( err ) {
						throw err;
					} else {
						startKiller();
					}
				} );
			}, options.killerIntervalMS );
		}
	}

	/**
	 * Kills or revives another node depending on current mode.
	 *
	 * Current mode is switched on reaching certain limits. Nodes are killed
	 * until some defined maximum number of nodes is dead. After that all nodes
	 * are revived again prior to start killing again.
	 *
	 * @returns {Promise} promises another node being killed or revived
	 */
	function killAndRevive() {
		if ( deadNodeAdresses.length >= maxDeadNodes ) {
			killing = false;
		} else if ( !deadNodeAdresses.length ) {
			killing = true;
		}

		if ( killing && !liveNodes.length ) {
			killing = false;
		}

		return killing ? killOne() : reviveOne();
	}

	/**
	 * Picks live node and kills tracking its address in a separate list.
	 *
	 * @return {Promise} promises picked node stopped
	 */
	function killOne() {
		if ( !liveNodes.length ) {
			return Promise.reject( new Error( "unexpected request for killing node" ) );
		}

		const node = popRandomLiveNode();
		const { port } = node;

		console.log( "killing %s...", port ); // eslint-disable-line no-console

		deadNodeAdresses.push( port );

		return node.stop();
	}

	/**
	 * Picks address of a previously killed node and revives it.
	 *
	 * @returns {Promise} promises picked node started again
	 */
	function reviveOne() {
		const address = popRandomDeadNode();

		console.log( "reviving %s...", address ); // eslint-disable-line no-console

		const node = new HttpServerNode( address, {
			peers: allAddresses.filter( addr => addr !== address ),
			persist: options.persist,
		} );

		liveNodes.push( node );

		return node.start();
	}

	/**
	 * Randomly selects live node and pops it off the list.
	 *
	 * @returns {*} selected node popped off the list of live nodes
	 */
	function popRandomLiveNode() {
		return liveNodes.splice( Math.floor( Math.random() * liveNodes.length ), 1 )[0];
	}

	/**
	 * Randomly selects address of a currently dead node and pops it off the
	 * list.
	 *
	 * @returns {*} selected node popped off the list of dead nodes
	 */
	function popRandomDeadNode() {
		return deadNodeAdresses.splice( Math.floor( Math.random() * deadNodeAdresses.length ), 1 )[0];
	}

	/**
	 * Stops frequent process constantly killing and reviving nodes.
	 *
	 * @returns {void}
	 */
	function stopKiller() {
		clearInterval( killer );
	}

	/**
	 * Stops all nodes that are currently live.
	 *
	 * @returns {Promise<HttpServerNode[]>} promises all live nodes stopped
	 */
	function stopNodes() {
		return PromiseUtils.each( liveNodes || [], node => node.stop() );
	}
};
