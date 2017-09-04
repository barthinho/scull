'use strict';

const OS = require( 'os' );

module.exports = {
	network: undefined,
	server: {},
	rpcTimeoutMS: 2000,
	peers: [],
	levelup: {
		keyEncoding: 'utf8',
		valueEncoding: 'json'
	},
	location: OS.tmpdir(),
	// TODO rename to heartbeatTimeout (as election hasn't timed out but timeout on heartbeat is reason for starting election)
	electionTimeout: true,
	appendEntriesIntervalMS: 100,
	// TODO rename to heartbeatTimeout*MS (as election hasn't timed out but timeout on heartbeat is reason for starting election)
	electionTimeoutMinMS: 300,
	electionTimeoutMaxMS: 600,
	installSnapshotChunkSize: 10,
	batchEntriesLimit: 10,
	clientRetryRPCTimeout: 200,
	clientMaxRetries: 10,
	waitBeforeLeaveMS: 4000
};
