import assert from 'node:assert';
import { Image, Printer } from '@node-escpos/core';
import type USBAdapter from '@node-escpos/usb-adapter';
import USB from '@node-escpos/usb-adapter';
import type { TerminalDevice } from '../core/types';
import type { WritableDevice } from './deviceAdaptor';

export class UnixPrinterAdapter implements WritableDevice {
	private readonly device: USBAdapter;
	private printer: Printer<[]>;

	constructor(public terminalDevice: TerminalDevice) {
		assert(
			terminalDevice.meta.deviceType === 'printer',
			'Terminal device is not a thermal printer',
		);
		assert(
			process.platform !== 'win32',
			'UnixPrinterAdapter cannot be used on Windows',
		);

		this.device = new USB(
			Number.parseInt(terminalDevice.vid.replace('0x', '')),
		);
		this.printer = new Printer(this.device, { encoding: 'GB18030' });
	}

	async open(): Promise<void> {
		// Stub implementation - actual connection happens in write()
	}

	async close(): Promise<void> {
		// Stub implementation - connection is closed after each write()
	}

	async write(data: string, isImage: boolean): Promise<void> {
		// Open connection
		await new Promise<void>((resolve, reject) => {
			this.device.open((err: Error | null) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});

		try {
			if (!isImage) {
				this.printer.text(data);
				this.printer.text('\n');
				this.printer.cut(true);
			} else {
				const image = await Image.load(data);
				this.printer.align('ct').raster(image, 'normal');
				this.printer.println('\n').cut(true);
			}
		} finally {
			// Always close connection after write
			await this.printer.close();
		}
	}

	onError(callback: (error: Error | string) => void): void {
		this.device.on('error', callback);
	}
}