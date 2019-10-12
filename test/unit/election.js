"use strict";

const { suite, test, suiteSetup, suiteTeardown } = require( "mocha" );
require( "should" );
const MemDown = require( "memdown" );

// process.env.DEBUG = "scull.consensus,scull.rpc.traffic";
const Shell = require( "../../shell" );


const singleNodeAddress = "/ip4/127.0.0.1/tcp/9101";

const smallClusterAddresses = [
	"/ip4/127.0.0.1/tcp/9201",
	"/ip4/127.0.0.1/tcp/9202",
	"/ip4/127.0.0.1/tcp/9203",
];

const largeClusterAddresses = [
	"/ip4/127.0.0.1/tcp/9301",
	"/ip4/127.0.0.1/tcp/9302",
	"/ip4/127.0.0.1/tcp/9303",
	"/ip4/127.0.0.1/tcp/9304",
	"/ip4/127.0.0.1/tcp/9305",
	"/ip4/127.0.0.1/tcp/9306",
	"/ip4/127.0.0.1/tcp/9307",
	"/ip4/127.0.0.1/tcp/9308",
	"/ip4/127.0.0.1/tcp/9309",
	"/ip4/127.0.0.1/tcp/9310",
];


suite( "leader election", () => {
	suite( "in a single-node cluster", () => {
		let node;

		suiteSetup( () => {
			node = Shell( singleNodeAddress, {
				db: MemDown(),
				peers: []
			} );
		} );

		test( "that single node can be started", () => node.start() );

		test( "results in `elected`-event emitted on started node", done => node.once( "elected", () => done() ) );

		test( "elects the single node to be leader", () => {
			node.is( "leader" ).should.be.true();
		} );

		suiteTeardown( "stops cluster", () => node.stop() );
	} );

	suite( "in a small multi-node cluster starting just one node", () => {
		let nodes;

		suiteSetup( () => {
			nodes = smallClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: smallClusterAddresses
			} ) );
		} );

		test( "a single node can be started", () => nodes[0].start() );

		test( "fails to pass election thus never emits `elected`-event on started node", function( done ) {
			this.timeout( 5000 );

			const cb = () => done( new Error( "got elected unexpectedly" ) );

			nodes[0].once( "elected", cb );

			setTimeout( () => {
				nodes[0].off( "elected", cb );
				done();
			}, 4000 );
		} );

		test( "didn't elect started node to be leader", () => {
			nodes[0].is( "leader" ).should.be.false();
		} );

		suiteTeardown( "stops cluster", () => {
			return Promise.all( nodes.map( ( node, i ) => i && node.start() ) )
				.then( () => Promise.all( nodes.map( node => node.stop() ) ) );
		} );
	} );

	suite( "in a small multi-node cluster starting all nodes", () => {
		let nodes;

		suiteSetup( () => {
			nodes = smallClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: smallClusterAddresses
			} ) );
		} );

		test( "every node can be started", () => {
			return Promise.all( nodes.map( node => node.start() ) );
		} );

		test( "results in `elected`-event emitted on first started node", done => nodes[0].once( "elected", () => done() ) );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( smallClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );

	suite( "in another small multi-node cluster starting all nodes", () => {
		let nodes;

		suiteSetup( () => {
			nodes = smallClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: smallClusterAddresses
			} ) );
		} );

		test( "every node can be started implicitly waiting for election", () => {
			return Promise.all( nodes.map( node => node.start( true ) ) );
		} );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( smallClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );

	suite( "in yet another small multi-node cluster starting all nodes", function() {
		this.timeout( 20000 );

		let nodes;

		suiteSetup( () => {
			nodes = smallClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: smallClusterAddresses
			} ) );
		} );

		test( "nodes can be started w/ random delay within 10s waiting for election implicitly", () => {
			return Promise.all( nodes.map( node => new Promise( ( resolve, reject ) => {
				setTimeout( () => {
					node.start( true ).then( resolve ).catch( reject );
				}, Math.random() * 10000 );
			} ) ) );
		} );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( smallClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );

	suite( "in a large multi-node cluster starting all nodes", () => {
		let nodes;

		suiteSetup( () => {
			nodes = largeClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: largeClusterAddresses
			} ) );
		} );

		test( "every node can be started", () => {
			return Promise.all( nodes.map( node => node.start() ) );
		} );

		test( "results in `elected`-event emitted on first started node", done => nodes[0].once( "elected", () => done() ) );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( largeClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );

	suite( "in another large multi-node cluster starting all nodes", () => {
		let nodes;

		suiteSetup( () => {
			nodes = largeClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: largeClusterAddresses
			} ) );
		} );

		test( "every node can be started implicitly waiting for election", () => {
			return Promise.all( nodes.map( node => node.start( true ) ) );
		} );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( largeClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );

	suite( "in yet another large multi-node cluster starting all nodes", function() {
		this.timeout( 20000 );

		let nodes;

		suiteSetup( () => {
			nodes = largeClusterAddresses.map( address => Shell( address, {
				db: MemDown(),
				peers: largeClusterAddresses
			} ) );
		} );

		test( "nodes can be started w/ random delay within 10s waiting for election implicitly", () => {
			return Promise.all( nodes.map( node => new Promise( ( resolve, reject ) => {
				setTimeout( () => {
					node.start( true ).then( resolve ).catch( reject );
				}, Math.random() * 10000 );
			} ) ) );
		} );

		test( "elected one of the started nodes to be leader", () => {
			const leader = nodes.find( node => node.is( "leader" ) );
			const followers = nodes.filter( node => node.is( "follower" ) );

			leader.should.not.be.undefined();
			followers.length.should.be.equal( largeClusterAddresses.length - 1 );
			followers.indexOf( leader ).should.be.equal( -1 );
		} );

		suiteTeardown( "stops cluster", () => Promise.all( nodes.map( node => node.stop() ) ) );
	} );
} );
