import assert from 'node:assert';
import { SerialPort } from 'serialport';
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
	}

	async open() {
		if (this._isOpen) {
			return Promise.resolve();
		}

		return withExponentialBackoff(async () => {
			return new Promise<void>((resolve, reject) => {
				this._device.open((err) => {
					if (err) {
						reject(err);
						return;
					}

					// Set up parser to handle scanned barcodes
					this.dataHandler = (data: Buffer) => {
						const barcode = data.toString().trim();
						if (barcode && this.dataCallbacks.size > 0) {
							for (const callback of this.dataCallbacks) {
								try {
									callback(barcode);
								} catch (error) {
									console.error('Error in barcode callback:', error);
								}
							}
						}
					};
					this._device.on('data', this.dataHandler);

					// Start keep-alive mechanism
					this.keepAliveHandler.start();

					this._isOpen = true;
					resolve();
				});
			});
		}, this.retryOptions);
	}

	async close() {
		if (!this._isOpen) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, _reject) => {
			// Stop keep-alive mechanism
			this.keepAliveHandler.stop();

			// Remove data handler to prevent memory leaks
			if (this.dataHandler) {
				this._device.removeAllListeners('data');
				this.dataHandler = undefined;
			}

			this._device.close(() => {
				this._isOpen = false;
				resolve();
			});
		});
	}

	read(callback: (data: Buffer | string) => void) {
		if (typeof callback !== 'function') {
			throw new Error('Read callback must be a function');
		}
		this.dataCallbacks.add(callback);
	}

	removeReadCallback(callback: (data: Buffer | string) => void) {
		this.dataCallbacks.delete(callback);
	}

	clearReadCallbacks() {
		this.dataCallbacks.clear();
	}

	onError(callback: (error: Error | string) => void): void {
		this._device.on('error', callback);
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	get device(): SerialPort {
		return this._device;
	}
}
