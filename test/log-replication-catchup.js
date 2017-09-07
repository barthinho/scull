'use strict';

const { experiment: describe, before, after, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const MemDown = require( 'memdown' );

const Shell = require( '../' );

describe( 'log replication catchup', () => {
	let nodes, follower, leader, newNode;

	const nodeAddresses = [
		'/ip4/127.0.0.1/tcp/9290',
		'/ip4/127.0.0.1/tcp/9291',
		'/ip4/127.0.0.1/tcp/9292'
	];

	const newAddress = '/ip4/127.0.0.1/tcp/9293';

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
		leader = nodes.find( node => node.is( 'leader' ) );
		follower = nodes.find( node => node.is( 'follower' ) );
		expect( follower ).to.not.be.undefined();
		expect( leader ).to.not.be.undefined();
		expect( leader === follower ).to.not.be.true();
		done();
	} );

	before( () => leader.command( {
		type: 'put',
		key: 'a',
		value: '1'
	} ) );

	before( () => leader.command( {
		type: 'put',
		key: 'b',
		value: '2'
	} ) );

	before( { timeout: 5000 }, () => leader.waitFor( nodeAddresses ) );

	before( done => {
		newNode = Shell( newAddress, {
			db: MemDown,
			peers: nodeAddresses
		} );
		newNode.on( 'warning', err => { throw err; } );
		newNode.start().then( () => done(), done );
	} );

	before( done => {
		leader = nodes.find( node => node.is( 'leader' ) );
		leader.join( newAddress, () => {} );
		newNode.on( 'up-to-date', done );
	} );


	it( 'new node got updated', done => {
		const db = newNode.db.db;

		db.sublevel( 'state' ).get( 'a', ( err, value ) => {
			expect( err ).to.be.null();
			expect( value ).to.equal( '1' );

			db.sublevel( 'state' ).get( 'b', ( err, value ) => {
				expect( err ).to.be.null();
				expect( value ).to.equal( '2' );
				done();
			} );
		} );
	} );
} );
