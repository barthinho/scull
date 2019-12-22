"use strict";

/**
 * Implements common code for setting up and tearing down a set of sub-processes
 * each becoming one node in a local-only cluster exposing API for reading and
 * writing in cluster via HTTP.
 */

const Path = require( "path" );

const { RmDir, MkDir } = require( "file-essentials" );

const HttpServerNode = require( "./http-server/process" );


console.log( `

ABOUT

Chaotic resilience tests starts local-only cluster consisting of multiple nodes
just to have them read and write several values in a shared database for some
time while killing and re-starting its nodes over time. This test is failing
whenever cluster of nodes isn't processing requested read/write operation in
time or when reading some value delivers unexpected result.

IMPORTANT

Errors listed below are fine as long as the test runner keeps running for those
errors are mostly due to the killing of nodes, only, and thus intended behaviour
in context of chaotic resilience tests.

` );


const defaultOptions = {
	persist: false,
	chaos: true,
	nodeCount: 3,
	killerIntervalMS: 10000
};

module.exports = function Setup( _options ) {
	let killer, liveNodes, active;

	const deadNodeAdresses = [];
	const allAddresses = [];
	const options = Object.assign( {}, defaultOptions, _options );
	const maxDeadNodes = Math.ceil( options.nodeCount / 2 ) - 1;
	const dataPath = Path.resolve( __dirname, "..", "data" );

	let killing = true;
	let logger = null;

	return { before, after, addresses: allAddresses, isLive };


	function timeLogger( minute ) {
		console.log( `time elapsed: ${minute} minute(s)` );

		if ( this.running ) {
			logger = setTimeout( timeLogger, 60000, minute + 1 );
		}
	}


	/**
	 * Sets up a set of nodes constantly killed and revived.
	 *
	 * @returns {Promise} promises map of started nodes after setup finished with all nodes running initiall
	 */
	function before() {
		logger = setTimeout( timeLogger, 60000, 1 );

		return setupDirs()
			.then( () => createAllNodes() )
			.then( () => startAllNodes() )
			.then( () => startKiller() );
	}

	/**
	 * Shuts down set of node kept killed and revived before.
	 *
	 * @returns {Promise} promises network of nodes being shut down properly
	 */
	function after() {
		clearTimeout( logger );

		return stopKiller()
			.then( () => stopAllNodes() );
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
	function createAllNodes() {
		const count = options.nodeCount;
		const ports = new Array( count );

		for ( let i = 0; i < count; i++ ) {
			ports[i] = 5300 + ( i * 2 );
		}

		ports.forEach( port => allAddresses.push( `/ip4/127.0.0.1/tcp/${port}` ) );

		liveNodes = ports.map( ( port, index ) => new HttpServerNode( port, {
			id: allAddresses[index],
			peers: ports.filter( p => p !== port ).map( p => `/ip4/127.0.0.1/tcp/${p}` ),
			persist: options.persist,
		} ) );
	}

	/**
	 * Starts all nodes listed to be live.
	 *
	 * @returns {Promise} promises all nodes started
	 */
	function startAllNodes() {
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
			killer = setTimeout( () => {
				active = killOrRevive()
					.then( () => {
						active = null;
						startKiller();
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
	function killOrRevive() {
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

		const node = liveNodes.splice( Math.floor( Math.random() * liveNodes.length ), 1 )[0];
		const { port, options: { id } } = node;

		console.log( "killing %s...", port ); // eslint-disable-line no-console

		deadNodeAdresses.push( { port, id } );

		return node.stop();
	}

	/**
	 * Picks address of a previously killed node and revives it.
	 *
	 * @returns {Promise} promises picked node started again
	 */
	function reviveOne() {
		const { port, id } = deadNodeAdresses.splice( Math.floor( Math.random() * deadNodeAdresses.length ), 1 )[0];

		console.log( "reviving %s...", port ); // eslint-disable-line no-console

		const node = new HttpServerNode( port, {
			id: id,
			peers: allAddresses.filter( addr => addr !== `/ip4/127.0.0.1/tcp/${port}` ),
			persist: options.persist,
		} );

		liveNodes.push( node );

		return node.start();
	}

	/**
	 * Stops frequent process constantly killing and reviving nodes.
	 *
	 * @returns {Promise} promises killer stopped and any of its tasks finished
	 */
	function stopKiller() {
		clearInterval( killer );

		return active || Promise.resolve();
	}

	/**
	 * Stops all nodes that are currently live.
	 *
	 * @returns {Promise} promises all live nodes stopped
	 */
	function stopAllNodes() {
		return Promise.all( ( liveNodes || [] ).map( node => node.stop() ) );
	}

	/**
	 * Detects if provided endpoint ID/address selects node assumed to be live
	 * currently.
	 *
	 * @param {string} id ID/address of node
	 * @returns {boolean} true unless node has been killed recently
	 */
	function isLive( id ) {
		return liveNodes.some( node => node.options.id === id );
	}
};
