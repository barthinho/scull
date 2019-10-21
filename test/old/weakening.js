"use strict";

const { experiment: describe, before, after, it } = exports.lab = require( "lab" ).script();
const { expect } = require( "code" );

const MemDown = require( "memdown" );

const Shell = require( "../../" );

describe( "log replication", () => {
	let nodes, followers, leader, preferred, weakened;
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9710",
		"/ip4/127.0.0.1/tcp/9711",
		"/ip4/127.0.0.1/tcp/9712"
	];

	before( done => {
		nodes = nodeAddresses.map( ( address ) =>
			Shell( address, {
				db: MemDown,
				peers: nodeAddresses.filter( addr => addr !== address )
			} ) );
		done();
	} );

	// start nodes and wait for cluster settling
	before( () => Promise.all( nodes.map( node => node.start( true ) ) ) );
	after( () => Promise.all( nodes.map( node => node.stop() ) ) );

	before( done => {
		leader = nodes.find( node => node.is( "leader" ) );
		followers = nodes.filter( node => node.is( "follower" ) );
		expect( followers.length ).to.equal( 2 );
		expect( leader ).to.not.be.undefined();
		done();
	} );

	it( "can weaken all the nodes except the preferred", done => {
		preferred = followers[0];
		weakened = followers.filter( f => f !== preferred ).concat( leader );
		weakened.forEach( w => w.weaken( 1100 ) );
		done();
	} );

	it( "settles again", { timeout: 5000 }, done => preferred.once( "elected", () => done() ) );

	it( "resulted in electing the preferred", done => {
		expect( preferred.is( "leader" ) ).to.be.true();
		expect( weakened.every( w => w.is( "follower" ) ) ).to.be.true();
		done();
	} );
} );
