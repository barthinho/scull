'use strict';

const Assert = require( 'assert' );

const Debug = require( 'debug' )( 'skiff.log' );

const defaultOptions = {
	// FIXME rename this option to maxLogRetention as it is limiting the _maximum_ number of log entries to retain in memory (unless not applied yet)
	minLogRetention: 100
};

/**
 * Describes essential format of a single entry of cluster's state log.
 *
 * @typedef {object} LogEntry
 * @property {Number} t term log entry is associated with
 * @property {Number} i cluster-wide index of log entry
 * @property {object} c logged command to control cluster's state machine
 */

/**
 * Manages log of commands all nodes of cluster perform consensually to control
 * cluster's state machine consistently.
 *
 * @note This class separates cluster-wide indices from local-only indices.
 *       Methods basically take cluster-wide indices to select entries in log.
 *
 * @type {Log}
 * @name Log
 * @property {Node} node
 * @property {object<string,*>} options
 * @property {LogEntry[]} entries
 * @property {{firstIndex: number, lastIndex: number, lastTerm: number, committedIndex: number, lastAppliedIndex: number, lastAppliedTerm: number}} stats
 */
module.exports = class Log {
	/**
	 * @param {Node} node
	 * @param {object<string,*>} options
	 */
	constructor( node, options ) {
		if ( !( node instanceof require( './node' ) ) ) {
			throw new TypeError( 'invalid type of node' );
		}

		let entries = [];

		const stats = {
			firstIndex: 0,
			lastIndex: 0,
			lastTerm: 0,
			committedIndex: 0,
			lastAppliedIndex: 0,
			lastAppliedTerm: 0,
		};

		Object.defineProperties( this, {
			node: { value: node },
			options: { value: Object.assign( {}, defaultOptions, node.options, options ) },
			entries: {
				get: () => entries,
				set: newEntries => {
					if ( !Array.isArray( newEntries ) ) {
						throw new TypeError( 'new set of entries must be an array' );
					}

					entries = newEntries;
				}
			},
			stats: { value: stats },
		} );
	}

	/**
	 * Appends another command to log.
	 *
	 * @param command command to append
	 * @returns {number} cluster index of appended command in log
	 */
	push( command ) {
		const term = this.node.term;
		const index = ++this.stats.lastIndex;

		const newEntry = {
			t: term,
			i: index,
			c: command
		};

		Debug( '%s: about to push new entry %j', this.node.id, newEntry );

		this.entries.push( newEntry );

		this.compact();

		this.stats.lastTerm = term;

		return index;
	}

	/**
	 * Fetches entry from log file at provided cluster-wide index in shared log.
	 *
	 * @param {Number} clusterIndex cluster-wide log index of entry to fetch
	 * @returns {LogEntry|undefined} found entry
	 */
	atIndex( clusterIndex ) {
		const localIndex = this.mapIndexClusterToLocal( clusterIndex );

		if ( localIndex > -1 ) {
			return this.entries[localIndex];
		}
	}

	/**
	 * Truncates log at selected cluster-wide index appending provided entries
	 * afterwards.
	 *
	 * @param {Number} clusterIndex cluster-wide index of entry to cut log at (keeping selecting entry)
	 * @param {LogEntry[]} entries entries to append to truncated log
	 */
	appendAfter( clusterIndex, entries ) {
		// jshint -W018
		Debug( '%s: append after %d: %j', this.node.id, clusterIndex, entries );


		// find index of element to become last one kept of previously existing
		// entries
		let stats = this.stats,
			log = this.entries,
			localIndex;

		if ( !( parseInt( clusterIndex ) > -1 ) ) {
			throw new TypeError( 'invalid cluster index' );
		}

		if ( stats.lastAppliedIndex > 0 && clusterIndex < stats.lastAppliedIndex ) {
			throw new TypeError( 'must not replace applied entries' );
		}

		if ( clusterIndex < stats.firstIndex ) {
			localIndex = 0;
		} else if ( clusterIndex > stats.lastIndex ) {
			localIndex = log.length;
		} else {
			// get local index of first item to be dropped before appending
			localIndex = clusterIndex - stats.firstIndex + 1;
		}


		// validate provided list of entries to append
		if ( !Array.isArray( entries ) ) {
			throw new TypeError( 'invalid list of entries to be appended' );
		}

		let previous = log.length > 0 ? localIndex > 0 ? log[localIndex-1] : null : null;

		for ( let i = 0, length = entries.length; i < length; i++ ) {
			// jshint -W018
			let entry = entries[i];
			if ( !entry || !( parseInt( entry.i ) > 0 ) || !( parseInt( entry.t ) > -1 ) || !entry.hasOwnProperty( 'c' ) ) {
				throw new TypeError( `invalid entry at #${i}` );
			}

			if ( entry.i < clusterIndex || ( previous && entry.i !== previous.i + 1 ) ) {
				throw new TypeError( `invalid index on entry at #${i}` );
			}

			if ( previous && entry.t < previous.t ) {
				throw new TypeError( `invalid term on entry at #${i}` );
			}

			previous = entry;
		}


		// replace all entries succeeding detected cut point with provided ones
		[].splice.apply( log, [localIndex, log.length - localIndex].concat( entries ) );


		// update locally cached markers
		if ( entries.length > 0 ) {
			const last = entries[entries.length - 1];
			if ( last ) {
				stats.lastIndex = last.i;
				stats.lastTerm = last.t;
			}
		}


		this.compact();
	}

	/**
	 * Commits log entries by applying them on current node.
	 *
	 * Applying entries includes
	 *  * persistently storing them in a local database
	 *  * processing command included with every entry
	 *
	 * @param {Number} commitToIndex cluster index of item until which log should be committed
	 * @param {function(error:Error=)} done
	 */
	commit( commitToIndex, done ) {
		if ( typeof commitToIndex !== 'number' ) {
			throw new Error( 'index needs to be a number' );
		}

		if ( typeof done !== 'function' ) {
			throw new Error( 'done needs to be a function' );
		}

		const node = this.node;
		const stats = this.stats;

		Debug( '%s: commit %d', node.id, commitToIndex );

		const entriesToApply = this.entriesFromTo( stats.committedIndex + 1, commitToIndex );
		if ( !entriesToApply.length ) {
			setImmediate( done );
			return;
		}

		const lastEntry = entriesToApply[entriesToApply.length - 1];

		Debug( '%s: lastEntry: %j', node.id, lastEntry );

		stats.committedIndex = lastEntry.i;

		node.applyEntries( entriesToApply.map( entry => entry.c ), err => {
			if ( err ) {
				return done( err );
			}

			Debug( '%s: committed log until index #%d', node.id, lastEntry.i );

			stats.lastAppliedIndex = lastEntry.i;
			stats.lastAppliedTerm = lastEntry.t;

			this.compact();

			done();
		} );
	}

	/**
	 * Finds latest entry in log related to selected term.
	 *
	 * @param {Number} term
	 * @returns {Number|undefined} _cluster index_ of last entry associated with term
	 */
	lastIndexForTerm( term ) {
		if ( this.stats.lastTerm === term ) {
			return this.stats.lastIndex;
		}

		const log = this.entries;

		for ( let i = log.length - 1; i >= 0; i-- ) {
			let entry = log[i];
			if ( entry.t === term ) {
				return entry.i;
			}
		}
	}

	/**
	 * Extracts copy of entries from log.
	 *
	 * @param {Number} clusterIndex cluster-wide index of first entry to extract
	 * @param {Number} limit maximum number of entries to extract, omit for all
	 * @param {Boolean} raw set true to extract raw copy of entries (reducing parts of extracted entries otherwise)
	 * @returns {?LogEntry[]} extracted entries, null on addressing invalid excerpt
	 */
	entriesFrom( clusterIndex, limit = 0, raw = false ) {
		// map cluster index to local index
		let stats = this.stats,
			log = this.entries,
			localIndex;

		if ( clusterIndex < stats.firstIndex ) {
			Debug( 'failed request for extracting log entries beyond start of available excerpt' );
			return null;
		}

		if ( clusterIndex > stats.lastIndex ) {
			localIndex = log.length;
		} else {
			localIndex = clusterIndex - stats.firstIndex;
		}

		const logCopy = limit > 0 ? log.slice( localIndex, localIndex + limit ) : log.slice( localIndex );
		if ( logCopy.length ) {
			Assert.equal( logCopy[0].i, clusterIndex );
		}

		Debug( 'entries from %d are %j', clusterIndex, logCopy );
		return raw ? logCopy : logCopy.map( cleanupEntry );
	}

	/**
	 * Extracts explicitly selected inclusive range of entries from log.
	 *
	 * @param {Number} from cluster-wide index of first entry to extract
	 * @param {Number} to cluster-wide index of last entry to extract
	 * @returns {LogEntry[]} entries of log matching selected range of indices
	 */
	entriesFromTo( from, to ) {
		if ( from > to ) {
			return [];
		}

		const pFrom = this.mapIndexClusterToLocal( from );
		const pTo = this.mapIndexClusterToLocal( to );

		if ( pFrom < 0 || pTo < pFrom ) {
			return [];
		}

		return this.entries.slice( pFrom, pTo + 1 );
	}

	/**
	 * Maps provided cluster-wide index into local index.
	 *
	 * @param {Number} clusterIndex
	 * @returns {Number} local index of log entry, -1 if not included in retained excerpt of log
	 */
	mapIndexClusterToLocal( clusterIndex ) {
		if ( clusterIndex < this.stats.firstIndex ) {
			Debug( 'index %d is beyond start of locally retained excerpt of log starting at index %d', clusterIndex, this.stats.firstIndex );
			return -1;
		}

		if ( clusterIndex > this.stats.lastIndex ) {
			Debug( 'index %d is beyond end of locally retained excerpt of log ending at index %d', clusterIndex, this.stats.lastIndex );
			return -1;
		}

		return clusterIndex - this.stats.firstIndex;
	}

	/**
	 * Limits log retained in memory by dropping older log entries already
	 * committed by peers and applied to persistent storage previously.
	 *
	 * @returns {Log} current instance
	 */
	compact() {
		const minLogRetention = this.options.minLogRetention;
		if ( minLogRetention > 0 ) {
			const log = this.entries;
			const stats = this.stats;

			let localCutIndex = ( log.length - minLogRetention );
			if ( localCutIndex > 0 ) {
				const clusterCutIndex = log[localCutIndex].i;

				// check for non-applied entries in log preceding chosen cut point
				const nonAppliedEntriesToBeDropped = clusterCutIndex - stats.lastAppliedIndex;
				if ( nonAppliedEntriesToBeDropped > 0 ) {
					localCutIndex -= nonAppliedEntriesToBeDropped;
				}

				if ( localCutIndex > 0 ) {
					require( "debug" )( "skiff.states.base" )( '%s: compacting log by dropping entries 0-%d (#%d-#%d)', this.node.id, localCutIndex, log[0].i, log[localCutIndex].i );
					log.splice( 0, localCutIndex );
				}
			}

			if ( log.length > 0 ) {
				stats.firstIndex = log[0].i;
			}
		}

		return this;
	}

	/**
	 * Marks given entry to be last one applied.
	 *
	 * This method never decreases index of last applied entry.
	 *
	 * @throws TypeError on providing malformed entry
	 * @throws RangeError on providing entry with index out of range
	 * @param {LogEntry} entry entry to be marked last applied
	 * @returns {Log} current instance
	 */
	markApplied( entry ) {
		// jshint -W018
		if ( !entry || typeof entry !== 'object' || !( parseInt( entry.t ) > 0 ) || !( parseInt( entry.i ) > 0 ) ) {
			throw new TypeError( 'malformed entry' );
		}

		const stats = this.stats;
		const index = parseInt( entry.i );

		if ( index > stats.lastAppliedIndex ) {
			if ( index > stats.lastIndex ) {
				throw new RangeError( 'entry index out of range' );
			}

			stats.lastAppliedIndex = entry.i;
			stats.lastAppliedTerm = entry.t;
		}

		return this;
	}

	/**
	 * Marks entry at given index to be last one applied.
	 *
	 * This method never decreases index of last applied entry.
	 *
	 * @throws TypeError on providing invalid index
	 * @throws RangeError on selecting entry not retained (anymore)
	 * @param {Number} index positive cluster-wide index of entry to mark
	 * @returns {Log} current instance
	 */
	markAppliedAtIndex( index ) {
		index = parseInt( index );
		if ( index > 0 ) {
			const stats = this.stats;

			if ( index > stats.lastAppliedIndex ) {
				const entry = this.atIndex( index );
				if ( entry ) {
					stats.lastAppliedIndex = entry.i;
					stats.lastAppliedTerm = entry.t;
				} else {
					throw new RangeError( 'no such retained log entry' );
				}
			}
		} else {
			throw new TypeError( 'invalid index' );
		}

		return this;
	}

	/**
	 * Restarts log dropping all previous information.
	 *
	 * @param {Array} entries
	 * @param {Number} lastIndex
	 * @param {Number} lastTerm
	 * @returns {Log}
	 */
	restart( entries, lastIndex = null, lastTerm = null ) {
		let foundTerm = 0,
			foundIndex = 0,
			foundFirstIndex = 0;

		for ( let i = 0, length = entries.length, previous = null; i < length; i++ ) {
			const entry = entries[i];

			if ( previous ) {
				// jshint -W018
				if ( entry.i !== previous.i + 1 || !( entry.t >= previous.t ) ) {
					throw new TypeError( 'invalid set of log entries' );
				}
			}

			previous = entry;

			if ( !foundFirstIndex ) {
				foundFirstIndex = entry.i;
			}

			foundIndex = entry.i;
			foundTerm = entry.t;
		}

		if ( !foundIndex && lastIndex ) {
			foundIndex = lastIndex;
		}
		if ( !foundTerm && lastTerm ) {
			foundTerm = lastTerm;
		}

		const logStats = this.stats;
		logStats.firstIndex = foundFirstIndex;
		logStats.lastIndex = foundIndex;
		logStats.lastTerm = foundTerm;
		logStats.committedIndex = foundIndex;
		logStats.lastAppliedIndex = foundIndex;
		logStats.lastAppliedTerm = foundTerm;

		this.entries = entries;

		return this;
	}
};

function cleanupEntry( entry ) {
	entry = Object.assign( {}, entry );
	if ( entry.c && entry.c.prefix ) {
		delete entry.c.prefix;

		// replace command in entry w/ copy w/o property `prefix` to prevent it
		// becoming slow object due to using `delete` operator before
		entry.c = Object.assign( {}, entry.c );
	}

	return entry;
}
