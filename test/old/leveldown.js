"use strict";

const { experiment: describe, before, after, it } = exports.lab = require( "lab" ).script();
const expect = require( "code" ).expect;

const Async = require( "async" );
const MemDown = require( "memdown" );

const Shell = require( "../../shell" );

describe( "leveldown", () => {
	let nodes, follower, leader, leveldown;
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9390",
		"/ip4/127.0.0.1/tcp/9391",
		"/ip4/127.0.0.1/tcp/9392"
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

		expect( follower ).to.not.be.undefined();
		expect( leader ).to.not.be.undefined();
		expect( leader === follower ).to.not.be.true();

		done();
	} );

	it( "can be created", done => {
		leveldown = leader.levelDown();
		done();
	} );

	it( "can set bunch of keys", done => {
		Async.each(
			[ "a", "b", "c" ],
			( key, cb ) => {
				leveldown.put( `key ${key}`, `value ${key}`, cb );
			},
			done );
	} );

	it( "can get a key", done => {
		Async.each( [ "a", "b", "c" ], ( key, cb ) => {
			leveldown.get( `key ${key}`, ( err, values ) => {
				expect( err ).to.be.null();
				expect( values ).to.equal( `value ${key}` );
				cb();
			} );
		}, done );
	} );

	it( "key is there", done => {
		leveldown.get( "key c", done );
	} );

	it( "can del a key", done => {
		leveldown.del( "key c", done );
	} );

	it( "deleted key is no longer found", done => {
		leveldown.get( "key c", err => {
			expect( err.message ).to.equal( "Key not found in database" );
			done();
		} );
	} );

	it( "accepts batch commands", done => {
		const batch = [
			{ type: "put", key: "key d", value: "value d" },
			{ type: "put", key: "key e", value: "value e" },
			{ type: "del", key: "key b" }
		];
		leveldown.batch( batch, done );
	} );

	it( "batch puts were effective", done => {
		Async.map( [ "key d", "key e" ], leveldown.get.bind( leveldown ),
			( err, results ) => {
				expect( err ).to.be.null();
				expect( results ).to.equal( [ "value d", "value e" ] );
				done();
			} );
	} );

	it( "batch dels were effective", done => {
		leveldown.get( "key b", err => {
			expect( err.message ).to.equal( "Key not found in database" );
			done();
		} );
	} );

	describe( "iterator", () => {
		let iterator;

		it( "can be created", done => {
			iterator = leveldown.iterator( {
				keyAsBuffer: false,
				valueAsBuffer: false
			} );
			done();
		} );

		it( "can iterate through all the keys", done => {
			let stopped = false;
			const expecteds = [
				{ key: "key a", value: "value a" },
				{ key: "key d", value: "value d" },
				{ key: "key e", value: "value e" }
			];
			Async.whilst(
				() => !stopped,
				cb => {
					iterator.next( ( err, key, value ) => {
						if ( !err && !key ) {
							stopped = true;
							return cb();
						}
						expect( err ).to.be.null();
						expect( { key, value } ).to.equal( expecteds.shift() );
						cb( err );
					} );
				},
				err => {
					expect( err ).to.be.null();
					expect( expecteds.length ).to.equal( 0 );
					done();
				}
			);
		} );
	} );
} );
