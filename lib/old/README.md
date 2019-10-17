This part of library implements two different views on nodes of cluster. Due to representing a network of nodes either view is called a _network_. Every node of cluster is using one instance of every kind of network.

    const { createNetwork } = require( "./lib/network" );
    const { transmitting, receiving } = createNetwork();

## Two Kinds of Networks

The naming as _transmitting_ and _receiving_ was chosen in compliance with the roles of two nodes in a request-response cycle which is the basic form of communication in cluster.

The _transmitting network_ or _transmitting view on cluster_ is used by either node to actively connect with peer nodes in cluster for sending request messages to those nodes. This view supports sending request messages and handles reception of replies. So, it's primarily used for transmitting requests though it's receiving (replies), too.

The _receiving network_ or _receiving view on cluster_ is used by either node to listen for incoming connections, to receive incoming request messages over these connections and to send back replies to peer nodes. Such a network primarily consists of a TCP server socket managing remotely established connections. In a _receiving network_ requests are received, though replies are transmitted.

> By intention sockets managed by a transmitting network of one node are communicating with receiving networks of other nodes in cluster.

## Node Addressing

Every node in a cluster is identified by a unique address. This address complies with the syntax

    /ip4/tcp/a.b.c.d/e

with `a.b.c.d` being IP address of node's host and `e` the port number of the node's listening socket of its receiving network. This address can be used by _transmitting network_ to connect with _receiving network_ of peer node.

> This way of addressing nodes is important to understand the following security considerations.

## Node Managers And Security Considerations

### Receiving Networks

For security reasons a receiving network **must** declare all nodes of cluster prior to receiving requests from either node. This prevents processing of unsolicited requests from arbitrary hosts.

That's why code **should** instantly fetch managers for all known nodes of cluster to declare them accordingly in a receiving network:

    const a = receiving.node( "/ipv4/tcp/192.168.1.233/8000" );
    const b = receiving.node( "/ipv4/tcp/192.168.1.234/8000" );
    const c = receiving.node( "/ipv4/tcp/192.168.1.235/8000" );

Without this any incoming request message e.g. from node `/ipv4/tcp/192.168.1.234/8000` will be ignored by local _receiving network_. After declaring nodes this way such requests are accepted and can be read message by message from readable stream of related node's manager fetched above.

    a.on( "data", message => { 
        // handle message from node //ipv4/tcp/192.168.1.233/8000 
    } );
    b.on( "data", message => { 
        // handle message from node //ipv4/tcp/192.168.1.234/8000 
    } );
    ...

This filter is applied on sender address given in field `from` of a received request message. The receiving network can't rely on remote address of underlying TCP connection as the sending node's transmitting network can't use the same port as given in node's address. Even worse, on a weak network the connection might fail to be reconnected each time using a different port number on side of sending node. As a downside this results in an unnecessary extra load required to decode unsolicited incoming requests.

### Transmitting Networks

In a transmitting network those security considerations don't apply. In opposition to the receiving network the transmitting network is actively establishing TCP/IP connections to some peer nodes and is thus trusting those connections and all replies it is receiving through them.

Nonetheless reception of replies requires fetching of node managers in a transmitting network, too. This is also due to either kind of network exposing writable stream API, only. Without fetching node manager there is no opportunity to ever receive the reply to some transmitted request message. Without fetching node manager the reply gets instantly dropped by transmitting network on reception.

All these facts are due to the intention of exposing equivalent API in either kind of network. 

    transmitting.send( { 
        from: addr, 
        to: addr, 
        ... 
    } );

    transmitting.on( "data", message => { 
        // this event is never emitted 
    } );

This code on its own is working with regards to sending message, but the local node is never capable of receiving the reply.

    const A = receiving.node( "/ipv4/tcp/192.168.1.233/8000" );
    const B = receiving.node( "/ipv4/tcp/192.168.1.234/8000" );
    const C = receiving.node( "/ipv4/tcp/192.168.1.235/8000" );

    B.send( { 
        from: addr, 
        to: addr, 
        ... 
    } );

    B.on( "data", message => { 
        // handle message from node //ipv4/tcp/192.168.1.234/8000
    } );

## Network API

### Fetching Node Manager

By fetching a node's manager it is implicitly declared as a valid node of cluster in context of related network.

    const node = transmitted.node( nodeAddress );

or 

    const node = received.node( nodeAddress );

A node manager is capable of sending and receiving messages to/from the related node of cluster.

### Sending Messages

In a transmitting network it is possible to send _request messages_. In a receiving network it is possible to send _reply messages_. In either case messages are sent using method `send()` of network instance.

    transmitting.send( {
        from: addr,
        to: addr,
        ...
    } );

or

    receiving.send( {
        from: addr,
        to: addr,
        ...
    } );

It's possible to use a node's manager for sending messages, too. That manager is exposing method `send()` as well, but it's just forwarding the request to the associated network's method used before. So, sending via node manager is a convenient option in certain situations, but unnecessarily complex when using network API is optionally available.

The method is always returning promise fulfilled when message has been sent without error. Due to always implementing `Writable` interface the usual method `write( message, callback )` for sending messages is available, too.

### Receiving Messages

The reception of messages is available on a per-node basis. In either kind of network a node's manager is emitting event `data` with received message attached whenever a message from either node is received.

    const node = transmitting.node( nodeAddress );
    node.on( "data", message => {
        // handle message
    } );

or

    const node = receiving.node( nodeAddress );
    node.on( "data", message => {
        // handle message
    } );
