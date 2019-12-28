"use strict";

const { describe, before, beforeEach, after, afterEach, it } = require( "mocha" );
const Should = require( "should" );

const { generateShell, generateNode } = require( "./utilities/mockups" );

const Log = require( "../../lib/log" );



describe( "log controller", () => {
	let shell;
	let log;

	before( () => generateShell( { maxLogRetention: 10 } ).then( s => { shell = s; } ) );

	beforeEach( () => {
		log = new Log( generateNode( shell ) );
	} );

	afterEach( () => log.node.stop() );

	after( () => shell.stop() );


	it( "can be created w/o custom options", () => {
		Should( log.options.customOption ).be.undefined();
	} );

	it( "can be created w/ custom options", () => {
		log.node.stop();
		log = new Log( generateNode( shell ), { customOption: true } );

		log.options.customOption.should.be.true();
	} );

	it( "adopts options of associated node", () => {
		shell.options.maxLogRetention.should.be.equal( 10 );
		shell.node.options.maxLogRetention.should.be.equal( 10 );
		log.options.maxLogRetention.should.be.equal( 10 );
	} );

	it( "prefers custom options over those adopted from associated node", () => {
		log.node.stop();
		log = new Log( generateNode( shell ), { maxLogRetention: 5 } );

		log.options.maxLogRetention.should.be.equal( 5 );
	} );

	it( "provides access on contained entries", () => {
		log.entries.should.be.Array();
	} );

	it( "does not contain any entry initially", () => {
		log.entries.should.have.length( 0 );
	} );

	it( "exposes internally used but initially unset counters as stats", () => {
		log.stats.should.be.Object().which.is.not.empty();
		log.stats.lastIndex.should.be.a.Number().and.equal( 0 );
		log.stats.lastTerm.should.be.a.Number().and.equal( 0 );
		log.stats.committedIndex.should.be.a.Number().and.equal( 0 );
		log.stats.lastAppliedIndex.should.be.a.Number().and.equal( 0 );
		log.stats.lastAppliedTerm.should.be.a.Number().and.equal( 0 );
	} );

	it( "provides method for pushing single entry describing one command", () => {
		log.entries.should.have.length( 0 );
		log.push( "myCommand" );
		log.entries.should.have.length( 1 );
	} );

	it( "returns global cluster index of resulting log on pushing", () => {
		const index = log.push( "myCommand" );

		index.should.be.Number().which.is.greaterThanOrEqual( 1 );
	} );

	it( "links pushed commands with current term of related node", () => {
		log.node.term.should.be.equal( 0 );
		( () => log.node.incrementTerm() ).should.not.throw();
		log.node.term.should.be.equal( 1 );

		log.push( "a" );
		log.push( "b" );
		log.push( "c" );
		( () => log.node.incrementTerm() ).should.not.throw();
		log.push( "d" );
		log.push( "e" );

		log.atIndex( 1 ).t.should.be.equal( 1 );
		log.atIndex( 2 ).t.should.be.equal( 1 );
		log.atIndex( 3 ).t.should.be.equal( 1 );
		log.atIndex( 4 ).t.should.be.equal( 2 );
		log.atIndex( 5 ).t.should.be.equal( 2 );
	} );

	it( "updates log stats on pushing", () => {
		const index = log.push( "myCommand" );

		log.stats.lastIndex.should.be.Number().which.is.equal( index );
		log.stats.firstIndex.should.be.Number().which.is.greaterThanOrEqual( 1 );
	} );

	it( "does not validate provided \"command\" on pushing", () => {
		( () => log.push() ).should.not.throw();
		( () => log.push( null ) ).should.not.throw();
		( () => log.push( undefined ) ).should.not.throw();
		( () => log.push( false ) ).should.not.throw();
		( () => log.push( true ) ).should.not.throw();
		( () => log.push( 0 ) ).should.not.throw();
		( () => log.push( 1 ) ).should.not.throw();
		( () => log.push( "" ) ).should.not.throw();
		( () => log.push( "myCommand" ) ).should.not.throw();
		( () => log.push( {} ) ).should.not.throw();
		( () => log.push( { my: "Command" } ) ).should.not.throw();
		( () => log.push( [] ) ).should.not.throw();
		( () => log.push( ["myCommand"] ) ).should.not.throw();
		( () => log.push( function() {} ) ).should.not.throw();
		( () => log.push( () => "myCommand" ) ).should.not.throw();
	} );

	it( "wraps any pushed command in a container including cluster index and term of resulting entry", () => {
		log.push( "myCommand" );

		log.entries[0].should.be.Object();
		log.entries[0].i.should.be.Number();
		log.entries[0].t.should.be.Number();
		log.entries[0].c.should.be.String();

		log.entries[0].c.should.be.equal( "myCommand" );
	} );

	it( "retains latest applied entry and all non-applied entries in memory ignoring limit set by `maxLogRetention` option", () => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		log.entries.should.have.length( 30 );

		// simulate having applied first 10 entries (still keeping more
		// non-applied entries in log than configured to retain at most)
		let lastApplied = log.atIndex( 10 );
		lastApplied.c.should.be.equal( "010" );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// changing stats on applied record doesn't compact log ...
		log.entries.should.have.length( 30 );

		// ... but adjusting log does
		log.push( "031" );
		log.entries.should.have.length( 22 ); // latest applied entry + 20 non-applied entries pushed above + entry pushed here
		Should( log.atIndex( log.stats.lastAppliedIndex - 1 ) ).be.undefined();
		log.atIndex( log.stats.lastAppliedIndex ).c.should.be.equal( "010" );
		log.atIndex( 10 ).should.not.be.undefined();


		// simulate having applied another 15 entries (keeping less non-applied
		// entries in log than configured to retain at most)
		lastApplied = log.atIndex( 25 );
		lastApplied.c.should.be.equal( "025" );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// adjust log using Log#appendAfter() not appending anything
		log.appendAfter( 31, [] );
		log.entries.should.have.length( log.options.maxLogRetention );
		// index on last applied hasn't changed
		log.atIndex( log.stats.lastAppliedIndex - 1 ).should.not.be.undefined();
		log.atIndex( log.stats.lastAppliedIndex ).c.should.be.equal( "025" );
		// retained entries are latest pushed to log
		Should( log.atIndex( 10 ) ).be.undefined();
		Should( log.atIndex( 31 - log.options.maxLogRetention ) ).be.undefined();
		for ( let i = 31 - log.options.maxLogRetention + 1; i <= 31; i++ ) {
			log.atIndex( i ).should.not.be.undefined();
		}
	} );

	it( "exposes method for compacting log w/o requiring to adjust it", () => {
		log.compact.should.be.Function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		log.entries.should.have.length( 30 );

		// simulate having applied first 10 entries (still keeping more
		// non-applied entries in log than configured to retain at most)
		const lastApplied = log.atIndex( 10 );
		lastApplied.c.should.be.equal( "010" );
		log.stats.lastAppliedIndex = lastApplied.i;
		log.stats.lastAppliedTerm = lastApplied.t;

		// changing stats on applied record doesn't compact log ...
		log.entries.should.have.length( 30 );

		// ... but requesting compaction explicitly does
		( () => log.compact() ).should.not.throw();

		log.entries.should.have.length( 21 ); // latest applied entry + 20 non-applied entries pushed above
		Should( log.atIndex( log.stats.lastAppliedIndex - 1 ) ).be.undefined();
		log.atIndex( log.stats.lastAppliedIndex ).c.should.be.equal( "010" );
		log.atIndex( 10 ).should.not.be.undefined();
	} );

	it( "enables fetching single log entry using its global cluster index", () => {
		const a = log.push( "a" );
		const b = log.push( "b" );
		const c = log.push( "c" );

		log.atIndex( a ).c.should.be.equal( "a" );
		log.atIndex( b ).c.should.be.equal( "b" );
		log.atIndex( c ).c.should.be.equal( "c" );
	} );

	it( "does not throw on trying to fetch entry at invalid or missing index", () => {
		const a = log.push( "a" );
		const b = log.push( "b" );
		const c = log.push( "c" );

		a.should.be.equal( 1 );
		b.should.be.equal( 2 );
		c.should.be.equal( 3 );

		Should( log.atIndex( -10000 ) ).be.undefined();
		Should( log.atIndex( -1 ) ).be.undefined();
		Should( log.atIndex( 0 ) ).be.undefined();
		log.atIndex( 1 ).should.not.be.undefined();
		log.atIndex( 2 ).should.not.be.undefined();
		log.atIndex( 3 ).should.not.be.undefined();
		Should( log.atIndex( 4 ) ).be.undefined();
		Should( log.atIndex( 5 ) ).be.undefined();
		Should( log.atIndex( 10000 ) ).be.undefined();
	} );

	it( "exposes method for appending set of entries to log", () => {
		log.appendAfter.should.be.Function();
	} );

	it( "requires provision of set of entries", () => {
		( () => log.appendAfter( 0 ) ).should.throw();
		( () => log.appendAfter( 0, null ) ).should.throw();
		( () => log.appendAfter( 0, undefined ) ).should.throw();
		( () => log.appendAfter( 0, false ) ).should.throw();
		( () => log.appendAfter( 0, true ) ).should.throw();
		( () => log.appendAfter( 0, "" ) ).should.throw();
		( () => log.appendAfter( 0, "entry" ) ).should.throw();
		( () => log.appendAfter( 0, () => "entry" ) ).should.throw();
		( () => log.appendAfter( 0, {} ) ).should.throw();

		( () => log.appendAfter( 0, [] ) ).should.not.throw();
	} );

	it( "requires use of basically valid cluster index for selecting entry to append after", () => {
		( () => log.appendAfter( -10000000, [] ) ).should.throw();
		( () => log.appendAfter( -1, [] ) ).should.throw();
		( () => log.appendAfter( 0, [] ) ).should.not.throw();
		( () => log.appendAfter( 1, [] ) ).should.not.throw();
		( () => log.appendAfter( 2, [] ) ).should.not.throw();
		( () => log.appendAfter( 10000000, [] ) ).should.not.throw();
	} );

	it( "requires provision of well-formed valid log entries to be appended", () => {
		// requires basically all properties
		log.entries.should.have.length( 0 );
		( () => log.appendAfter( 0, ["entry"] ) ).should.throw();
		log.entries.should.have.length( 0 );
		( () => log.appendAfter( 0, [{ c: "entry" }] ) ).should.throw();
		log.entries.should.have.length( 0 );
		( () => log.appendAfter( 0, [{
			i: 1,
			t: 1,
			c: "entry"
		}] ) ).should.not.throw();

		// index property must be correct
		log.entries.should.have.length( 1 );
		( () => log.appendAfter( 1, [{
			i: 0,
			t: 1,
			c: "entry"
		}] ) ).should.throw();
		log.entries.should.have.length( 1 );
		( () => log.appendAfter( 1, [{
			i: 1,
			t: 1,
			c: "entry"
		}] ) ).should.throw();
		log.entries.should.have.length( 1 );
		( () => log.appendAfter( 1, [{
			i: 3,
			t: 1,
			c: "entry"
		}] ) ).should.throw();
		log.entries.should.have.length( 1 );
		( () => log.appendAfter( 1, [{
			i: 2,
			t: 1,
			c: "entry"
		}] ) ).should.not.throw();

		// term property must be correct
		log.entries.should.have.length( 2 );
		( () => log.appendAfter( 2, [{
			i: 3,
			t: 0,
			c: "entry"
		}] ) ).should.throw();
		log.entries.should.have.length( 2 );
		( () => log.appendAfter( 2, [{
			i: 3,
			t: 1,
			c: "entry"
		}] ) ).should.not.throw();
		log.entries.should.have.length( 3 );
		( () => log.appendAfter( 2, [{
			i: 3,
			t: 2,
			c: "entry"
		}] ) ).should.not.throw();

		// term property may increase from entry to entry, only, truncating log
		// at insertion point if required and possible
		log.entries.should.have.length( 3 );
		( () => log.appendAfter( 1, [{
			i: 2,
			t: 2,
			c: "entry"
		}] ) ).should.not.throw();
		log.entries.should.have.length( 2 );
		( () => log.appendAfter( 2, [{
			i: 3,
			t: 1,
			c: "entry"
		}] ) ).should.throw();
		log.entries.should.have.length( 2 );
		( () => log.appendAfter( 2, [{
			i: 3,
			t: 2,
			c: "entry"
		}] ) ).should.not.throw();
		log.entries.should.have.length( 3 );
	} );

	it( "properly appends multiple entries in a single call", () => {
		log.push( "a" );
		log.push( "b" );
		log.push( "c" );

		log.entries.length.should.be.equal( 3 );
		log.stats.firstIndex.should.be.equal( 1 );
		log.stats.lastIndex.should.be.equal( 3 );

		( () => log.appendAfter( 1, [
			{ i: 2, t: 1, c: "d" },
			{ i: 2, t: 1, c: "e" },
			{ i: 2, t: 1, c: "f" },
			{ i: 2, t: 1, c: "g" }
		] ) ).should.throw();

		log.entries.should.have.length( 3 );
		( () => log.appendAfter( 1, [
			{ i: 1, t: 1, c: "d" },
			{ i: 2, t: 1, c: "e" },
			{ i: 3, t: 1, c: "f" },
			{ i: 4, t: 1, c: "g" }
		] ) ).should.throw();

		log.entries.should.have.length( 3 );
		( () => log.appendAfter( 1, [
			{ i: 3, t: 1, c: "d" },
			{ i: 4, t: 1, c: "e" },
			{ i: 5, t: 1, c: "f" },
			{ i: 6, t: 1, c: "g" }
		] ) ).should.throw();

		log.entries.should.have.length( 3 );
		( () => log.appendAfter( 1, [
			{ i: 2, t: 1, c: "d" },
			{ i: 3, t: 1, c: "e" },
			{ i: 4, t: 1, c: "f" },
			{ i: 5, t: 1, c: "g" }
		] ) ).should.not.throw();

		log.entries.length.should.be.equal( 5 );
		log.stats.firstIndex.should.be.equal( 1 );
		log.stats.lastIndex.should.be.equal( 5 );

		log.atIndex( 5 ).c.should.be.equal( "g" );
	} );

	it( "supports appending entries before first entry thus replacing whole log", () => {
		( () => log.appendAfter( 0, [] ) ).should.not.throw();
		log.entries.should.have.length( 0 );

		( () => log.appendAfter( 0, [{ i: 1, t: 1, c: "a" }] ) ).should.not.throw();
		log.entries.should.have.length( 1 );

		( () => log.appendAfter( 0, [{ i: 1, t: 1, c: "b" }] ) ).should.not.throw();
		log.entries.should.have.length( 1 );
	} );

	it( "rejects to replace applied entries using Log#appendAfter()", () => {
		( () => log.appendAfter( 0, [{ i: 1, t: 1, c: "a" }] ) ).should.not.throw();
		log.entries.should.have.length( 1 );

		log.stats.lastAppliedIndex = 1;
		log.stats.lastAppliedTerm = 1;

		( () => log.appendAfter( 0, [{ i: 1, t: 1, c: "b" }] ) ).should.throw();
		log.entries.should.have.length( 1 );

		( () => log.appendAfter( 1, [{ i: 2, t: 1, c: "c" }] ) ).should.not.throw();
		log.entries.should.have.length( 2 );

		( () => log.appendAfter( 1, [{ i: 2, t: 1, c: "d" }] ) ).should.not.throw();
		log.entries.should.have.length( 2 );

		log.stats.lastAppliedIndex = 2;
		log.stats.lastAppliedTerm = 1;

		( () => log.appendAfter( 0, [{ i: 1, t: 1, c: "e" }] ) ).should.throw();
	} );

	it( "exposes method for marking last applied entry of log with entry selected its cluster index", () => {
		log.markAppliedAtIndex.should.be.Function();

		log.stats.lastAppliedIndex.should.be.equal( 0 );
		log.stats.lastAppliedTerm.should.be.equal( 0 );

		( () => log.markAppliedAtIndex() ).should.throw();
		( () => log.markAppliedAtIndex( null ) ).should.throw();
		( () => log.markAppliedAtIndex( undefined ) ).should.throw();
		( () => log.markAppliedAtIndex( false ) ).should.throw();
		( () => log.markAppliedAtIndex( true ) ).should.throw();
		( () => log.markAppliedAtIndex( [] ) ).should.throw();
		( () => log.markAppliedAtIndex( [true] ) ).should.throw();
		( () => log.markAppliedAtIndex( {} ) ).should.throw();
		( () => log.markAppliedAtIndex( { index: 1 } ) ).should.throw();
		( () => log.markAppliedAtIndex( 0 ) ).should.throw();
		( () => log.markAppliedAtIndex( -1 ) ).should.throw();

		( () => log.markAppliedAtIndex( 1 ) ).should.throw();
		log.push( "a" );
		( () => log.markAppliedAtIndex( 1 ) ).should.not.throw();

		log.stats.lastAppliedIndex.should.be.equal( 1 );
		log.stats.lastAppliedTerm.should.be.equal( 0 );   // due to related node haven't set term, yet, as it didn't participate in any election
	} );

	it( "exposes method for marking provided entry to be last applied one of log", () => {
		log.markApplied.should.be.Function();

		log.stats.lastAppliedIndex.should.be.equal( 0 );
		log.stats.lastAppliedTerm.should.be.equal( 0 );

		( () => log.markApplied() ).should.throw();
		( () => log.markApplied( null ) ).should.throw();
		( () => log.markApplied( undefined ) ).should.throw();
		( () => log.markApplied( false ) ).should.throw();
		( () => log.markApplied( true ) ).should.throw();
		( () => log.markApplied( [] ) ).should.throw();
		( () => log.markApplied( [true] ) ).should.throw();
		( () => log.markApplied( {} ) ).should.throw();
		( () => log.markApplied( { index: 1 } ) ).should.throw();
		( () => log.markApplied( 0 ) ).should.throw();
		( () => log.markApplied( -1 ) ).should.throw();
		( () => log.markApplied( 1 ) ).should.throw();

		( () => log.markApplied( { i: 1, t: 1, c: "a" } ) ).should.throw();    // for entry's index out of range
		log.push( "a" );
		( () => log.markApplied( { i: 1, t: 1, c: "a" } ) ).should.not.throw();

		log.stats.lastAppliedIndex.should.be.equal( 1 );
		log.stats.lastAppliedTerm.should.be.equal( 1 );
	} );

	it( "exposes method for finding index of last _retained_ entry related to some selected term", () => {
		log.lastIndexForTerm.should.be.Function();

		const firstTerm = log.node.term;
		const secondTerm = log.node.incrementTerm();

		log.push( "a" );
		log.push( "b" );
		const lastOfSecond = log.push( "c" );

		const thirdTerm = log.node.incrementTerm();

		log.push( "d" );
		log.push( "e" );
		const lastOfThird = log.push( "f" );

		const fourthTerm = log.node.incrementTerm();

		Should( log.lastIndexForTerm( firstTerm ) ).be.undefined();
		log.lastIndexForTerm( secondTerm ).should.be.equal( lastOfSecond );
		log.lastIndexForTerm( thirdTerm ).should.be.equal( lastOfThird );
		Should( log.lastIndexForTerm( fourthTerm ) ).be.undefined();


		// simulate application of all log entries pushed before (to enable log
		// compaction)
		const lastEntry = log.atIndex( lastOfThird );
		log.stats.lastAppliedIndex = lastEntry.i;
		log.stats.lastAppliedTerm = lastEntry.t;

		// push more entries
		log.push( "g" );
		log.push( "h" );
		log.push( "i" );
		log.push( "j" );
		log.push( "k" );    // pushed 11th entry (expected to trigger log compaction)
		log.push( "l" );
		log.push( "m" );    // pushed 13th entry (thus compaction has dropped last entry of second term)

		log.options.maxLogRetention.should.be.equal( 10 );

		Should( log.lastIndexForTerm( secondTerm ) ).be.undefined().and.not.equal( lastOfSecond );
	} );

	it( "exposes method for extracting all _retained_ entries starting from a given cluster index", () => {
		log.entriesFrom.should.be.Function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		const excerpt = log.entriesFrom( 11 );

		excerpt.should.be.Array().which.has.length( 20 );
	} );

	it( "supports limiting number of entries extracted from log", () => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		let excerpt = log.entriesFrom( 11, 10 );
		excerpt.should.be.Array().which.has.length( 10 );

		excerpt = log.entriesFrom( 21, 10 );
		excerpt.should.be.Array().which.has.length( 10 );

		excerpt = log.entriesFrom( 21 + 1, 10 );
		excerpt.should.be.Array().which.has.length( 10 - 1 );
	} );

	it( "requires entries to be retained in memory for extracting", () => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		log.markAppliedAtIndex( 15 );
		log.compact();

		const excerpt = log.entriesFrom( 11 );

		Should( excerpt ).be.null();
	} );

	it( "exposes method for extracting all _retained_ entries in range of two given cluster indices", () => {
		log.entriesFromTo.should.be.Function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		const excerpt = log.entriesFromTo( 11, 20 );

		excerpt.should.be.Array().which.has.length( 10 );
	} );

	it( "extracts empty set of entries on providing indices in wrong order", () => {
		log.entriesFromTo.should.be.Function();

		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		const excerpt = log.entriesFromTo( 20, 11 );

		excerpt.should.be.Array().which.has.length( 0 );
	} );

	it( "requires all entries to be retained in memory for extracting", () => {
		for ( let i = 1; i <= 30; i++ ) {
			log.push( ( "00" + i ).slice( -3 ) );
		}

		log.markAppliedAtIndex( 15 );
		log.compact();

		const excerpt = log.entriesFromTo( 11, 20 );

		excerpt.should.be.Array().which.has.length( 0 );
	} );
} );
