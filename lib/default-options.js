"use strict";

const OS = require( "os" );

module.exports = {
	network: undefined,
	server: {},
	rpcTimeoutMS: 2000,
	peers: [],
	levelup: {
		keyEncoding: "utf8",
		valueEncoding: "json"
	},
	location: OS.tmpdir(),
	appendEntriesIntervalMS: 100,
	heartbeatTimeoutMinMS: 300,
	heartbeatTimeoutMaxMS: 600,
	installSnapshotChunkSize: 10,
	batchEntriesLimit: 10,
	clientRetryRPCTimeout: 200,
	clientMaxRetries: 10,
	waitBeforeLeaveMS: 4000
};
