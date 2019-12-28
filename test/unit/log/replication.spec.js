"use strict";

const { describe, before, after, it } = require( "mocha" );
require( "should" );

const MemDown = require( "memdown" );

const Shell = require( "../../../" );
const { startCluster, stopCluster } = require( "../tools" );

describe( "log replication", () => {
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9190",
		"/ip4/127.0.0.1/tcp/9191",
		"/ip4/127.0.0.1/tcp/9192"
	];
	let nodes, follower, leader;

	before( "start cluster", () => startCluster( nodeAddresses ).then( n => { nodes = n; } ) );
	after( "stop cluster", () => stopCluster( nodes ) );

	before( "check for leader", () => {
		leader = nodes.find( node => node.is( "leader" ) );
		follower = nodes.find( node => node.is( "follower" ) );

		follower.should.not.be.undefined();
		leader.should.not.be.undefined();
		leader.should.should.not.equal( follower );
	} );


	it( "leader accepts `put` command", () => {
		return leader.command( new Shell.Commands.Put( "a", "1" ) );
	} );

	it( "leader accepts `get` command", () => {
		return leader.command( new Shell.Commands.Get( "a" ) )
			.then( result => {
				result.should.be.equal( "1" );
			} );
	} );
} );
