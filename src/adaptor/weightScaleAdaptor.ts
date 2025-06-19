import assert from 'node:assert';
import { ReadlineParser, SerialPort } from 'serialport';
import type { TerminalDevice } from '../core/types';
import type { ReadableDevice } from './deviceAdaptor';

export class WeightScaleAdapter implements ReadableDevice {
	private device: SerialPort;
	private parser: ReadlineParser;
	private isOpen = false;
	private dataCallbacks: Set<(data: Buffer | string) => void> = new Set();
	private dataHandler?: (data: string) => void;

	constructor(public terminalDevice: TerminalDevice) {
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
		this.device = new SerialPort({
			path,
			baudRate,
			endOnClose: true,
			autoOpen: false,
		});
		this.parser = this.device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
	}

	async open() {
		if (this.isOpen) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			this.device.open((err) => {
				if (err) {
					reject(err);
					return;
				}

				// Set up parser to handle weight data
				this.dataHandler = (data: string) => {
					const weight = data.trim();
					if (weight && this.dataCallbacks.size > 0) {
						for (const callback of this.dataCallbacks) {
							try {
								callback(weight);
							} catch (error) {
								console.error('Error in weight callback:', error);
							}
						}
					}
				};
				this.parser.on('data', this.dataHandler);

				this.isOpen = true;
				resolve();
			});
		});
	}

	async close() {
		if (!this.isOpen) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			// Remove data handler to prevent memory leaks
			if (this.dataHandler) {
				this.parser.removeAllListeners('data');
				this.dataHandler = undefined;
			}

			this.device.close((err) => {
				this.isOpen = false;
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	read(callback: (data: Buffer | string) => void) {
		if (typeof callback !== 'function') {
			throw new Error('Read callback must be a function');
		}
		this.dataCallbacks.add(callback);
	}

	onData(callback: (data: Buffer | string) => void) {
		this.dataCallbacks.add(callback);
	}

	removeReadCallback(callback: (data: Buffer | string) => void) {
		this.dataCallbacks.delete(callback);
	}

	clearReadCallbacks() {
		this.dataCallbacks.clear();
	}

	onError(callback: (error: Error | string) => void): void {
		this.device.on('error', callback);
	}
}
