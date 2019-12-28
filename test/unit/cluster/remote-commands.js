"use strict";

const { experiment: describe, before, after, it } = exports.lab = require( "lab" ).script();
const { expect } = require( "code" );

const Async = require( "async" );
const MemDown = require( "memdown" );

const Shell = require( "../../" );

describe( "remote commands", () => {
	let nodes, followers, leader;
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9700",
		"/ip4/127.0.0.1/tcp/9701",
		"/ip4/127.0.0.1/tcp/9702"
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
	before( () => Promise.all( nodes.map( node => node.start( true ) ) ) );
	after( () => Promise.all( nodes.map( node => node.stop() ) ) );

	before( done => {
		leader = nodes.find( node => node.is( "leader" ) );
		followers = nodes.filter( node => !node.is( "leader" ) );
		expect( followers.length ).to.equal( 2 );
		expect( leader ).to.not.be.undefined();
		done();
	} );

	it( "follower accepts command", done => {
		const commands = new Array( 20 );
		for ( let i = 0; i < 20; i++ ) {
			commands[i] = {
				type: "put",
				key: ( "00" + i ).slice( -3 ),
				value: i
			};
		}

		Async.eachSeries( commands, ( command, cb ) => {
			followers[command.value % followers.length].command( command )
				.then( () => cb(), cb );
		}, done );
	} );

	it( "can query from followers", done => {
		const db = followers[0].levelUp();
		let next = 0;
		db.createReadStream()
			.on( "data", entry => {
				expect( entry.key ).to.equal( ( "00" + next ).slice( -3 ) );
				expect( entry.value ).to.equal( next );
				next++;
			} )
			.once( "end", () => {
				expect( next ).to.equal( 20 );
				done();
			} );
	} );

	it( "can query one value from follower", done => {
		const db = followers[0].levelUp();
		db.get( "019", ( err, value ) => {
			expect( err ).to.be.null();
			expect( value ).to.equal( 19 );
			done();
		} );
	} );

	it( "can query from leader", done => {
		expect( leader.is( "leader" ) ).to.equal( true );
		const db = leader.levelUp();
		let next = 0;
		db.createReadStream()
			.on( "data", entry => {
				expect( entry.key ).to.equal( ( "00" + next ).slice( -3 ) );
				expect( entry.value ).to.equal( next );
				next++;
			} )
			.once( "end", () => {
				expect( next ).to.equal( 20 );
				done();
			} );
	} );
} );
