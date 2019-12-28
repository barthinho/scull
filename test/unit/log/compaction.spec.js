"use strict";

const { describe, before, after, it } = require( "mocha" );
require( "should" );

const MemDown = require( "memdown" );

const Shell = require( "../../../" );
const { startCluster, stopCluster, asyncEach } = require( "../tools" );


describe( "log compaction", () => {
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9490",
		"/ip4/127.0.0.1/tcp/9491",
		"/ip4/127.0.0.1/tcp/9492"
	];
	const newNodeAddress = "/ip4/127.0.0.1/tcp/9493";
	let nodes, follower, leader, leveldown;

	before( "start all nodes but one", () => {
		return startCluster( nodeAddresses.concat( newNodeAddress ), [newNodeAddress], { maxLogRetention: 10 } )
			.then( n => { nodes = n; } );
	} );

	before( "check for leader", () => {
		leader = nodes.find( node => node.is( "leader" ) );
		follower = nodes.find( node => node.is( "follower" ) );

		follower.should.not.be.undefined();
		leader.should.not.be.undefined();
		leader.should.not.equal( follower );

		leveldown = leader.levelDown();
	} );

	after( "stop all nodes", () => stopCluster( nodes ) );

	it( "can insert 30 items", function() {
		this.timeout( 10000 );

		const items = new Array( 30 );

		for ( let i = 0; i < 30; i++ ) {
			items[i] = ( "00" + i ).slice( -3 );
		}

		return asyncEach( items, item => new Promise( ( resolve, reject ) => {
			leveldown.put( item, item, error => {
				if ( error ) {
					reject( error );
				} else {
					resolve();
				}
			} );
		} ) );
	} );

	it( "log length was capped", () => {
		leader.node.log.entries.should.have.length( 10 );
	} );

	it( "waits for consensus with all nodes of cluster", function() {
		this.timeout( 5000 );

		return leader.waitFor( nodeAddresses );
	} );

	describe( "adding node after reaching consensus", () => {
		let newNode;

		before( "create another node", () => {
			newNode = nodes.find( n => n.id.id === newNodeAddress );
		} );

		it( "waits for new node to catch up with cluster", function( done ) {
			this.timeout( 5000 );

			newNode.on( "up-to-date", done );
			newNode.start();
		} );

		it( "ensures added node has caught up", done => {
			let nextEntry = 0;

			newNode.db.state.createReadStream()
				.on( "data", entry => {
					entry.key.should.be.equal( ( "00" + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( "end", () => {
					nextEntry.should.be.equal( 30 );
					done();
				} );
		} );

		it( "accepts more entries", function() {
			this.timeout( 10000 );

			leader = nodes.concat( newNode ).find( node => node.is( "leader" ) );
			leveldown = leader.levelDown();

			const items = [];

			for ( let i = 30; i < 60; i++ ) {
				items.push( ( "00" + i ).slice( -3 ) );
			}

			return asyncEach( items, item => new Promise( ( resolve, reject ) => {
				leveldown.put( item, item, error => {
					if ( error ) {
						reject( error );
					} else {
						resolve();
					}
				} );
			} ) );
		} );

		it( "waits for consensus of added node", function() {
			this.timeout( 5000 );

			return leader.waitFor( newNodeAddress );
		} );

		it( "includes consensus on added entries at added node", done => {
			let nextEntry = 0;

			newNode.db.state.createReadStream()
				.on( "data", entry => {
					entry.key.should.be.equal( ( "00" + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( "end", () => {
					nextEntry.should.be.equal( 60 );
					done();
				} );
		} );
	} );
} );
