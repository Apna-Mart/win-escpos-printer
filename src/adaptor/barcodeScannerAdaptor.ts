import assert from 'node:assert';
import { SerialPort } from 'serialport';
import type { TerminalDevice } from '../core/types';
import type { ReadableDevice } from './deviceAdaptor';

export class BarcodeScannerAdapter implements ReadableDevice {
	private device: SerialPort;
	private isOpen = false;
	private dataCallbacks: Set<(data: Buffer | string) => void> = new Set();
	private dataHandler?: (data: Buffer) => void;

	constructor(public terminalDevice: TerminalDevice) {
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
		this.device = new SerialPort({
			path,
			baudRate,
			endOnClose: true,
			autoOpen: false,
		});
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
				this.device.on('data', this.dataHandler);

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
				this.device.removeAllListeners('data');
				this.dataHandler = undefined;
			}

			this.device.close(() => {
				this.isOpen = false;
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
		this.device.on('error', callback);
	}
}
