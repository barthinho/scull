# Scull

[Raft](https://raft.github.io/) Consensus Algorithm implementation for Node.js.

* Latest Release: [![Build Status](https://travis-ci.org/hitchyjs/scull.svg?branch=master)](https://travis-ci.org/hitchyjs/scull)
* Current Development: [![Build Status](https://travis-ci.org/hitchyjs/scull.svg?branch=develop)](https://travis-ci.org/hitchyjs/scull)


## About

This package was started as a fork of package [skiff](https://www.npmjs.com/package/skiff) by Pedro Teixeira. 

While reading, revising and refactoring original code, trying to understand the project and fixing some encountered issues we've planned to keep this fork tightly bound to the original package by using similar name, sharing version numbers and probably providing revisions back upstream. But on starting to introduce changes breaking existing API as well as trying to replace some downsides of existing code with more efficient features we considered our fork significantly moving away from its origin. That's why we chose to switch its name to express this stronger separation.

## Motivation

The original [skiff](https://www.npmjs.com/package/skiff) has been forked to adopt it's abilities for implementing an application-cluster backend for our [hitchy framework](http://hitchyjs.org). Even though this sounds like the now called project **scull** being tightly bound to hitchy we guarantee it's not. The fork has been started to refactor parts of code, modernizing its API and adding some commands to cluster missing in original project. We basically intend to keep this project mostly API compatible to [skiff](https://www.npmjs.com/package/skiff), too.

## Features

* Persists to LevelDB (or any database exposing a [LevelDOWN](https://github.com/level/leveldown) interface).
* Exposes the cluster as a [LevelUP](https://github.com/level/levelup#readme) or [LevelDOWN](https://github.com/level/leveldown#readme)-compatible interface, with which you can extend using [the LevelUP plugins](https://github.com/Level/levelup/wiki/Modules#plugins).
* Encodes messages using Msgpack

## Installation

```bash
$ npm install scull --save
```

## Usage

```javascript
const Scull = require( 'scull' );

const options = {
  db: require( 'memdown' ), // in memory database
  peers: [ // peer addresses
    '/ip4/127.0.0.1/tcp/9491',
    '/ip4/127.0.0.1/tcp/9492'
  ]
};

const shell = Scull( '/ip4/127.0.0.1/tcp/9490', options );

// expose the cluster as a LevelUP-compatible database
const db = shell.levelUp();

shell.start( err => {
  if ( err ) {
    console.error( 'Error starting scull node: ', err.message );
  } else {
    console.log( 'Scull node started' );

    db.put( 'key', 'value', ( err ) => {
      // ...
    } );
  }
} );
```

# API

## Scull( address, options ) : Shell

Creates a new `Shell` for controlling local node in cluster.

### Arguments:

* `address` (string, mandatory): an address in the [multiaddr](https://github.com/multiformats/js-multiaddr#readme) format (example: `"/ip/127.0.0.1/tcp/5398"`).
* `options` (object):
  * `network` (object): if you want to share the network with other scull nodes on the same process, create a network using `Scull.createNetwork(options)` (see below)
  * `server` (object):
    * `port` (integer): TCP port. Defaults to the port in `address`
    * `host` (string): host name to bind the server to. Defaults to the host name in the `address`
  * rpcTimeoutMS (integer, defaults to `2000`): Timeout for RPC calls.
  * peers (array of strings, defaults to `[]`): The addresses of the peers (also in the [multiaddr](https://github.com/multiformats/js-multiaddr#readme) format). __If the database you're using is persisted to disk (which is the default), these peers will be overridden by whatever is loaded from the latest snapshot once the node starts.__
  * `levelUp` (object): options to the internal LevelUP database. Defaults to:

  ```json
  {
    "keyEncoding": "utf8",
    "valueEncoding": "json"
  }
  ```

  * `location` (string): Location of the base directory for the LevelDB files. Defaults to the default folder of current operating system for temporary files.
  * `db` (function, defaults to [LevelDOWN](https://github.com/Level/leveldown#readme) implementation): Database constructor, should return a [LevelDOWN](https://github.com/Level/leveldown#readme) implementation.

 > (You can use this to create a in-memory database using [Memdown](https://github.com/Level/memdown#readme))

#### Advanced options

  * `appendEntriesIntervalMS` (integer, defaults to `100`): The interval (ms) with which a leader sends `AppendEntries` messages to the followers (ping).
  * `electionTimeoutMinMS` (integer, defaults to `300`): The minimum election timeout (ms) for a node. It's the minimum time a node has to wait until no `AppendEntries` message triggers an election.
  * `electionTimeoutMaxMS` (integer, defaults to `600`): The maximum election timeout (ms) for a node. It's the maximum time a node has to wait until no `AppendEntries` message triggers an election.
  * `installSnapshotChunkSize` (integer, defaults to `10`): The maximum number of database records on each `InstallSnapshot` message.
  * `batchEntriesLimit` (integer, defaults to `10`): The maximum number of log entries in a `AppendEntries` message.
  * `clientRetryRPCTimeout` (integer, defaults to 200): The number of milliseconds the internal client has to wait until retrying
  * `clientMaxRetries` (integer, defaults to 10): The maximum number of times the client is allowed to retry the remote call.

## shell.start() : Promise

This method is starting current node by establishing network connectivity, loading its persistent state from database and entering follower state while waiting for first heartbeat request from current leader node of cluster. The returned promise is resolved on having loaded persistent state and on having started to listen for incoming requests. 

## shell.stop() : Promise

This method is stopping current node by disconnecting it from all its peers which implies shutting down any listener for incoming requests or replies as well as ceasing to send any requests.

## shell.levelUp()

Returns a new [LevelUP-compatible](https://github.com/level/levelup) object for interacting with the cluster.

## shell.levelDown()

Returns a new [LevelDOWN-compatible](https://github.com/level/leveldown) object for interacting with the cluster.

## shell.join( peerAddress ) : Promise

Adds node at given address as another peer to current cluster unless it has been added before.

## shell.leave( peerAddress ) : Promise

Adds node at given address as another peer to current cluster unless it has been added before.

## shell.stats ()

Returns some interesting stats for this node.

## shell.peers() : Promise<[]>

Fetches list of current nodes in cluster including statistical information collected by current leader. This method might forward the request to current leader node and thus has to be used asynchronously.

## shell.term

This read-only property provides current term of controlled node. The term is identifying the continuous reign of a leader node. Whenever a current leader is failing another one is elected starting another term. The same applies in case of one election failing to properly choose one of the available nodes in cluster to become leader.

## shell.weaken( durationMS )

Weakens the node for the duration. During this period, the node transitions to a special `weakened` state, in which the node does not react to election timeouts. This period ends once it learns a new leader or the period runs out.

## shell.readConsensus() : Promise

Requests special `read` command on cluster to be confirmed by a majority of nodes in cluster considered consensus from the cluster on its current state as managed by current leader node.

## shell.waitFor( peers ) : Promise

Performs equivalent request as `shell.readConsensus()` but requiring explicit confirmation from all given peers in addition to required confirmation by majority.

This method is available to make sure one or more nodes of cluster have been catching up.

```javascript
shell.peers().then( peers => shell.waitFor( peers ).then( () => {
	// do something
} ) );
```

This code template can be used to explicitly wait for consensus confirmed by _all peer nodes_ of cluster.

## Events

A `Shell` instance emits the following events:

* `started`: once the node is started (network server is up and persisted state is loaded)
* `warning (err)`: if a non-fatal error was encountered
* `connect (peer)`: once a leader node is connected to a peer
* `disconnect (peer)`: once a leader node is disconnected from a peer
* `new state (state)`: once a node changes state (possible states are `follower`, `candidate` and `leader`)
* `leader`: once the node becomes the cluster leader
* `joined (peerAddress)`: emitted on peer joining the cluster
* `left (peerAddress)`: emitted on peer leaving the cluster
* `rpc latency (ms)`: the latency for an RPC call, in milliseconds
* `heartbeat timeout`: marks current non-leading node missing frequent request from current leader node (considering current node or leader node detached from cluster)
* `electing`: marks cluster starting leader election
* `elected (leader)`: marks cluster having elected leader
* `new leader (leader)`: marks node having changed local information on current leader on receiving message
* `up-to-date`: marks node having received snapshot from current leader to catch up with cluster

## Scull.createNetwork( options )

This static method - it's no method of shell created before - creates a network you can share amongst several Scull nodes in the same process.

Options:

* `active` (object):
  * `inactivityTimeout` (integer, milliseconds, defaults to `5000`): The amount of time to wait before a client connection is closed because of inactivity.
* `passive` (object):
  * `server` (object):
    * `port` (integer, defaults to `9163`): the port the server should listen on
    * `host` (string, defaults to `"0.0.0.0"`): the interface address the server should listen to
    * `exclusive` (boolean, defaults to `true`): if true, the server is not shareable with other processes (see [`Server#listen()` on Node.js docs](https://nodejs.org/api/net.html#net_server_listen_options_callback)).

# License

[MIT](LICENSE)

# Copyright

* [skiff](https://www.npmjs.com/package/skiff) (c) 2016 Pedro Teixeira
* scull (c) 2017 cepharum GmbH
