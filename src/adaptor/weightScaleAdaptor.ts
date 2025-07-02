import assert from 'node:assert';
import { ReadlineParser, SerialPort } from 'serialport';
import { logger } from '../core/logger';
import { type RetryOptions, withExponentialBackoff } from '../core/retryUtils';
import type { TerminalDevice } from '../core/types';
import type { ReadableDevice } from './deviceAdaptor';
import { KeepAliveHandler } from './keepAliveHandler';

export class WeightScaleAdapter implements ReadableDevice {
	private _device: SerialPort;
	private parser: ReadlineParser;
	private _isOpen = false;
	private dataCallbacks: Set<(data: Buffer | string) => void> = new Set();
	private dataHandler?: (data: string) => void;
	private retryOptions: Partial<RetryOptions>;
	private keepAliveHandler: KeepAliveHandler;

	constructor(
		public terminalDevice: TerminalDevice,
		retryOptions: Partial<RetryOptions> = {},
		keepAliveIntervalMs = 30000,
	) {
		logger.debug('Creating WeightScaleAdapter', {
			deviceId: terminalDevice.id,
			path: terminalDevice.path,
			baudRate: terminalDevice.meta.baudrate,
		});

		assert(
			terminalDevice.meta.deviceType === 'scale',
			'Terminal device is not a weight scale',
		);
		const path = terminalDevice.path;
		const baudRate = terminalDevice.meta.baudrate;
		assert(
			baudRate !== 'not-supported',
			'Weight scale does not support baudrate change',
		);
		this._device = new SerialPort({
			path,
			baudRate,
			endOnClose: true,
			autoOpen: false,
		});
		this.parser = this._device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
		this.retryOptions = retryOptions;
		this.keepAliveHandler = new KeepAliveHandler(this, keepAliveIntervalMs);

		logger.debug('WeightScaleAdapter created successfully', {
			deviceId: terminalDevice.id,
			path,
			baudRate,
			keepAliveIntervalMs,
			parserDelimiter: '\r\n',
		});
	}

	async open() {
		logger.debug('WeightScaleAdapter open called', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
			isOpen: this._isOpen,
			callbackCount: this.dataCallbacks.size,
		});

		if (this._isOpen) {
			logger.debug('Weight scale already open, returning early', {
				deviceId: this.terminalDevice.id,
			});
			return Promise.resolve();
		}

		logger.debug('Starting weight scale connection with retry logic', {
			deviceId: this.terminalDevice.id,
			retryOptions: this.retryOptions,
		});

