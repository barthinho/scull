"use strict";

const Net = require( "net" );
const { Writable, Duplex, Readable } = require( "stream" );

const { suite, test, suiteSetup, teardown, suiteTeardown } = require( "mocha" );
const Should = require( "should" );
const MsgPack = require( "msgpack5" );
const PromiseUtil = require( "promise-essentials" );

const { TransmittingNetwork, NetworkMessage } = require( "../../../lib/network/index" );
const Address = require( "../../../lib/data/address" );
const Nodes = require( "../../../lib/data/nodes" );


const MY_ADDRESS = "/ip4/127.0.0.1/tcp/8080/what/ever";

const REMOTE_ADDRESSES = [
	"/ip4/127.0.0.1/tcp/8081/what/ever",
	"/ip4/127.0.0.1/tcp/8082/what/ever",
	"/ip4/127.0.0.1/tcp/8083/what/ever",
];


suite( "A transmitting network", () => {
	/**
	 * @type {TransmittingNetwork}
	 */
	let network;

	/**
	 * @type {Server[]}
	 */
	let servers;

	/**
	 * @type {Array<object[]>}
	 */
	const capturedData = REMOTE_ADDRESSES.map( () => [] );

	/**
	 * @type {function(stream:Socket, collector:object[])[]}
	 */
	const processors = REMOTE_ADDRESSES.map( () => 	( stream, collector ) => {
		const msgPack = MsgPack();
		const responder = msgPack.encoder();

		stream.pipe( msgPack.decoder() )
			.on( "data", data => {
				collector.unshift( data );

				if ( data.garbage ) {
					// reply with binary garbage
					stream.write( Buffer.from( [0xc1] ) );
				} else {
					// derive reply w/ properly flipped sender/recipient addresses
					const reply = { isReply: true };

					for ( let names = Object.keys( data ), i = 0, length = names.length; i < length; i++ ) {
						const name = names[i];
						switch ( name ) {
							case "from" :
								reply.to = data.from;
								break;

							case "to" :
								reply.from = data.to;
								break;

							default :
								reply[name] = data[name];
						}
					}

					// respond with reply
					responder.write( reply );
				}
			} );

		responder.pipe( stream );
	} );

	const BAD_ADDRESS_MESSAGES = {
		noSenderOrReceiver: { payload: "data", },
		noSender: { to: REMOTE_ADDRESSES[0], payload: "data", },
		badNamedSender: { src: REMOTE_ADDRESSES[0], to: REMOTE_ADDRESSES[0], payload: "data", },
		invalidSender: { from: true, to: REMOTE_ADDRESSES[0], payload: "data", },
		malformedSender: { from: "127.0.0.1", to: REMOTE_ADDRESSES[0], payload: "data", },
		noReceiver: { from: REMOTE_ADDRESSES[0], payload: "data", },
		badNamedReceiver: { from: REMOTE_ADDRESSES[0], dest: REMOTE_ADDRESSES[0], payload: "data", },
		invalidReceiver: { from: REMOTE_ADDRESSES[0], to: true, payload: "data", },
		malformedReceiver: { from: REMOTE_ADDRESSES[0], to: "127.0.0.1", payload: "data", },
	};

	const GOOD_ADDRESS_MESSAGES = {
		basic: { from: REMOTE_ADDRESSES[0], to: REMOTE_ADDRESSES[0], payload: "data", },
	};


	suiteSetup( "create listening sockets simulating receiving network", () => {
		return PromiseUtil.map( REMOTE_ADDRESSES, ( address, index ) => {
			const server = Net.createServer( stream => {
				processors[index]( stream, capturedData[index] );
			} );

			const connections = [];
			const trackConnection = socket => {
				connections.push( socket );
				socket.once( "close", () => {
					const found = connections.findIndex( i => i === socket );
					if ( found > -1 ) {
						connections.splice( found, 1 );
					}
				} );
			};

			server.on( "connection", trackConnection );
			server.instantlyClose = () => {
				return new Promise( resolve => {
					connections.forEach( socket => {
						socket.setTimeout( 1 );
						socket.end();
					} );

					server.once( "close", resolve );
					server.close();
				} );
			};

			return PromiseUtil.promisify( server.listen, server )( Address( address ).toSocketOptions() )
				.then( () => server );
		} )
			.then( createdServers => ( servers = createdServers ) );
	} );

	suiteSetup( "can be created", () => {
		Should( TransmittingNetwork ).be.ok();

		network = new TransmittingNetwork( MY_ADDRESS );
	} );

	teardown( "drops any previously registered node", () => {
		return PromiseUtil.each( REMOTE_ADDRESSES, address => network.drop( address ) );
	} );

	suiteTeardown( "drops and disconnects all previously registered nodes", () => {
		return PromiseUtil.each( REMOTE_ADDRESSES, address => network.drop( address ), { andDisconnect: true } );
	} );


	test( "requires local node's address on creation", () => {
		( () => new TransmittingNetwork() ).should.throw();
	} );

	test( "requires roughly valid address of local node on creation", () => {
		const invalid = [
			null,
			true,
			false,
			1,
			2.4,
			-6,
			"",
			[],
			() => {}, // eslint-disable-line no-empty-function
		];

		const valid = [
			"/ip4/127.0.0.1/tcp/1234",
			"/ip6/::1/tcp/1234",
			{ address: "127.0.0.1", port: 1234 },
			{ address: "127.0.0.1", port: "1234" },
			{ host: "127.0.0.1", port: 1234 },
			{ host: "127.0.0.1", port: "1234" },
			{ address: "::1", port: 1234 },
			{ address: "::1", port: "1234" },
			{ host: "::1", port: 1234 },
			{ host: "::1", port: "1234" },
		];

		invalid.forEach( address => {
			let n;

			( () => {
				n = new TransmittingNetwork( address );
			} ).should.throw();

			Should.not.exist( n );
		} );

		valid.forEach( address => {
			let n;

			( () => {
				n = new TransmittingNetwork( address );
			} ).should.not.throw();

			n.end();
		} );
	} );

	test( "is writable, only", () => {
		network.should.be.instanceOf( Writable );
		network.should.not.be.instanceOf( Readable );
		network.should.not.be.instanceOf( Duplex );
	} );

	suite( "exposes method for assigning dynamic pool of valid nodes in cluster which", () => {
		test( "adjusts pool manager exposed by network", () => {
			const pool = new Nodes();

			network.nodesPool.should.not.equal( pool );

			network.assignNodes( pool ).should.be.equal( network );

			network.nodesPool.should.equal( pool );
		} );

		test( "replaces previous pool manager with provided one", () => {
			const pool1 = new Nodes();
			const pool2 = new Nodes();

			network.nodesPool.should.not.equal( pool1 );
			network.nodesPool.should.not.equal( pool2 );

			network.assignNodes( pool1 ).should.be.equal( network );

			network.nodesPool.should.equal( pool1 );
			network.nodesPool.should.not.equal( pool2 );

			network.assignNodes( pool2 ).should.be.equal( network );

			network.nodesPool.should.not.equal( pool1 );
			network.nodesPool.should.equal( pool2 );
		} );

		test( "accepts `null` for releasing any previously assigned pool manager", () => {
			const pool = new Nodes();

			network.nodesPool.should.not.equal( pool );

			network.assignNodes( pool ).should.be.equal( network );

			network.nodesPool.should.equal( pool );

			network.assignNodes( null ).should.be.equal( network );

			network.nodesPool.should.not.equal( pool );
		} );

		test( "exposes fake pool manager when assigning `null`, which is providing method `has()` for testing addresses to fail on every address", () => {
			network.assignNodes( null ).should.be.equal( network );

			network.nodesPool.should.have.property( "has" ).which.is.a.Function();

			network.nodesPool.has( MY_ADDRESS ).should.be.false();
			REMOTE_ADDRESSES.forEach( address => network.nodesPool.has( address ).should.be.false() );
		} );
	} );

	suite( "with dynamic pool of valid nodes in cluster", () => {
		let pool;

		setup( "prepare fresh pool of valid cluster nodes", () => {
			pool = new Nodes( [], MY_ADDRESS );

			network.assignNodes( pool );
		} );

		test( "requires peer to be in pool for being considered valid", () => {
			const node0 = REMOTE_ADDRESSES[0];
			const node1 = REMOTE_ADDRESSES[1];

			network.isValidNode( node0 ).should.be.false();
			network.isValidNode( node1 ).should.be.false();

			pool.add( node0 );

			network.isValidNode( node0 ).should.be.true();
			network.isValidNode( node1 ).should.be.false();

			pool.add( node1 );

			network.isValidNode( node0 ).should.be.true();
			network.isValidNode( node1 ).should.be.true();

			pool.remove( node0 );

			network.isValidNode( node0 ).should.be.false();
			network.isValidNode( node1 ).should.be.true();

			pool.remove( node1 );

			network.isValidNode( node0 ).should.be.false();
			network.isValidNode( node1 ).should.be.false();
		} );

		test( "rejects creation of peer managers for peer nodes not listed in pool", () => {
			const node0 = REMOTE_ADDRESSES[0];
			const node1 = REMOTE_ADDRESSES[1];

			Should( network.node( node0 ) ).be.null();

			pool.add( node0 );

			Should( network.node( node0 ) ).not.be.null();

			Should( network.node( node1 ) ).be.null();

			pool.add( node1 );

			Should( network.node( node1 ) ).not.be.null();
		} );

		test( "implicitly drops related peer managers when removing node from pool", () => {
			const node0 = REMOTE_ADDRESSES[0];
			const node1 = REMOTE_ADDRESSES[1];

			pool.add( node0 );
			pool.add( node1 );

			Should( network.node( node0, { createIfMissing: false } ) ).be.null();
			Should( network.node( node1, { createIfMissing: false } ) ).be.null();

			network.node( node0 );
			network.node( node1 );

			Should( network.node( node0, { createIfMissing: false } ) ).not.be.null();
			Should( network.node( node1, { createIfMissing: false } ) ).not.be.null();

			pool.remove( node0 );

			Should( network.node( node0, { createIfMissing: false } ) ).be.null();
			Should( network.node( node1, { createIfMissing: false } ) ).not.be.null();

			Should( network.node( node0, { createIfMissing: true } ) ).be.null();
			Should( network.node( node0 ) ).be.null();

			pool.remove( node1 );

			Should( network.node( node0, { createIfMissing: false } ) ).be.null();
			Should( network.node( node1, { createIfMissing: false } ) ).be.null();

			Should( network.node( node0, { createIfMissing: true } ) ).be.null();
			Should( network.node( node1, { createIfMissing: true } ) ).be.null();

			Should( network.node( node0 ) ).be.null();
			Should( network.node( node1 ) ).be.null();
		} );
	} );

	suite( "while obeying dynamic pool of valid nodes in cluster", () => {
		let pool;

		setup( "assign empty pool to network", () => {
			pool = new Nodes( [], MY_ADDRESS );

			network.assignNodes( pool );
		} );

		test( "implicitly knows its own node's address", () => {
			network.isValidNode( MY_ADDRESS ).should.be.true();
		} );

		test( "ignores request to drop its own node's address", () => {
			network.isValidNode( MY_ADDRESS ).should.be.true();

			network.drop( MY_ADDRESS );

			network.isValidNode( MY_ADDRESS ).should.be.true();
		} );

		test( "provides same per-node manager on repeated request using same node address", () => {
			const node0 = REMOTE_ADDRESSES[0];
			const node1 = REMOTE_ADDRESSES[1];

			pool.add( node0 ).add( node1 );

			const manager = network.node( node0 );
			const refetched = network.node( node0 );
			const different = network.node( node1 );

			refetched.should.equal( manager );
			different.should.not.equal( manager );
		} );

		test( "is not managing connection to any participating node initially", () => {
			REMOTE_ADDRESSES.concat( MY_ADDRESS )
				.map( id => pool.add( id ) && id )
				.map( id => network.connection( id ) )
				.filter( i => i )
				.should.be.empty();
		} );
	} );

	suite( "rejects to", () => {
		let pool;

		setup( "assign pool with all remote addresses to network", () => {
			pool = new Nodes( REMOTE_ADDRESSES, MY_ADDRESS );

			network.assignNodes( pool );
		} );

		test( "send w/o message", () => {
			return network.send( undefined ).should.be.Promise().which.is.rejected();
		} );

		test( "write w/o message", () => {
			return new Promise( ( resolve, reject ) => network.write( undefined, error => {
				if ( error ) {
					reject( error );
				} else {
					resolve();
				}
			} ) ).should.be.rejected();
		} );

		test( "send improperly addressing message", () => {
			return PromiseUtil.each( BAD_ADDRESS_MESSAGES, message => {
				return network.send( message ).should.be.Promise().which.is.rejected();
			} );
		} );

		test( "write improperly addressing message", () => {
			return PromiseUtil.each( BAD_ADDRESS_MESSAGES, message => {
				return new Promise( ( resolve, reject ) => network.write( message, error => {
					if ( error ) {
						reject( error );
					} else {
						resolve();
					}
				} ) ).should.be.rejected();
			} );
		} );

		test( "send message from any address but its own node's address", () => {
			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				return PromiseUtil.each( REMOTE_ADDRESSES, sender => {
					const copy = Object.assign( {}, message );

					copy.from = sender;

					return network.send( copy )
						.should.be.Promise().which.is.rejected()
						.then( () => {
							// try to declare either involved node's address
							network.node( copy.from );
							network.node( copy.to );

							return network.send( copy )
							// still failing
								.should.be.Promise().which.is.rejected();
						} );
				} );
			} );
		} );

		test( "write message from any address but its own node's address", () => {
			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				return PromiseUtil.each( REMOTE_ADDRESSES, sender => {
					const copy = Object.assign( {}, message );

					copy.from = sender;

					return new Promise( ( resolve, reject ) => {
						network.write( copy, error => ( error ? reject( error ) : resolve() ) );
					} )
						.should.be.Promise().which.is.rejected()
						.then( () => {
							// try to declare either involved node's address
							network.node( copy.from );
							network.node( copy.to );

							return new Promise( ( resolve, reject ) => {
								network.write( copy, error => ( error ? reject( error ) : resolve() ) );
							} )
							// still failing
								.should.be.Promise().which.is.rejected();
						} );
				} );
			} );
		} );

		test( "send properly addressing message to node w/o declaring it part of network first", () => {
			REMOTE_ADDRESSES.forEach( address => pool.remove( address ) );

			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				const copy = Object.assign( {}, message );

				copy.from = MY_ADDRESS;

				return network.send( copy )
					.should.be.Promise().which.is.rejected();
			} );
		} );

		test( "write properly addressing message to node w/o declaring it part of network first", () => {
			REMOTE_ADDRESSES.forEach( address => pool.remove( address ) );

			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				const copy = Object.assign( {}, message );

				copy.from = MY_ADDRESS;

				return new Promise( ( resolve, reject ) => {
					network.write( copy, error => ( error ? reject( error ) : resolve() ) );
				} )
					.should.be.Promise().which.is.rejected();
			} );
		} );

		teardown( "did not create any connection manager due to rejecting to send messages", () => {
			REMOTE_ADDRESSES.concat( MY_ADDRESS )
				.map( id => network.connection( id ) )
				.filter( i => i )
				.should.be.empty();
		} );
	} );

	suite( "accepts communicating with local node", () => {
		let pool;

		setup( "assign pool with all remote addresses to network", () => {
			pool = new Nodes( REMOTE_ADDRESSES, MY_ADDRESS );

			network.assignNodes( pool );
		} );

		test( "can send a message to my own node's listener w/o declaring it part of network first", () => {
			return network.send( {
				from: MY_ADDRESS,
				to: MY_ADDRESS,
				what: "hey",
			} ).should.be.Promise().which.is.fulfilled();
		} );

		test( "can write a message to my own node's listener w/o declaring it part of network first", () => {
			return new Promise( ( resolve, reject ) => {
				network.write( {
					from: MY_ADDRESS,
					to: MY_ADDRESS,
					what: "hey",
				}, error => {
					if ( error ) {
						reject( error );
					} else {
						resolve();
					}
				} );
			} )
				.should.be.Promise().which.is.fulfilled();
		} );

		teardown( "did not create any connection manager due to communicating locally, only", () => {
			REMOTE_ADDRESSES.concat( MY_ADDRESS )
				.map( id => network.connection( id ) )
				.filter( i => i )
				.should.be.empty();
		} );
	} );

	suite( "used with properly initialized pool of cluster nodes", () => {
		let pool;

		setup( "assign pool with all remote addresses to network", () => {
			pool = new Nodes( REMOTE_ADDRESSES, MY_ADDRESS );

			network.assignNodes( pool );
		} );

		test( "accepts to send properly addressing message to node declared as part of network", () => {
			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				const copy = Object.assign( {}, message );

				copy.from = MY_ADDRESS;

				return new Promise( ( resolve, reject ) => {
					let passed = 0;

					const advance = step => {
						passed |= step;

						if ( passed === 3 ) {
							resolve();
						}
					};

					network.node( MY_ADDRESS ).once( "data", () => {
						advance( 1 );
					} );

					// essential: request manager for recipient's node
					network.node( copy.to );

					network.send( copy )
						.should.be.Promise().which.is.fulfilled()
						.then( () => setTimeout( advance, 500, 2 ) )
						.catch( reject );
				} );
			} );
		} );

		test( "accepts to write properly addressing message to node declared as part of network", () => {
			return PromiseUtil.each( GOOD_ADDRESS_MESSAGES, message => {
				const copy = Object.assign( {}, message );

				copy.from = MY_ADDRESS;

				return new Promise( ( resolve, reject ) => {
					let passed = 0;

					const advance = step => {
						passed |= step;

						if ( passed === 3 ) {
							resolve();
						}
					};

					network.node( MY_ADDRESS ).once( "data", () => {
						advance( 1 );
					} );

					// essential: request manager for recipient's node
					network.node( copy.to );

					new Promise( ( sendResolve, sendReject ) => {
						network.write( copy, error => ( error ? sendReject( error ) : sendResolve() ) );
					} )
						.should.be.Promise().which.is.fulfilled()
						.then( () => setTimeout( advance, 500, 2 ) )
						.catch( reject );
				} );
			} );
		} );

		test( "is managing connection to node message was sent to before", () => {
			const peerZero = REMOTE_ADDRESSES[0];

			network.node( peerZero ); // node must be re-declared to get existing connection with it
			Should.exist( network.connection( peerZero ) );
		} );

		test( "can't send a message to unknown peer", () => {
			return network.send( {
				from: MY_ADDRESS,
				to: "/ip4/127.0.0.1/tcp/1234",
				what: "hey",
			} ).should.be.Promise().which.is.rejected();
		} );

		test( "can't write a message to unknown peer", () => {
			return new Promise( ( resolve, reject ) => {
				network.write( {
					from: MY_ADDRESS,
					to: "/ip4/127.0.0.1/tcp/1234",
					what: "hey",
				}, error => {
					if ( error ) {
						reject( error );
					} else {
						resolve();
					}
				} );
			} )
				.should.be.Promise().which.is.rejected();
		} );

		test( "can send a message to known peer w/o receiving replies via network itself", done => {
			const node0 = REMOTE_ADDRESSES[0];

			network.node( node0 );

			network.on( "data", () => {
				// network mustn't receive any messages
				done( new Error( "unexpected reply on network" ) );
			} );

			network.send( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			} )
				.then( () => setTimeout( done, 1000 ) )
				.catch( error => done( error ) );
		} );

		test( "can write a message to known peer w/o receiving replies via network itself", done => {
			const node0 = REMOTE_ADDRESSES[0];

			network.node( node0 );

			network.on( "data", () => {
				// network mustn't receive any messages
				done( new Error( "unexpected reply on network" ) );
			} );

			network.write( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			}, error => {
				if ( error ) {
					done( error );
				} else {
					setTimeout( done, 1000 );
				}
			} );
		} );

		test( "can send a message to peer w/ receiving reply via manager of local node", done => {
			const node0 = REMOTE_ADDRESSES[0];

			const peer = network.node( node0 );
			const me = network.node( MY_ADDRESS );

			let steps = 3;

			const advance = mask => {
				steps &= ~mask;
				if ( !steps ) {
					done();
				}
			};

			peer.once( "data", () => {
				done( new Error( "unexpected reception of message via peer node's manager" ) );
			} );

			me.once( "data", message => {
				try {
					NetworkMessage.compare( message, {
						from: node0,
						to: MY_ADDRESS,
						what: "hey",
						isReply: true,
					} ).should.be.true();

					// mark reception of reply at local node's manager as expected
					advance( 1 );
				} catch ( error ) {
					done( error );
				}
			} );

			network.send( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			} )
			// wait a second expecting no reception of reply at peer node's manager
				.then( () => setTimeout( advance, 1000, 2 ) )
				.catch( done );
		} );

		test( "can write a message to peer w/ receiving reply via manager of local node", done => {
			const node0 = REMOTE_ADDRESSES[0];

			const peer = network.node( node0 );
			const me = network.node( MY_ADDRESS );

			let steps = 3;

			const advance = mask => {
				steps &= ~mask;
				if ( !steps ) {
					done();
				}
			};

			peer.once( "data", () => {
				done( new Error( "unexpected reception of message via peer node's manager" ) );
			} );

			me.once( "data", message => {
				try {
					NetworkMessage.compare( message, {
						from: node0,
						to: MY_ADDRESS,
						what: "hey",
						isReply: true,
					} ).should.be.true();

					// mark reception of reply at local node's manager as expected
					advance( 1 );
				} catch ( error ) {
					done( error );
				}
			} );

			network.write( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			}, error => {
				if ( error ) {
					done( error );
				} else {
					// wait a second expecting no reception of reply at peer node's manager
					setTimeout( advance, 1000, 2 );
				}
			} );
		} );

		test( "can both send message and receive reply using local node's manager", done => {
			const node0 = REMOTE_ADDRESSES[0];

			network.node( node0 );
			const me = network.node( MY_ADDRESS );

			me.once( "data", message => {
				try {
					NetworkMessage.compare( message, {
						from: node0,
						to: MY_ADDRESS,
						what: "hey",
						isReply: true,
					} ).should.be.true();

					done();
				} catch ( error ) {
					done( error );
				}
			} );

			me.send( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			} ).catch( done );
		} );

		test( "can both write message and receive reply using local node's manager", done => {
			const node0 = REMOTE_ADDRESSES[0];

			network.node( node0 );
			const me = network.node( MY_ADDRESS );

			me.once( "data", message => {
				try {
					NetworkMessage.compare( message, {
						from: node0,
						to: MY_ADDRESS,
						what: "hey",
						isReply: true,
					} ).should.be.true();

					done();
				} catch ( error ) {
					done( error );
				}
			} );

			me.write( {
				from: MY_ADDRESS,
				to: node0,
				what: "hey",
			}, error => {
				if ( error ) {
					done( error );
				}
			} );
		} );

		test( "allows peer to disconnect", () => {
			const peerZero = REMOTE_ADDRESSES[0];

			// drop all previously captured data to prepare upcoming tests
			[ 0, 1, 2 ]
				.forEach( i => capturedData[i].splice( 0, capturedData[i].length ) );

			const stream = network.connection( peerZero ).stream;

			stream.isConnected.should.be.true();

			stream.disconnect();

			return new Promise( resolve => stream.once( "disconnect", resolve ) )
				.then( () => {
					stream.isConnected.should.be.false();
				} );
		} );

		test( "can still send data to another peer w/o explicitly reconnecting", () => {
			const peerTwo = REMOTE_ADDRESSES[2];

			return new Promise( resolve => {
				const node = network.node( MY_ADDRESS );

				network.node( peerTwo );

				node.once( "data", resolve );

				network.write( {
					from: MY_ADDRESS,
					to: peerTwo,
					what: "hey you",
				} );
			} )
				.then( message => {
					NetworkMessage.compare( message, {
						from: peerTwo,
						to: MY_ADDRESS,
						what: "hey you",
						isReply: true,
					} )
						.should.be.true();
				} );
		} );

		test( "is delivering message to different peer no matter the first one has been disconnected", () => {
			capturedData[2].should.be.Array().which.has.length( 1 );

			NetworkMessage.compare( capturedData[2][0], {
				from: Address( MY_ADDRESS ).id,
				to: Address( REMOTE_ADDRESSES[2] ).id,
				what: "hey you",
			} )
				.should.be.true();
		} );

		test( "waits for previously disconnected node to be connected with again", () => {
			return network.connection( REMOTE_ADDRESSES[0] ).stream.getSocket();
		} );

		test( "can send data to now reconnected peer", () => {
			const peerZero = REMOTE_ADDRESSES[0];

			return new Promise( resolve => {
				network.node( MY_ADDRESS ).once( "data", resolve );

				network.write( {
					from: MY_ADDRESS,
					to: peerZero,
					what: "hey you're back",
				} );
			} )
				.then( message => {
					NetworkMessage.compare( message, {
						from: Address( peerZero ).id,
						to: Address( MY_ADDRESS ).id,
						what: "hey you're back",
						isReply: true,
					} )
						.should.be.true();
				} );
		} );

		test( "reconnected peer got the message", () => {
			capturedData[0].should.be.Array().which.has.length( 1 );
			NetworkMessage.compare( capturedData[0][0], {
				from: Address( MY_ADDRESS ).id,
				to: Address( REMOTE_ADDRESSES[0] ).id,
				what: "hey you're back",
			} )
				.should.be.true();
		} );

		test( "can disconnect from declared peer", () => {
			const peerTwo = REMOTE_ADDRESSES[2];

			network.node( peerTwo );

			Should( network.connection( peerTwo ) ).not.be.null();
			network.disconnect( peerTwo );
			Should( network.connection( peerTwo ) ).be.null();
		} );

		test( "ignores additional request for disconnecting from previously disconnected peer", () => {
			const peerTwo = REMOTE_ADDRESSES[2];

			network.node( peerTwo );

			Should( network.connection( peerTwo ) ).be.null();
			network.disconnect( peerTwo );
			Should( network.connection( peerTwo ) ).be.null();
		} );

		test( "ignores request to disconnect from undeclared peer", () => {
			network.disconnect( "/ip4/127.0.0.1/tcp/8084" );
		} );

		test( "implicitly re-establishes connection to peer explicitly disconnected previously on sending next message", () => {
			const peerTwo = REMOTE_ADDRESSES[2];

			network.node( peerTwo );

			Should( network.connection( peerTwo ) ).be.null();

			return new Promise( resolve => {
				network.node( MY_ADDRESS ).once( "data", resolve );
				network.write( {
					from: MY_ADDRESS,
					to: peerTwo,
					what: "yo",
				} );

				Should( network.connection( peerTwo ) ).not.be.null();
			} )
				.then( data => {
					NetworkMessage.compare( data, {
						to: Address( MY_ADDRESS ).id,
						from: Address( peerTwo ).id,
						what: "yo",
						isReply: true,
					} )
						.should.be.true();
				} );
		} );
	} );

	suite( "can be closed", () => {
		test( "by ending writable stream of network", () => {
			const promise = Promise.all( servers.map( server => server.instantlyClose() ) );

			network.end();

			return promise;
		} );
	} );
} );
