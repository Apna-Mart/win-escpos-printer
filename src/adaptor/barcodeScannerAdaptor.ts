import assert from 'node:assert';
import { SerialPort } from 'serialport';
import { logger } from '../core/logger';
import { type RetryOptions, withExponentialBackoff } from '../core/retryUtils';
import type { TerminalDevice } from '../core/types';
import type { ReadableDevice } from './deviceAdaptor';
import { KeepAliveHandler } from './keepAliveHandler';

export class BarcodeScannerAdapter implements ReadableDevice {
	private _device: SerialPort;
	private _isOpen = false;
	private dataCallbacks: Set<(data: Buffer | string) => void> = new Set();
	private dataHandler?: (data: Buffer) => void;
	private retryOptions: Partial<RetryOptions>;
	private keepAliveHandler: KeepAliveHandler;

	constructor(
		public terminalDevice: TerminalDevice,
		retryOptions: Partial<RetryOptions> = {},
		keepAliveIntervalMs = 30000,
	) {
		logger.debug('Creating BarcodeScannerAdapter', {
			deviceId: terminalDevice.id,
			deviceName: terminalDevice.name,
			deviceType: terminalDevice.meta.deviceType,
			path: terminalDevice.path,
			baudRate: terminalDevice.meta.baudrate,
			keepAliveIntervalMs,
			retryOptions,
		});

		assert(
			terminalDevice.meta.deviceType === 'scanner',
			'Terminal device is not a barcode scanner',
		);
		const path = terminalDevice.path;
		const baudRate = terminalDevice.meta.baudrate;
		assert(
			baudRate !== 'not-supported',
			'Barcode scanner does not support baudrate change',
		);
		this._device = new SerialPort({
			path,
			baudRate,
			endOnClose: true,
			autoOpen: false,
		});
		this.retryOptions = retryOptions;
		this.keepAliveHandler = new KeepAliveHandler(this, keepAliveIntervalMs);

		logger.debug('BarcodeScannerAdapter created successfully', {
			deviceId: terminalDevice.id,
			path,
			baudRate,
			keepAliveIntervalMs,
		});
	}

	async open() {
		logger.debug('BarcodeScannerAdapter open called', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
			isOpen: this._isOpen,
			callbackCount: this.dataCallbacks.size,
		});

		if (this._isOpen) {
			logger.debug('Scanner already open, returning early', {
				deviceId: this.terminalDevice.id,
			});
			return Promise.resolve();
		}

		logger.debug('Starting scanner connection with retry logic', {
			deviceId: this.terminalDevice.id,
			retryOptions: this.retryOptions,
		});

