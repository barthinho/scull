'use strict';

const { experiment: describe, before, after, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const Async = require( 'async' );
const MemDown = require( 'memdown' );

const Shell = require( '../' );

describe( 'log compaction', () => {
	let nodes, follower, leader, leveldown;
	const nodeAddresses = [
		'/ip4/127.0.0.1/tcp/9490',
		'/ip4/127.0.0.1/tcp/9491',
		'/ip4/127.0.0.1/tcp/9492'
	];
	const newNodeAddress = '/ip4/127.0.0.1/tcp/9493';

	before( done => {
		nodes = nodeAddresses.map( ( address ) =>
			Shell( address, {
				db: MemDown,
				maxLogRetention: 10,
				peers: nodeAddresses.filter( addr => addr !== address ).concat( newNodeAddress )
			} ) );
		done();
	} );

	// start nodes and wait for cluster settling
	before( () => Promise.all( nodes.map( node => node.start( true ) ) ) );

	before( done => {
		leader = nodes.find( node => node.is( 'leader' ) );
		follower = nodes.find( node => node.is( 'follower' ) );
		expect( follower ).to.not.be.undefined();
		expect( leader ).to.not.be.undefined();
		expect( leader === follower ).to.not.be.true();
		leveldown = leader.levelDown();
		done();
	} );

	it( 'can insert 30 items', { timeout: 10000 }, done => {
		const items = new Array( 30 );
		for ( let i = 0; i < 30; i++ ) {
			items[i] = ( '00' + i ).slice( -3 );
		}

		Async.each( items, ( item, cb ) => leveldown.put( item, item, cb ), done );
	} );

	it( 'log length was capped', done => {
		expect( leader.logEntries().length ).to.equal( 10 );
		done();
	} );

	it( 'waits for consensus with all nodes of cluster', { timeout: 5000 }, done => {
		leader.waitFor( nodeAddresses ).then( () => done(), done );
	} );

	describe( 'adding node after reaching consensus', () => {
		let newNode;

		before( done => {
			newNode = Shell( newNodeAddress, {
				db: MemDown,
				maxLogRetention: 10,
				peers: nodeAddresses
			} );
			done();
		} );

		after( done => Async.each( nodes.concat( newNode ), ( node, cb ) => node.stop().then( () => cb(), cb ), done ) );

		it( 'waits for new node to catch up with cluster', { timeout: 5000 }, done => {
			newNode.on( 'up-to-date', done );
			newNode.start();
		} );

		it( 'ensures added node has caught up', done => {
			let nextEntry = 0;
			newNode.db.state.createReadStream()
				.on( 'data', ( entry ) => {
					expect( entry.key ).to.equal( ( '00' + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( 'end', () => {
					expect( nextEntry ).to.equal( 30 );
					done();
				} );
		} );

		it( 'accepts more entries', { timeout: 10000 }, done => {
			leader = nodes.concat( newNode ).find( node => node.is( 'leader' ) );
			leveldown = leader.levelDown();

			const items = [];
			for ( let i = 30; i < 60; i++ ) {
				items.push( ( '00' + i ).slice( -3 ) );
			}

			Async.each( items, ( item, cb ) => leveldown.put( item, item, cb ), done );
		} );

		it( 'waits for consensus of added node', { timeout: 5000 }, () => {
			return leader.waitFor( newNodeAddress );
		} );

		it( 'includes consensus on added entries at added node', done => {
			let nextEntry = 0;
			newNode.db.state.createReadStream()
				.on( 'data', ( entry ) => {
					expect( entry.key ).to.equal( ( '00' + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( 'end', () => {
					expect( nextEntry ).to.equal( 60 );
					done();
				} );
		} );
	} );
} );
