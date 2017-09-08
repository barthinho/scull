'use strict';

const { experiment: describe, before, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const MemDown = require( 'memdown' );

const Shell = require( '../' );

describe( 'election', () => {
	let singleNode, singleMultiNodes, multiMultiNodes;

	const singleNodeAddress = '/ip4/127.0.0.1/tcp/9089';

	const singleMultiNodeAdresses = [
		'/ip4/127.0.0.1/tcp/9090',
		'/ip4/127.0.0.1/tcp/9091',
		'/ip4/127.0.0.1/tcp/9092'
	];

	const multiMultiNodeAdresses = [
		'/ip4/127.0.0.1/tcp/9093',
		'/ip4/127.0.0.1/tcp/9094',
		'/ip4/127.0.0.1/tcp/9095'
	];

	before( done => {
		singleNode = Shell( singleNodeAddress, {
			db: MemDown,
			peers: []
		} );

		singleMultiNodes = singleMultiNodeAdresses.map( address => Shell( address, {
			db: MemDown,
			peers: singleMultiNodeAdresses
		} ) );

		multiMultiNodes = multiMultiNodeAdresses.map( address => Shell( address, {
			db: MemDown,
			peers: multiMultiNodeAdresses
		} ) );

		done();
	} );

	it( 'starts single-node cluster', () => singleNode.start() );

	it( 'waits for end of election in single-node cluster', done => singleNode.once( 'elected', () => done() ) );

	it( 'selects single node in single-node cluster to be leader', done => {
		expect( singleNode.is( 'leader' ) ).to.be.true();

		done();
	} );

	it( 'stops single-node cluster', () => singleNode.stop() );


	it( 'starts single-node of multi-node cluster', () => singleMultiNodes[0].start() );

	it( 'fails to pass election w/ single node in multi-node cluster lacking further nodes available', { timeout: 2000 }, done => {
		singleMultiNodes[0].once( 'elected', () => done( new Error( 'got elected unexpectedly' ) ) );
		setTimeout( done, 1500 );
	} );

	it( 'did NOT select single node in multi-node cluster to be leader', done => {
		expect( singleMultiNodes[0].is( 'leader' ) ).to.be.false();

		done();
	} );

	it( 'stops single node in multi-node cluster', () => singleMultiNodes[0].stop() );


	it( 'starts multi-node cluster waiting for them to pass election', () => Promise.all( multiMultiNodes.map( node => node.start( true ) ) ) );

	it( 'selected one of the nodes in multi-node cluster to be leader', done => {
		let leader = multiMultiNodes.find( node => node.is( 'leader' ) );
		let followers = multiMultiNodes.filter( node => node.is( 'follower' ) );

		expect( leader ).not.to.be.undefined();
		expect( followers.length ).to.equal( 2 );
		expect( followers.indexOf( leader ) ).to.equal( -1 );

		done();
	} );

	it( 'stops multi-node cluster', () => Promise.all( multiMultiNodes.map( node => node.stop() ) ) );

} );
