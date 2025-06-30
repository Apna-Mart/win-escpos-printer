import assert from 'node:assert';
import { logger } from '../core/logger';
import type { TerminalDevice } from '../core/types';
import { EscPosCommands, ThermalWindowPrinter } from '../core/windows_printer';
import type { WritableDevice } from './deviceAdaptor';

export class WindowsPrinterAdapter implements WritableDevice {
	constructor(public terminalDevice: TerminalDevice) {
		logger.debug('Creating WindowsPrinterAdapter', {
			deviceId: terminalDevice.id,
			deviceName: terminalDevice.name,
			deviceType: terminalDevice.meta.deviceType,
			platform: process.platform,
		});

		assert(
			terminalDevice.meta.deviceType === 'printer',
			'Terminal device is not a thermal printer',
		);
		assert(
			process.platform === 'win32',
			'WindowsPrinterAdapter can only be used on Windows',
		);

		logger.debug('WindowsPrinterAdapter created successfully', {
			deviceId: terminalDevice.id,
			printerName: terminalDevice.name,
		});
	}

	async open(): Promise<void> {
		logger.debug('WindowsPrinterAdapter open called', {
			deviceId: this.terminalDevice.id,
			printerName: this.terminalDevice.name,
		});
		// Stub implementation - actual connection happens in write()
		logger.debug(
			'WindowsPrinterAdapter opened (connection deferred to write operation)',
		);
	}

	async close(): Promise<void> {
		logger.debug('WindowsPrinterAdapter close called', {
			deviceId: this.terminalDevice.id,
			printerName: this.terminalDevice.name,
		});
		// Stub implementation - connection is closed after each write()
		logger.debug('WindowsPrinterAdapter closed (no persistent connection)');
	}

	async write(data: string, isImage: boolean): Promise<void> {
		logger.debug('Starting Windows print operation', {
			deviceId: this.terminalDevice.id,
			printerName: this.terminalDevice.name,
			isImage,
			dataLength: data.length,
			dataPreview: isImage
				? '[Base64 Image Data]'
				: data.substring(0, 100) + (data.length > 100 ? '...' : ''),
		});

		try {
			logger.debug('Creating ThermalWindowPrinter instance', {
				printerName: this.terminalDevice.name,
			});
			const printer = new ThermalWindowPrinter(this.terminalDevice.name);

			if (!isImage) {
				logger.debug('Printing text content', {
					printerName: this.terminalDevice.name,
					textLength: data.length,
				});
				printer.printText(data);
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.printText('\n');
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.print(EscPosCommands.CUT);
				logger.debug('Text printing commands sent successfully');
			} else {
				logger.debug('Printing image content', {
					printerName: this.terminalDevice.name,
					imageDataLength: data.length,
				});
				printer.print(EscPosCommands.ALIGN_CENTER);
				await printer.printImageFromBase64(data, {
					width: 576,
					dither: true,
					threshold: 180,
				});
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.printText('\n');
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.print(EscPosCommands.CUT);
				logger.debug('Image printing commands sent successfully', {
					width: 576,
					dither: true,
					threshold: 180,
				});
			}

			logger.debug('Closing printer connection');
			printer.close();
			logger.debug('Windows print operation completed successfully', {
				deviceId: this.terminalDevice.id,
				printerName: this.terminalDevice.name,
				isImage,
				dataLength: data.length,
			});
		} catch (e) {
			const error = e as Error;
			logger.error('Windows print operation failed', {
				deviceId: this.terminalDevice.id,
				printerName: this.terminalDevice.name,
				isImage,
				error: error.message,
				errorStack: error.stack,
			});
			throw new Error(`Printer error: ${error.message}`);
		}
	}

	onError(_callback: (error: Error | string) => void): void {
		logger.debug('Error callback registered for Windows printer adapter', {
			deviceId: this.terminalDevice.id,
			printerName: this.terminalDevice.name,
		});
		// Windows printer doesn't have persistent error events since connections are per-operation
		logger.debug(
			'Windows printer adapter uses per-operation connections, no persistent error monitoring',
		);
	}
}
