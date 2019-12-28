"use strict";

const { describe, before, after, it } = require( "mocha" );
const Should = require( "should" );

const MemDown = require( "memdown" );

const Shell = require( "../../../" );
const { startCluster, stopCluster, getLeaderAndFollower } = require( "../tools" );

describe( "log replication catchup", () => {
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9290",
		"/ip4/127.0.0.1/tcp/9291",
		"/ip4/127.0.0.1/tcp/9292"
	];
	const newAddress = "/ip4/127.0.0.1/tcp/9293";
	let nodes, follower, leader, newNode;

	before( "start cluster", () => startCluster( nodeAddresses ).then( n => { nodes = n; } ) );
	after( "stop cluster", () => stopCluster( nodes ) );

	before( () => {
		( { leader, follower } = getLeaderAndFollower( nodes ) );
	} );

	before( () => leader.command( new Shell.Commands.Put( "a", "1" ) ) );
	before( () => leader.command( new Shell.Commands.Put( "b", "2" ) ) );

	before( function() {
		this.timeout( 5000 );
		return leader.waitFor( nodeAddresses );
	} );

	before( () => {
		newNode = new Shell( newAddress, {
			db: MemDown(),
			peers: nodeAddresses
		} );

		return new Promise( ( resolve, reject ) => {
			newNode.on( "warning", reject );
			newNode.start().then( resolve ).catch( reject );
		} );
	} );

	before( done => {
		leader = nodes.find( node => node.is( "leader" ) );

		leader.join( newAddress );
		newNode.on( "up-to-date", done );
	} );


	it( "new node got updated", done => {
		const db = newNode.db.db;

		db.sublevel( "state" ).get( "a", ( err, value ) => {
			Should( err ).be.null();
			value.should.be.equal( "1" );

			db.sublevel( "state" ).get( "b", ( err, value ) => {
				Should( err ).be.null();
				value.should.be.equal( "2" );

				done();
			} );
		} );
	} );
} );
