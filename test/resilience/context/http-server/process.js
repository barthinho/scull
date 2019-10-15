"use strict";

const { fork } = require( "child_process" );
const { EventEmitter } = require( "events" );
const Path = require( "path" );

const Split = require( "split" );


/**
 * Manages sub-process for running single node in a scull cluster exposing API
 * for reading/writing values from/to cluster via HTTP.
 *
 */
class HttpServerNode extends EventEmitter {
	/**
	 * @param {int} port port number node shall expose its skull listener, HTTP will be listening on succeeding port
	 * @param {object} options options passed to invoked server process
	 */
	constructor( port, options = {} ) {
		super();

		let exiting = false;

		Object.defineProperties( this, {
			/**
			 * Describes port number HTTP server in started sub-process shall be
			 * listen on for requests.
			 *
			 * @name HttpServerNode#port
			 * @property {int} port number
			 * @readonly
			 */
			port: { value: port },

			/**
			 * Describes options passed in arguments to started sub-process.
			 *
			 * @name HttpServerNode#options
			 * @property {Object}
			 * @readonly
			 */
			options: { value: options },

			/**
			 * Marks if this node has been requested to shutdown before.
			 *
			 * @name HttpServerNode#exiting
			 * @property {boolean} true if node has been requested to shutdown before
			 */
			exiting: {
				get: () => exiting,
				set: () => {
					exiting = true;
				},
			},
		} );
	}

	/**
	 * Starts server for this test node in a sub-process.
	 *
	 * @returns {Promise} promises sub-process started successfully
	 */
	start() {
		return new Promise( ( resolve, reject ) => {
			/**
			 * @name HttpServerNode#_child
			 * @type {ChildProcess}
			 * @protected
			 */
			this._child = fork( Path.join( __dirname, "code.js" ), [
				this.port,
				JSON.stringify( this.options ),
			], {
				silent: true,
				// env: { DEBUG: "scull:heartbeat" },
			} );

			let warned = false;

			// pass output of current node adding some identifying prefix to every line
			[ "stdout", "stderr" ]
				.forEach( channel => {
					this._child[channel]
						.pipe( Split() )
						.on( "data", line => {
							line = line.trim();
							if ( line ) {
								process[channel].write( `${this.port} (${this._child.pid}): ${line}\n` );

								if ( channel === "stderr" && !warned ) {
									warned = true;
									this.emit( "warning" );
								}
							}
						} );
				} );

			this._child.stdout
				.pipe( Split() )
				.once( "data", line => {
					if ( line.match( /started/ ) ) {
						resolve();
						return;
					}

					if ( this.exiting ) {
						resolve();
						return;
					}

					reject( new Error( `Could not start child, first line of output was: ${line}` ) );
				} );

			this._child
				.once( "exit", ( code, signal ) => {
					if ( !this.exiting ) {
						this.emit( "error", new Error( `child at port ${this.port} exited unexpectedly, code = ${code}, signal = ${signal}` ) );
					}
				} );
		} );
	}

	/**
	 * Stops running sub-process.
	 *
	 * @returns {Promise} promises sub-process stopped successfully
	 */
	stop() {
		return new Promise( resolve => {
			this.exiting = true;

			this._child.once( "exit", resolve );
			this._child.kill();
		} );
	}
}


module.exports = HttpServerNode;
