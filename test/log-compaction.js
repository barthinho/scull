'use strict';

const lab = exports.lab = require( 'lab' ).script();
const describe = lab.experiment;
const before = lab.before;
const after = lab.after;
const it = lab.it;
const expect = require( 'code' ).expect;

const async = require( 'async' );
const Memdown = require( 'memdown' );

const Node = require( '../' );

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
			Node( address, {
				db: Memdown,
				minLogRetention: 10,
				peers: nodeAddresses.filter( addr => addr !== address ).concat( newNodeAddress )
			} ) );
		done();
	} );

	// start nodes and wait for cluster settling
	before( done => async.each( nodes, ( node, cb ) => node.start( () => node.once( "elected", cb ) ), done ) );

	before( done => {
		leader = nodes.find( node => node.is( 'leader' ) );
		follower = nodes.find( node => node.is( 'follower' ) );
		expect( follower ).to.not.be.undefined();
		expect( leader ).to.not.be.undefined();
		expect( leader === follower ).to.not.be.true();
		leveldown = leader.leveldown();
		done();
	} );

	it( 'can insert 30 items', { timeout: 10000 }, done => {
		const items = new Array( 30 );
		for ( let i = 0; i < 30; i++ ) {
			items[i] = ( "00" + i ).slice( -3 );
		}

		async.each( items, ( item, cb ) => leveldown.put( item, item, cb ), done );
	} );

	it( 'log length was capped', done => {
		expect( leader.logEntries().length ).to.equal( 10 );
		done();
	} );

	it( 'waits for consensus with all nodes of cluster', { timeout: 5000 }, done => leader.waitFor( nodeAddresses, done ) );

	describe( 'node that is late to the party', () => {
		let newNode;

		before( done => {
			newNode = Node( newNodeAddress, {
				db: Memdown,
				minLogRetention: 10,
				peers: nodeAddresses
			} );
			newNode.start( done );
		} );

		after( done => {
			async.each( nodes.concat( newNode ), ( node, cb ) => node.stop( cb ), done );
		} );

		it( 'waits for consensus of late node', { timeout: 5000 }, done => nodes.find( node => node.is( "leader" ) ).waitFor( newNode.id, done ) );

		it( 'catches up', done => {
			let nextEntry = 0;
			newNode._db.state.createReadStream()
				.on( 'data', ( entry ) => {
					expect( entry.key ).to.equal( ( "00" + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( 'end', () => {
					expect( nextEntry ).to.equal( 30 );
					done();
				} );
		} );

		it( 'accepts more entries', { timeout: 10000 }, done => {
			leader = nodes.concat( newNode ).find( node => node.is( 'leader' ) );
			leveldown = leader.leveldown();

			const items = [];
			for ( let i = 30; i < 60; i++ ) {
				items.push( ( "00" + i ).slice( -3 ) );
			}
			async.each( items, ( item, cb ) => {
					leveldown.put( item, item, cb );
				},
				done );
		} );

		it( 'waits for consensus of late node', { timeout: 5000 }, done => nodes.find( node => node.is( "leader" ) ).waitFor( newNode.id, done ) );

		it( 'new node catches up', done => {
			let nextEntry = 0;
			newNode._db.state.createReadStream()
				.on( 'data', ( entry ) => {
					expect( entry.key ).to.equal( ( "00" + nextEntry ).slice( -3 ) );
					nextEntry++;
				} )
				.once( 'end', () => {
					expect( nextEntry ).to.equal( 60 );
					done();
				} );
		} );
	} );
} );