		return withExponentialBackoff(async () => {
			return new Promise<void>((resolve, reject) => {
				logger.debug('Attempting to open weight scale serial port', {
					deviceId: this.terminalDevice.id,
					path: this.terminalDevice.path,
				});

				this._device.open((err) => {
					if (err) {
						logger.error('Failed to open weight scale serial port', {
							deviceId: this.terminalDevice.id,
							path: this.terminalDevice.path,
							error: err.message,
						});
						reject(err);
						return;
					}

					logger.debug('Weight scale serial port opened successfully', {
						deviceId: this.terminalDevice.id,
						path: this.terminalDevice.path,
					});

					// Set up parser to handle weight data
					this.dataHandler = (data: string) => {
						const weight = data.trim();
						logger.debug('Weight data received', {
							deviceId: this.terminalDevice.id,
							rawData: data,
							parsedWeight: weight || '[empty]',
							callbackCount: this.dataCallbacks.size,
						});

						if (weight && this.dataCallbacks.size > 0) {
							logger.debug('Processing weight through callbacks', {
								deviceId: this.terminalDevice.id,
								weight,
								callbackCount: this.dataCallbacks.size,
							});

							for (const callback of this.dataCallbacks) {
								try {
									callback(weight);
									logger.debug('Weight callback executed successfully', {
										deviceId: this.terminalDevice.id,
										weight,
									});
								} catch (error) {
									logger.error('Error in weight callback', {
										deviceId: this.terminalDevice.id,
										weight,
										error,
									});
								}
							}
						} else if (!weight) {
							logger.debug('Empty weight data received, skipping callbacks', {
								deviceId: this.terminalDevice.id,
							});
						} else {
							logger.debug('No callbacks registered for weight data', {
								deviceId: this.terminalDevice.id,
								weight,
							});
						}
					};
					this.parser.on('data', this.dataHandler);
					logger.debug('Data handler registered for weight scale parser', {
						deviceId: this.terminalDevice.id,
					});

					// Start keep-alive mechanism
					logger.debug('Starting keep-alive mechanism', {
						deviceId: this.terminalDevice.id,
					});
					this.keepAliveHandler.start();

					this._isOpen = true;
					logger.debug('Weight scale connection established successfully', {
						deviceId: this.terminalDevice.id,
						path: this.terminalDevice.path,
						callbackCount: this.dataCallbacks.size,
					});
					resolve();
				});
			});
		}, this.retryOptions);
	}

	async close() {
		logger.debug('WeightScaleAdapter close called', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
			isOpen: this._isOpen,
			callbackCount: this.dataCallbacks.size,
		});

		if (!this._isOpen) {
			logger.debug('Weight scale already closed, returning early', {
				deviceId: this.terminalDevice.id,
			});
			return Promise.resolve();
		}

		return new Promise<void>((resolve, _reject) => {
			logger.debug('Starting weight scale disconnection process', {
				deviceId: this.terminalDevice.id,
			});

			// Stop keep-alive mechanism
			logger.debug('Stopping keep-alive mechanism', {
				deviceId: this.terminalDevice.id,
			});
			this.keepAliveHandler.stop();

			// Remove data handler to prevent memory leaks
			if (this.dataHandler) {
				logger.debug('Removing data handler and parser listeners', {
					deviceId: this.terminalDevice.id,
				});
				this.parser.removeAllListeners('data');
				this.dataHandler = undefined;
			}

			logger.debug('Closing weight scale serial port', {
				deviceId: this.terminalDevice.id,
			});
			this._device.close(() => {
				this._isOpen = false;
				logger.debug('Weight scale connection closed successfully', {
					deviceId: this.terminalDevice.id,
					path: this.terminalDevice.path,
					preservedCallbacks: this.dataCallbacks.size,
				});
				resolve();
			});
		});
	}

	read(callback: (data: Buffer | string) => void) {
		logger.debug('Adding read callback to weight scale', {
			deviceId: this.terminalDevice.id,
			currentCallbackCount: this.dataCallbacks.size,
			isFunction: typeof callback === 'function',
		});

		if (typeof callback !== 'function') {
			logger.error('Invalid callback provided to weight scale read', {
				deviceId: this.terminalDevice.id,
				callbackType: typeof callback,
			});
			throw new Error('Read callback must be a function');
		}

		this.dataCallbacks.add(callback);
		logger.debug('Read callback added to weight scale', {
			deviceId: this.terminalDevice.id,
			totalCallbacks: this.dataCallbacks.size,
		});
	}

	onData(callback: (data: Buffer | string) => void) {
		logger.debug('Adding data callback to weight scale via onData', {
			deviceId: this.terminalDevice.id,
			currentCallbackCount: this.dataCallbacks.size,
		});

		this.dataCallbacks.add(callback);
		logger.debug('Data callback added to weight scale', {
			deviceId: this.terminalDevice.id,
			totalCallbacks: this.dataCallbacks.size,
		});
	}

	removeReadCallback(callback: (data: Buffer | string) => void) {
		const wasPresent = this.dataCallbacks.has(callback);
		this.dataCallbacks.delete(callback);
		logger.debug('Weight scale read callback removed', {
			deviceId: this.terminalDevice.id,
			wasPresent,
			remainingCallbacks: this.dataCallbacks.size,
		});
	}

	clearReadCallbacks() {
		const clearedCount = this.dataCallbacks.size;
		this.dataCallbacks.clear();
		logger.debug('All weight scale read callbacks cleared', {
			deviceId: this.terminalDevice.id,
			clearedCount,
		});
	}

	onError(callback: (error: Error | string) => void): void {
		logger.debug('Registering error callback for weight scale', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
		});

		// Wrap the callback to add logging
		const wrappedCallback = (error: Error | string) => {
			logger.error('Weight scale error occurred', {
				deviceId: this.terminalDevice.id,
				path: this.terminalDevice.path,
				error: error instanceof Error ? error.message : error,
				isOpen: this._isOpen,
				callbackCount: this.dataCallbacks.size,
			});
			callback(error);
		};

		this._device.on('error', wrappedCallback);
		logger.debug('Error callback registered for weight scale', {
			deviceId: this.terminalDevice.id,
		});
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	get device(): SerialPort {
		return this._device;
	}
}
