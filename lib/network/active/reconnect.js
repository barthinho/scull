'use strict';

const Net = require( 'net' );

const Debug = require( 'debug' )( 'skiff.network.reconnect' );
const Reconnect = require( 'reconnect-core' );

module.exports = Reconnect( maddr => {
	const nodeAddr = maddr.nodeAddress();
	const addr = {
		port: nodeAddr.port,
		host: nodeAddr.address
	};

	Debug( 'connecting to %j', addr );

	return Net.connect( addr );
} );