		return withExponentialBackoff(async () => {
			return new Promise<void>((resolve, reject) => {
				logger.debug('Attempting to open scanner serial port', {
					deviceId: this.terminalDevice.id,
					path: this.terminalDevice.path,
				});

				this._device.open((err) => {
					if (err) {
						logger.error('Failed to open scanner serial port', {
							deviceId: this.terminalDevice.id,
							path: this.terminalDevice.path,
							error: err.message,
						});
						reject(err);
						return;
					}

					logger.debug('Scanner serial port opened successfully', {
						deviceId: this.terminalDevice.id,
						path: this.terminalDevice.path,
					});

					// Set up parser to handle scanned barcodes
					this.dataHandler = (data: Buffer) => {
						const barcode = data.toString().trim();
						if(barcode === '\u0015') return;
						logger.debug('Barcode data received', {
							deviceId: this.terminalDevice.id,
							rawDataLength: data.length,
							barcode: barcode || '[empty]',
							callbackCount: this.dataCallbacks.size,
						});

						if (barcode && this.dataCallbacks.size > 0) {
							logger.debug('Processing barcode through callbacks', {
								deviceId: this.terminalDevice.id,
								barcode,
								callbackCount: this.dataCallbacks.size,
							});

							for (const callback of this.dataCallbacks) {
								try {
									callback(barcode);
									logger.debug('Barcode callback executed successfully', {
										deviceId: this.terminalDevice.id,
										barcode,
									});
								} catch (error) {
									logger.error('Error in barcode callback', {
										deviceId: this.terminalDevice.id,
										barcode,
										error,
									});
								}
							}
						} else if (!barcode) {
							logger.debug('Empty barcode received, skipping callbacks', {
								deviceId: this.terminalDevice.id,
							});
						} else {
							logger.debug('No callbacks registered for barcode data', {
								deviceId: this.terminalDevice.id,
								barcode,
							});
						}
					};
					this._device.on('data', this.dataHandler);
					logger.debug('Data handler registered for scanner', {
						deviceId: this.terminalDevice.id,
					});

					// Start keep-alive mechanism
					logger.debug('Starting keep-alive mechanism', {
						deviceId: this.terminalDevice.id,
					});
					this.keepAliveHandler.start();

					this._isOpen = true;
					logger.debug('Scanner connection established successfully', {
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
		logger.debug('BarcodeScannerAdapter close called', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
			isOpen: this._isOpen,
			callbackCount: this.dataCallbacks.size,
		});

		if (!this._isOpen) {
			logger.debug('Scanner already closed, returning early', {
				deviceId: this.terminalDevice.id,
			});
			return Promise.resolve();
		}

		return new Promise<void>((resolve, _reject) => {
			logger.debug('Starting scanner disconnection process', {
				deviceId: this.terminalDevice.id,
			});

			// Stop keep-alive mechanism
			logger.debug('Stopping keep-alive mechanism', {
				deviceId: this.terminalDevice.id,
			});
			this.keepAliveHandler.stop();

			// Remove data handler to prevent memory leaks
			if (this.dataHandler) {
				logger.debug('Removing data handler and event listeners', {
					deviceId: this.terminalDevice.id,
				});
				this._device.removeAllListeners('data');
				this.dataHandler = undefined;
			}

			logger.debug('Closing scanner serial port', {
				deviceId: this.terminalDevice.id,
			});
			this._device.close(() => {
				this._isOpen = false;
				logger.debug('Scanner connection closed successfully', {
					deviceId: this.terminalDevice.id,
					path: this.terminalDevice.path,
					preservedCallbacks: this.dataCallbacks.size,
				});
				resolve();
			});
		});
	}

	read(callback: (data: Buffer | string) => void) {
		logger.debug('Adding read callback to scanner', {
			deviceId: this.terminalDevice.id,
			currentCallbackCount: this.dataCallbacks.size,
			isFunction: typeof callback === 'function',
		});

		if (typeof callback !== 'function') {
			logger.error('Invalid callback provided to scanner read', {
				deviceId: this.terminalDevice.id,
				callbackType: typeof callback,
			});
			throw new Error('Read callback must be a function');
		}

		this.dataCallbacks.add(callback);
		logger.debug('Read callback added to scanner', {
			deviceId: this.terminalDevice.id,
			totalCallbacks: this.dataCallbacks.size,
		});
	}

	removeReadCallback(callback: (data: Buffer | string) => void) {
		const wasPresent = this.dataCallbacks.has(callback);
		this.dataCallbacks.delete(callback);
		logger.debug('Scanner read callback removed', {
			deviceId: this.terminalDevice.id,
			wasPresent,
			remainingCallbacks: this.dataCallbacks.size,
		});
	}

	clearReadCallbacks() {
		const clearedCount = this.dataCallbacks.size;
		this.dataCallbacks.clear();
		logger.debug('All scanner read callbacks cleared', {
			deviceId: this.terminalDevice.id,
			clearedCount,
		});
	}

	onError(callback: (error: Error | string) => void): void {
		logger.debug('Registering error callback for scanner', {
			deviceId: this.terminalDevice.id,
			path: this.terminalDevice.path,
		});

		// Wrap the callback to add logging
		const wrappedCallback = (error: Error | string) => {
			logger.error('Scanner error occurred', {
				deviceId: this.terminalDevice.id,
				path: this.terminalDevice.path,
				error: error instanceof Error ? error.message : error,
				isOpen: this._isOpen,
				callbackCount: this.dataCallbacks.size,
			});
			callback(error);
		};

		this._device.on('error', wrappedCallback);
		logger.debug('Error callback registered for scanner', {
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
