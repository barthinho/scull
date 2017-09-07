'use strict';

const { experiment: describe, before, beforeEach, afterEach, it } = exports.lab = require( 'lab' ).script();
const { expect } = require( 'code' );

const { generateShell, generateNode } = require( '../lib/utils/mockups' );

const Log = require( '../lib/log' );



describe( 'log controller', () => {
	let shell;
	let log;

	before( done => generateShell( null, s => { shell = s; done(); }, { maxLogRetention: 10 } ) );

	beforeEach( done => {
		log = new Log( generateNode( shell ) );

		done();
	} );

	afterEach( done => log.node.stop().then( () => done(), done ) );


	it( 'can be created w/o custom options', done => {
		expect( log.options.customOption ).not.to.be.true();

		done();
	} );

	it( 'can be created w/ custom options', done => {
		log.node.stop();
		log = new Log( generateNode( shell ), { customOption: true } );

		expect( log.options.customOption ).to.be.true();

		done();
	} );

	it( 'adopts options of associated node', done => {
		expect( log.options.maxLogRetention ).to.be.equal( 10 );

		done();
	} );

	it( 'prefers custom options over those adopted from associated node', done => {
		log.node.stop();
		log = new Log( generateNode( shell ), { maxLogRetention: 5 } );

		expect( log.options.maxLogRetention ).to.be.equal( 5 );

		done();
	} );

	it( 'provides access on contained entries', done => {
		expect( Array.isArray( log.entries ) ).to.be.true();

		done();
	} );

	it( 'does not contain any entry initially', done => {
		expect( log.entries.length ).to.be.equal( 0 );

		done();
	} );

	it( 'exposes internally used but initially unset counters as stats', done => {
		expect( log.stats ).to.be.an.object().and.not.to.be.empty();
		expect( log.stats.lastIndex ).to.be.a.number().and.to.be.equal( 0 );
		expect( log.stats.lastTerm ).to.be.a.number().and.to.be.equal( 0 );
		expect( log.stats.committedIndex ).to.be.a.number().and.to.be.equal( 0 );
		expect( log.stats.lastAppliedIndex ).to.be.a.number().and.to.be.equal( 0 );
		expect( log.stats.lastAppliedTerm ).to.be.a.number().and.to.be.equal( 0 );

		done();
	} );

	it( 'provides method for pushing single entry describing one command', done => {
		expect( log.entries.length ).to.be.equal( 0 );
		log.push( 'myCommand' );
		expect( log.entries.length ).to.be.equal( 1 );

		done();
	} );

	it( 'returns global cluster index of resulting log on pushing', done => {
		const index = log.push( 'myCommand' );
		expect( index ).to.be.number().and.to.be.at.least( 1 );

		done();
	} );

	it( 'links pushed commands with current term of related node', done => {
		expect( log.node.term ).to.be.equal( 0 );
		expect( log.node.incrementTerm.bind( log.node ) ).not.to.throw();
		expect( log.node.term ).to.be.equal( 1 );

		log.push( 'a' );
		log.push( 'b' );
		log.push( 'c' );
		expect( log.node.incrementTerm.bind( log.node ) ).not.to.throw();
		log.push( 'd' );
		log.push( 'e' );

		expect( log.atIndex( 1 ).t ).to.be.equal( 1 );
		expect( log.atIndex( 2 ).t ).to.be.equal( 1 );
		expect( log.atIndex( 3 ).t ).to.be.equal( 1 );
		expect( log.atIndex( 4 ).t ).to.be.equal( 2 );
		expect( log.atIndex( 5 ).t ).to.be.equal( 2 );

		done();
	} );

	it( 'updates log stats on pushing', done => {
		const index = log.push( 'myCommand' );
		expect( log.stats.lastIndex ).to.be.number().and.to.be.equal( index );
		expect( log.stats.firstIndex ).to.be.number().and.to.be.at.least( 1 );

		done();
	} );

	it( 'does not validate provided "command" on pushing', done => {
		expect( log.push.bind( log ) ).not.to.throw();
		expect( log.push.bind( log, null ) ).not.to.throw();
		expect( log.push.bind( log, undefined ) ).not.to.throw();
		expect( log.push.bind( log, false ) ).not.to.throw();
		expect( log.push.bind( log, true ) ).not.to.throw();
		expect( log.push.bind( log, 0 ) ).not.to.throw();
		expect( log.push.bind( log, 1 ) ).not.to.throw();
		expect( log.push.bind( log, '' ) ).not.to.throw();
		expect( log.push.bind( log, 'myCommand' ) ).not.to.throw();
		expect( log.push.bind( log, {} ) ).not.to.throw();
		expect( log.push.bind( log, { my: 'Command' } ) ).not.to.throw();
		expect( log.push.bind( log, [] ) ).not.to.throw();
		expect( log.push.bind( log, ['myCommand'] ) ).not.to.throw();
		expect( log.push.bind( log, function() {} ) ).not.to.throw();
		expect( log.push.bind( log, () => 'myCommand' ) ).not.to.throw();

		done();
	} );

	it( 'wraps any pushed command in a container including cluster index and term of resulting entry', done => {
		log.push( 'myCommand' );

		expect( typeof log.entries[0] ).to.be.equal( 'object' );
		expect( typeof log.entries[0].i ).to.be.equal( 'number' );
		expect( typeof log.entries[0].t ).to.be.equal( 'number' );
		expect( typeof log.entries[0].c ).to.be.equal( 'string' );
		expect( log.entries[0].c ).to.be.equal( 'myCommand' );

		done();
	} );

	it( 'retains latest applied entry and all non-applied entries in memory ignoring limit set by `maxLogRetention` option', done => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		expect( log.entries.length ).to.be.equal( 30 );

		// simulate having applied first 10 entries (still keeping more
		// non-applied entries in log than configured to retain at most)
		let lastApplied = log.atIndex( 10 );
		expect( lastApplied.c ).to.be.equal( '010' );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// changing stats on applied record doesn't compact log ...
		expect( log.entries.length ).to.be.equal( 30 );

		// ... but adjusting log does
		log.push( '031' );
		expect( log.entries.length ).to.be.equal( 22 ); // latest applied entry + 20 non-applied entries pushed above + entry pushed here
		expect( log.atIndex( log.stats.lastAppliedIndex - 1 ) ).to.be.undefined();
		expect( log.atIndex( log.stats.lastAppliedIndex ).c ).to.be.equal( '010' );
		expect( log.atIndex( 10 ) ).not.to.be.undefined();


		// simulate having applied another 15 entries (keeping less non-applied
		// entries in log than configured to retain at most)
		lastApplied = log.atIndex( 25 );
		expect( lastApplied.c ).to.be.equal( '025' );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// adjust log using Log#appendAfter() not appending anything
		log.appendAfter( 31, [] );
		expect( log.entries.length ).to.be.equal( log.options.maxLogRetention );
		// index on last applied hasn't changed
		expect( log.atIndex( log.stats.lastAppliedIndex - 1 ) ).not.to.be.undefined();
		expect( log.atIndex( log.stats.lastAppliedIndex ).c ).to.be.equal( '025' );
		// retained entries are latest pushed to log
		expect( log.atIndex( 10 ) ).to.be.undefined();
		expect( log.atIndex( 31 - log.options.maxLogRetention ) ).to.be.undefined();
		for ( let i = 31 - log.options.maxLogRetention + 1; i <= 31; i++ ) {
			expect( log.atIndex( i ) ).not.to.be.undefined();
		}

		done();
	} );

	it( 'exposes method for compacting log w/o requiring to adjust it', done => {
		expect( log.compact ).to.be.function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		expect( log.entries.length ).to.be.equal( 30 );

		// simulate having applied first 10 entries (still keeping more
		// non-applied entries in log than configured to retain at most)
		let lastApplied = log.atIndex( 10 );
		expect( lastApplied.c ).to.be.equal( '010' );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// changing stats on applied record doesn't compact log ...
		expect( log.entries.length ).to.be.equal( 30 );

		// ... but requesting compaction explicitly does
		expect( log.compact.bind( log ) ).not.to.throw();

		expect( log.entries.length ).to.be.equal( 21 ); // latest applied entry + 20 non-applied entries pushed above
		expect( log.atIndex( log.stats.lastAppliedIndex - 1 ) ).to.be.undefined();
		expect( log.atIndex( log.stats.lastAppliedIndex ).c ).to.be.equal( '010' );
		expect( log.atIndex( 10 ) ).not.to.be.undefined();

		done();
	} );

	it( 'enables fetching single log entry using its global cluster index', done => {
		let a = log.push( 'a' );
		let b = log.push( 'b' );
		let c = log.push( 'c' );

		expect( log.atIndex( a ).c ).to.be.equal( 'a' );
		expect( log.atIndex( b ).c ).to.be.equal( 'b' );
		expect( log.atIndex( c ).c ).to.be.equal( 'c' );

		done();
	} );

	it( 'does not throw on trying to fetch entry at invalid or missing index', done => {
		let a = log.push( 'a' );
		let b = log.push( 'b' );
		let c = log.push( 'c' );

		expect( a ).to.be.equal( 1 );
		expect( b ).to.be.equal( 2 );
		expect( c ).to.be.equal( 3 );

		expect( log.atIndex( -10000 ) ).to.be.undefined();
		expect( log.atIndex( -1 ) ).to.be.undefined();
		expect( log.atIndex( 0 ) ).to.be.undefined();
		expect( log.atIndex( 1 ) ).not.to.be.undefined();
		expect( log.atIndex( 2 ) ).not.to.be.undefined();
		expect( log.atIndex( 3 ) ).not.to.be.undefined();
		expect( log.atIndex( 4 ) ).to.be.undefined();
		expect( log.atIndex( 5 ) ).to.be.undefined();
		expect( log.atIndex( 10000 ) ).to.be.undefined();

		done();
	} );

	it( 'exposes method for appending set of entries to log', done => {
		expect( log.appendAfter ).to.be.function();

		done();
	} );

	it( 'requires provision of set of entries', done => {
		expect( log.appendAfter.bind( log, 0 ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, null ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, undefined ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, false ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, true ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, '' ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, 'entry' ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, () => 'entry' ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, {} ) ).to.throw();

		expect( log.appendAfter.bind( log, 0, [] ) ).not.to.throw();

		done();
	} );

	it( 'requires use of basically valid cluster index for selecting entry to append after', done => {
		expect( log.appendAfter ).to.be.function();

		expect( log.appendAfter.bind( log, -10000000, [] ) ).to.throw();
		expect( log.appendAfter.bind( log, -1, [] ) ).to.throw();
		expect( log.appendAfter.bind( log, 0, [] ) ).not.to.throw();
		expect( log.appendAfter.bind( log, 1, [] ) ).not.to.throw();
		expect( log.appendAfter.bind( log, 2, [] ) ).not.to.throw();
		expect( log.appendAfter.bind( log, 10000000, [] ) ).not.to.throw();

		done();
	} );

	it( 'requires provision of well-formed valid log entries to be appended', done => {
		expect( log.entries.length ).to.be.equal( 0 );
		expect( log.appendAfter.bind( log, 0, ['entry'] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 0 );
		expect( log.appendAfter.bind( log, 0, [{ c: 'entry' }] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 0 );
		expect( log.appendAfter.bind( log, 0, [{
			i: 1,
			t: 1,
			c: 'entry'
		}] ) ).not.to.throw();

		expect( log.entries.length ).to.be.equal( 1 );
		expect( log.appendAfter.bind( log, 1, [{
			i: 0,
			t: 1,
			c: 'entry'
		}] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 1 );
		expect( log.appendAfter.bind( log, 1, [{
			i: 1,
			t: 1,
			c: 'entry'
		}] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 1 );
		expect( log.appendAfter.bind( log, 1, [{
			i: 3,
			t: 1,
			c: 'entry'
		}] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 1 );
		expect( log.appendAfter.bind( log, 1, [{
			i: 2,
			t: 1,
			c: 'entry'
		}] ) ).not.to.throw();

		expect( log.entries.length ).to.be.equal( 2 );
		expect( log.appendAfter.bind( log, 2, [{
			i: 3,
			t: 0,
			c: 'entry'
		}] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 2 );
		expect( log.appendAfter.bind( log, 2, [{
			i: 3,
			t: 1,
			c: 'entry'
		}] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.appendAfter.bind( log, 2, [{
			i: 3,
			t: 2,
			c: 'entry'
		}] ) ).not.to.throw();

		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.appendAfter.bind( log, 1, [{
			i: 2,
			t: 2,
			c: 'entry'
		}] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 2 );
		expect( log.appendAfter.bind( log, 2, [{
			i: 3,
			t: 1,
			c: 'entry'
		}] ) ).to.throw();
		expect( log.entries.length ).to.be.equal( 2 );
		expect( log.appendAfter.bind( log, 2, [{
			i: 3,
			t: 2,
			c: 'entry'
		}] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 3 );

		done();
	} );

	it( 'properly appends multiple entries in a single call', done => {
		log.push( 'a' );
		log.push( 'b' );
		log.push( 'c' );

		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.stats.firstIndex ).to.be.equal( 1 );
		expect( log.stats.lastIndex ).to.be.equal( 3 );

		expect( log.appendAfter.bind( log, 1, [
			{ i: 2, t: 1, c: 'd' },
			{ i: 2, t: 1, c: 'e' },
			{ i: 2, t: 1, c: 'f' },
			{ i: 2, t: 1, c: 'g' },
		] ) ).to.throw();

		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.appendAfter.bind( log, 1, [
			{ i: 1, t: 1, c: 'd' },
			{ i: 2, t: 1, c: 'e' },
			{ i: 3, t: 1, c: 'f' },
			{ i: 4, t: 1, c: 'g' },
		] ) ).to.throw();

		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.appendAfter.bind( log, 1, [
			{ i: 3, t: 1, c: 'd' },
			{ i: 4, t: 1, c: 'e' },
			{ i: 5, t: 1, c: 'f' },
			{ i: 6, t: 1, c: 'g' },
		] ) ).to.throw();

		expect( log.entries.length ).to.be.equal( 3 );
		expect( log.appendAfter.bind( log, 1, [
			{ i: 2, t: 1, c: 'd' },
			{ i: 3, t: 1, c: 'e' },
			{ i: 4, t: 1, c: 'f' },
			{ i: 5, t: 1, c: 'g' },
		] ) ).not.to.throw();

		expect( log.entries.length ).to.be.equal( 5 );
		expect( log.stats.firstIndex ).to.be.equal( 1 );
		expect( log.stats.lastIndex ).to.be.equal( 5 );

		expect( log.atIndex( 5 ).c ).to.be.equal( 'g' );

		done();
	} );

	it( 'supports appending entries before first entry thus replacing whole log', done => {
		expect( log.appendAfter.bind( log, 0, [] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 0 );

		expect( log.appendAfter.bind( log, 0, [{ i:1, t:1, c:"a" }] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 1 );

		expect( log.appendAfter.bind( log, 0, [{ i:1, t:1, c:"b" }] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 1 );

		done();
	} );

	it( 'rejects to replace applied entries using Log#appendAfter()', done => {
		expect( log.appendAfter.bind( log, 0, [{ i:1, t:1, c:"a" }] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 1 );

		log.stats.lastAppliedIndex = 1;
		log.stats.lastAppliedTerm = 1;

		expect( log.appendAfter.bind( log, 0, [{ i:1, t:1, c:"b" }] ) ).to.throw();

		expect( log.appendAfter.bind( log, 1, [{ i:2, t:1, c:"c" }] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 2 );

		expect( log.appendAfter.bind( log, 1, [{ i:2, t:1, c:"d" }] ) ).not.to.throw();
		expect( log.entries.length ).to.be.equal( 2 );

		log.stats.lastAppliedIndex = 2;
		log.stats.lastAppliedTerm = 1;

		expect( log.appendAfter.bind( log, 0, [{ i:1, t:1, c:"e" }] ) ).to.throw();

		done();
	} );

	it( 'exposes method for marking last applied entry of log with entry selected its cluster index', done => {
		expect( log.markAppliedAtIndex ).to.be.function();

		expect( log.stats.lastAppliedIndex ).to.be.equal( 0 );
		expect( log.stats.lastAppliedTerm ).to.be.equal( 0 );

		expect( log.markAppliedAtIndex.bind( log ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, null ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, undefined ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, false ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, true ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, [] ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, [true] ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, {} ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, {index:1} ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, 0 ) ).to.throw();
		expect( log.markAppliedAtIndex.bind( log, -1 ) ).to.throw();

		expect( log.markAppliedAtIndex.bind( log, 1 ) ).to.throw();
		log.push( "a" );
		expect( log.markAppliedAtIndex.bind( log, 1 ) ).not.to.throw();

		expect( log.stats.lastAppliedIndex ).to.be.equal( 1 );
		expect( log.stats.lastAppliedTerm ).to.be.equal( 0 );   // due to related node haven't set term, yet, as it didn't participate in any election

		done();
	} );

	it( 'exposes method for marking provided entry to be last applied one of log', done => {
		expect( log.markApplied ).to.be.function();

		expect( log.stats.lastAppliedIndex ).to.be.equal( 0 );
		expect( log.stats.lastAppliedTerm ).to.be.equal( 0 );

		expect( log.markApplied.bind( log ) ).to.throw();
		expect( log.markApplied.bind( log, null ) ).to.throw();
		expect( log.markApplied.bind( log, undefined ) ).to.throw();
		expect( log.markApplied.bind( log, false ) ).to.throw();
		expect( log.markApplied.bind( log, true ) ).to.throw();
		expect( log.markApplied.bind( log, [] ) ).to.throw();
		expect( log.markApplied.bind( log, [true] ) ).to.throw();
		expect( log.markApplied.bind( log, {} ) ).to.throw();
		expect( log.markApplied.bind( log, {index:1} ) ).to.throw();
		expect( log.markApplied.bind( log, 0 ) ).to.throw();
		expect( log.markApplied.bind( log, -1 ) ).to.throw();
		expect( log.markApplied.bind( log, 1 ) ).to.throw();

		expect( log.markApplied.bind( log, {i:1, t:1, c:"a"} ) ).to.throw();    // for entry's index out of range
		log.push( "a" );
		expect( log.markApplied.bind( log, {i:1, t:1, c:"a"} ) ).not.to.throw();

		expect( log.stats.lastAppliedIndex ).to.be.equal( 1 );
		expect( log.stats.lastAppliedTerm ).to.be.equal( 1 );

		done();
	} );

	it( 'exposes method for finding index of last _retained_ entry related to some selected term', done => {
		expect( log.lastIndexForTerm ).to.be.function();

		const firstTerm = log.node.term;
		const secondTerm = log.node.incrementTerm();

		log.push( 'a' );
		log.push( 'b' );
		const lastOfSecond = log.push( 'c' );

		const thirdTerm = log.node.incrementTerm();

		log.push( 'd' );
		log.push( 'e' );
		const lastOfThird = log.push( 'f' );

		const fourthTerm = log.node.incrementTerm();

		expect( log.lastIndexForTerm( firstTerm ) ).to.be.undefined();
		expect( log.lastIndexForTerm( secondTerm ) ).to.be.equal( lastOfSecond );
		expect( log.lastIndexForTerm( thirdTerm ) ).to.be.equal( lastOfThird );
		expect( log.lastIndexForTerm( fourthTerm ) ).to.be.undefined();


		// simulate application of all log entries pushed before (to enable log
		// compaction)
		let lastEntry = log.atIndex( lastOfThird );
		log.stats.lastAppliedIndex = lastEntry.i;
		log.stats.lastAppliedTerm = lastEntry.t;

		// push more entries
		log.push( 'g' );
		log.push( 'h' );
		log.push( 'i' );
		log.push( 'j' );
		log.push( 'k' );    // pushed 11th entry (expected to trigger log compaction)
		log.push( 'l' );
		log.push( 'm' );    // pushed 13th entry (thus compaction has dropped last entry of second term)

		expect( log.options.maxLogRetention ).to.be.equal( 10 );

		expect( log.lastIndexForTerm( secondTerm ) ).not.to.be.equal( lastOfSecond ).and.to.be.undefined();

		done();
	} );

	it( 'exposes method for extracting all _retained_ entries starting from a given cluster index', done => {
		expect( log.entriesFrom ).to.be.function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		let excerpt = log.entriesFrom( 11 );
		expect( excerpt ).to.be.array().and.to.have.length( 20 );

		done();
	} );

	it( 'supports limiting number of entries extracted from log', done => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		let excerpt = log.entriesFrom( 11, 10 );
		expect( excerpt ).to.be.array().and.to.have.length( 10 );

		excerpt = log.entriesFrom( 21, 10 );
		expect( excerpt ).to.be.array().and.to.have.length( 10 );

		excerpt = log.entriesFrom( 21 + 1, 10 );
		expect( excerpt ).to.be.array().and.to.have.length( 10 - 1 );

		done();
	} );

	it( 'requires entries to be retained in memory for extracting', done => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		log.markAppliedAtIndex( 15 );
		log.compact();

		let excerpt = log.entriesFrom( 11 );
		expect( excerpt ).to.be.null();

		done();
	} );

	it( 'exposes method for extracting all _retained_ entries in range of two given cluster indices', done => {
		expect( log.entriesFromTo ).to.be.function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		let excerpt = log.entriesFromTo( 11, 20 );
		expect( excerpt ).to.be.array().and.to.have.length( 10 );

		done();
	} );

	it( 'extracts empty set of entries on providing indices in wrong order', done => {
		expect( log.entriesFromTo ).to.be.function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		let excerpt = log.entriesFromTo( 20, 11 );
		expect( excerpt ).to.be.array().and.to.have.length( 0 );

		done();
	} );

	it( 'requires all entries to be retained in memory for extracting', done => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( '00' + i ).slice( -3 ) );
		}

		log.markAppliedAtIndex( 15 );
		log.compact();

		let excerpt = log.entriesFromTo( 11, 20 );
		expect( excerpt ).to.be.array().and.to.have.length( 0 );

		done();
	} );
} );
