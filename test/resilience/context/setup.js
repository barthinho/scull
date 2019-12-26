"use strict";

/**
 * Implements common code for setting up and tearing down a set of sub-processes
 * each becoming one node in a local-only cluster exposing API for reading and
 * writing in cluster via HTTP.
 */

const Path = require( "path" );

const { RmDir, MkDir } = require( "file-essentials" );

const HttpServerNode = require( "./http-server/process" );
const LogServer = require( "./log-server" );



const defaultOptions = {
	chaos: true,
	persist: false,
	nodeCount: 3,
	killerIntervalMS: 10000
};


const logServer = LogServer.get();

module.exports = function Setup( _options ) {
	let killer, liveNodes, active;

	const deadNodeAdresses = [];
	const allAddresses = [];
	const options = Object.assign( {}, defaultOptions, _options );
	const maxDeadNodes = Math.ceil( options.nodeCount / 2 ) - 1;
	const dataPath = Path.resolve( __dirname, "..", "data" );

	let killing = true;
	let chaos = false;
	let logger = null;

	return { before, after, addresses: allAddresses, isLive, LogServer, stopChaos };


	function timeLogger( minute ) {
		LogServer.log( `time elapsed: ${minute} minute(s)` );
		if ( typeof _options.onTimeElapsed === "function" ) {
			_options.onTimeElapsed( minute );
		}

		logger = setTimeout( timeLogger, 60000, minute + 1 );
	}


	/**
	 * Sets up a set of nodes constantly killed and revived.
	 *
	 * @returns {Promise} promises map of started nodes after setup finished with all nodes running initiall
	 */
	function before() {
		this.timeout( 10000 );

		logger = setTimeout( timeLogger, 60000, 1 );

		return LogServer.get().socket
			.then( () => setupDirs() )
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
			.then( () => stopAllNodes() )
			.then( () => LogServer.drop() );
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
	 * Revives all currently dead nodes and prevents further killing of nodes.
	 *
	 * @returns {Promise} promises all currently dead nodes revived
	 */
	function stopChaos() {
		chaos = false;

		if ( deadNodeAdresses.length > 0 ) {
			LogServer.log( "reviving all nodes" );
		}

		return new Promise( ( resolve, reject ) => {
			recoverNode();

			function recoverNode() {
				if ( deadNodeAdresses.length > 0 ) {
					reviveOne().then( () => process.nextTick( recoverNode ) ).catch( reject );
				} else {
					resolve();
				}
			}
		} );
	}

	/**
	 * Starts repeated process continuously killing randomly selected nodes in
	 * cluster prior to reviving them.
	 *
	 * @returns {void}
	 */
	function startKiller() {
		if ( options.chaos ) {
			chaos = true;

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
		if ( !chaos ) {
			return Promise.resolve();
		}

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

		LogServer.log( "killing %s...", port );

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

		LogServer.log( "reviving %s...", port );

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
	 * @param {PeerAddress} endpoint description of node to test
	 * @returns {boolean} true unless node has been killed recently
	 */
	function isLive( endpoint) {
		return liveNodes.some( node => node.options.id === endpoint.rawAddress );
	}
};
