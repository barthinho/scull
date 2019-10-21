"use strict";

const Debug = require( "debug" );


const DebugLog = Debug( "scull:timer" );
const ErrorLog = Debug( "scull:timer" );


const DEFAULT_OPTIONS = {
	min: 100,
	max: 200,
	logTimeouts: false,
};


/**
 * Implements timeout detector invoking provided timeout handler when random
 * time (in range given in options) elapsed.
 *
 * @type {Timer}
 * @name Timer
 * @property {function} onTimeout provided timeout handler
 * @property {{min:Number, max:Number}} options
 * @property {Boolean} enabled indicates/controls if current timeout detector is enabled or suspended
 */
module.exports = class Timer {
	/**
	 * @param {function} timeoutHandler callback to be invoked on timer running out
	 * @param {{min:Number, max:Number}|Number} optionsOrFixedTimeout range of random delay or some fixed delay in ms
	 */
	constructor( timeoutHandler, optionsOrFixedTimeout ) {
		let timer = null;

		const fixed = parseInt( optionsOrFixedTimeout );
		const _options = fixed > 0 ? {
			min: fixed,
			max: fixed,
		} : optionsOrFixedTimeout;

		const options = Object.seal( Object.assign( {}, DEFAULT_OPTIONS, _options ) );

		let started = null;


		Object.defineProperties( this, {
			onTimeout: { value: timeoutHandler },
			options: { value: options },
			enabled: {
				get: () => Boolean( timer ),
				set: enable => {
					const _enable = Boolean( enable );
					const enabled = Boolean( timer );

					if ( _enable !== enabled ) {
						if ( _enable ) {
							timer = setTimeout( () => {
								timer = null;

								if ( optionsOrFixedTimeout.logTimeouts ) {
									DebugLog( `${options.label || "unnamed"} timer elapsed after ${Date.now() - started}ms` );
								}

								timeoutHandler();
							}, this.getRandomTimeout() );

							started = Date.now();
						} else {
							clearTimeout( timer );
							timer = null;
						}
					}
				}
			},
			elapsed: { get: () => ( timer ? Date.now() - started : Infinity ) },
		} );
	}

	/**
	 * Gets random timeout value according to range configured in options.
	 *
	 * @returns {Number} number of milliseconds
	 */
	getRandomTimeout() {
		const { min, max } = this.options;

		return min + Math.round( Math.random() * ( max - min ) );
	}

	/**
	 * Restarts timeout detector.
	 *
	 * Timer gets re-enabled implicitly if it has been disabled before.
	 *
	 * @returns {void}
	 */
	restart() {
		this.enabled = false;
		this.enabled = true;
	}

	/**
	 * Halts timer.
	 *
	 * @returns {void}
	 */
	halt() {
		this.enabled = false;
	}

	/**
	 * Instantly triggers attached timeout handler.
	 *
	 * @returns {void}
	 */
	trigger() {
		if ( this.enabled ) {
			this.enabled = false;
			this.enabled = true;
		}

		process.nextTick( () => {
			try {
				this.onTimeout();
			} catch ( e ) {
				ErrorLog( `triggering timeout handler failed: %s`, e.stack );
			}
		} );
	}
};
