"use strict";

const { experiment: describe, before, after, it } = exports.lab = require( "lab" ).script();
const expect = require( "code" ).expect;

const MemDown = require( "memdown" );

const Shell = require( "../../shell" );

describe( "log replication", () => {
	let nodes, follower, leader;

	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9190",
		"/ip4/127.0.0.1/tcp/9191",
		"/ip4/127.0.0.1/tcp/9192"
	];

	before( done => {
		nodes = nodeAddresses.map( address =>
			Shell( address, {
				db: MemDown,
				peers: nodeAddresses.filter( addr => addr !== address )
			} ) );
		done();
	} );

	// start nodes and wait for cluster settling
	before( () => Promise.all( nodes.map( n => n.start( true ) ) ) );
	after( () => Promise.all( nodes.map( n => n.stop() ) ) );

	before( done => {
		leader = nodes.find( node => node.is( "leader" ) );
		follower = nodes.find( node => node.is( "follower" ) );

		expect( follower ).not.to.be.undefined();
		expect( leader ).not.to.be.undefined();
		expect( leader === follower ).to.be.false();

		done();
	} );

	it( "leader accepts `put` command", () => {
		return leader.command( { type: "put", key: "a", value: "1" } );
	} );

	it( "leader accepts `get` command", () => {
		return leader.command( { type: "get", key: "a" } )
			.then( result => {
				expect( result ).to.equal( "1" );
			} );
	} );
} );
