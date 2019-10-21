"use strict";

const { experiment: describe, before, after, it } = exports.lab = require( "lab" ).script();
const { expect } = require( "code" );

const Async = require( "async" );
const MemDown = require( "memdown" );

const Shell = require( "../../" );

describe( "persistence", () => {
	let nodes, leader, leveldown, term, items;
	const nodeAddresses = [
		"/ip4/127.0.0.1/tcp/9490",
		"/ip4/127.0.0.1/tcp/9491",
		"/ip4/127.0.0.1/tcp/9492"
	];

	before( done => {
		nodes = nodeAddresses.map( address => Shell( address, {
			db: MemDown,
			peers: nodeAddresses.filter( addr => addr !== address )
		} ) );
		done();
	} );

	// start nodes and wait for cluster settling
	before( () => Promise.all( nodes.map( node => node.start( true ) ) ) );

	before( done => {
		leader = nodes.find( node => node.is( "leader" ) );
		expect( leader ).to.not.be.undefined();
		leveldown = leader.levelDown();
		term = leader.term;
		done();
	} );

	before( { timeout: 10000 }, done => {
		items = [];
		for ( let i = 0; i < 30; i++ ) {
			items.push( ( "00" + i ).slice( -3 ) );
		}
		Async.each( items, ( item, cb ) => { leveldown.put( item, item, cb ); }, done );
	} );

	before( { timeout: 4000 }, done => Async.each( nodes, ( node, cb ) => node.stop().then( () => cb(), cb ), done ) );

	before( done => {
		// restart nodes
		nodes = nodeAddresses.map( ( address ) =>
			Shell( address, {
				db: MemDown,
				peers: nodeAddresses.filter( addr => addr !== address )
			} ) );
		done();
	} );

	before( () => Promise.all( nodes.map( node => node.start() ) ) );
	after( () => Promise.all( nodes.map( node => node.stop() ) ) );

	it( "retains logs and other metadata", done => {
		const expected = items.map( ( item, index ) => {
			return {
				t: term,
				i: index + 1,
				c: {
					type: "put",
					key: item,
					value: item
				}
			};
		} );

		const currentTerm = leader.node.term;

		expect( typeof currentTerm ).to.equal( "number" );
		expect( currentTerm >= 1 ).to.be.true();
		expect( leader.node.votedFor.toString() ).to.equal( leader.id.toString() );

		nodes.forEach( node => {
			const entries = node.node.log.entries.map( entry => {
				return {
					i: entry.i, t: entry.t, c: {
						type: entry.c.type,
						key: entry.c.key,
						value: entry.c.value
					}
				};
			} );

			expect( entries ).to.equal( expected );
			expect( node.node.term ).to.equal( currentTerm );
		} );
		done();
	} );
} );
