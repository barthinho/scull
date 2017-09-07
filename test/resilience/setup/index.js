'use strict';

const Async = require( 'async' );
const Path = require( 'path' );
const Rimraf = require( 'rimraf' );
const Mkdirp = require( 'mkdirp' );

const Shell = require( './node' );

const defaultOptions = {
	persist: false,
	chaos: true,
	nodeCount: 3,
	killerIntervalMS: 10000
};

function Setup( _options ) {
	let killer, liveNodes;
	const deadNodes = [];
	const allAddresses = [];
	const options = Object.assign( {}, defaultOptions, _options );
	const maxDeadNodes = Math.ceil( options.nodeCount / 2 ) - 1;
	const dataPath = Path.join( __dirname, '..', 'resilience', 'data' );

	let killing = true;

	return { before, after, addresses: allAddresses };

	function before( done ) {
		Async.series( [setupDirs, createNodes, startNodes, startKiller], done );
	}

	function after( done ) {
		Async.series( [stopKiller, stopNodes], done );
	}

	function setupDirs( done ) {
		Rimraf.sync( dataPath );
		Mkdirp.sync( dataPath );
		done();
	}

	function createNodes( done ) {
		const ports = [];
		for ( let i = 0; i < options.nodeCount; i++ ) {
			ports.push( 5300 + i * 2 );
		}

		ports.map( portToAddress ).forEach( address => allAddresses.push( address ) );

		liveNodes = ports.map( port => new Shell( port, {
			peers: ports.filter( p => p !== port ).map( portToAddress ),
			persist: options.persist
		} ) );

		done();
	}

	function startNodes( done ) {
		Promise.all( liveNodes.map( n => n.start() ) ).then( () => done(), done );
	}

	function startKiller( done ) {
		if ( options.chaos ) {
			killer = setTimeout( () => {
				killAndRevive( err => {
					if ( err ) {
						throw err;
					} else {
						startKiller();
					}
				} );
			}, options.killerIntervalMS );
		}

		if ( done ) {
			done();
		}
	}

	function killAndRevive( cb ) {
		if ( deadNodes.length >= maxDeadNodes ) {
			killing = false;
		} else if ( !deadNodes.length ) {
			killing = true;
		}
		if ( killing ) {
			killOne( cb );
		} else {
			reviveOne( cb );
		}
	}

	function killOne( cb ) {
		const node = popRandomLiveNode();
		console.log( 'killing %s...', node._address );
		deadNodes.push( node._address );
		node.stop().then( () => cb(), cb );
	}

	function reviveOne( cb ) {
		const address = randomDeadNode();
		console.log( 'reviving %s...', address );
		const node = new Shell( address, {
			peers: allAddresses.filter( addr => addr !== address )
		} );
		liveNodes.push( node );
		node.start().then( () => cb(), cb );
	}

	function popRandomLiveNode() {
		const index = Math.floor( Math.random() * liveNodes.length );
		const node = liveNodes[index];
		liveNodes.splice( index, 1 );
		return node;
	}

	function randomDeadNode() {
		const index = Math.floor( Math.random() * deadNodes.length );
		const node = deadNodes[index];
		deadNodes.splice( index, 1 );
		return node;
	}

	function stopKiller( done ) {
		clearInterval( killer );
		done();
	}

	function stopNodes( done ) {
		Async.each( liveNodes, ( node, cb ) => node.stop().then( () => cb(), cb ), done );
	}
}

function portToAddress( port ) {
	return `/ip4/127.0.0.1/tcp/${port}`;
}

module.exports = Setup;
