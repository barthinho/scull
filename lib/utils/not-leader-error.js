"use strict";

/**
 * Describes error indicating different node of cluster being its current leader.
 */
class NotLeaderError extends Error {
	/**
	 * @param {Address|string} leader unique ID of current leader node
	 */
	constructor( leader ) {
		super( "not the leader" );

		this.code = "ENOTLEADER";
		this.leader = leader;
	}
}

module.exports = NotLeaderError;
