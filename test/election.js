'use strict';

const { experiment: describe, before, after, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const Async = require( 'async' );
const MemDown = require( 'memdown' );

const Shell = require( '../' );

describe( 'election', () => {
	let nodes, followers, leader;

	const nodeAddresses = [
		'/ip4/127.0.0.1/tcp/9090',
		'/ip4/127.0.0.1/tcp/9091',
		'/ip4/127.0.0.1/tcp/9092'
	];

	before( done => {
		nodes = nodeAddresses.map( address => Shell( address, {
			db: MemDown,
			peers: nodeAddresses
		} ) );
		done();
	} );

	before( () => Promise.all( nodes.map( node => node.start() ) ) );
	after( () => Promise.all( nodes.map( node => node.stop() ) ) );

	it( 'waits for end of election', { timeout: 5000 }, done => {
		Async.each( nodes, ( node, cb ) => node.once( 'elected', () => cb() ), done );
	} );

	it( 'one of the nodes was elected leader', done => {
		leader = nodes.find( node => node.is( 'leader' ) );
		followers = nodes.filter( node => node.is( 'follower' ) );

		expect( followers.length ).to.equal( 2 );
		expect( leader ).to.not.be.undefined();
		expect( followers.indexOf( leader ) ).to.equal( -1 );

		done();
	} );

} );
