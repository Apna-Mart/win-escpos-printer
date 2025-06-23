import assert from 'node:assert';
import type { TerminalDevice } from '../core/types';
import { EscPosCommands, ThermalWindowPrinter } from '../core/windows_printer';
import type { WritableDevice } from './deviceAdaptor';

export class WindowsPrinterAdapter implements WritableDevice {
	constructor(public terminalDevice: TerminalDevice) {
		assert(
			terminalDevice.meta.deviceType === 'printer',
			'Terminal device is not a thermal printer',
		);
		assert(
			process.platform === 'win32',
			'WindowsPrinterAdapter can only be used on Windows',
		);
	}

	async open(): Promise<void> {
		// Stub implementation - actual connection happens in write()
	}

	async close(): Promise<void> {
		// Stub implementation - connection is closed after each write()
	}

	async write(data: string, isImage: boolean): Promise<void> {
		try {
			const printer = new ThermalWindowPrinter(this.terminalDevice.name);

			if (!isImage) {
				printer.printText(data);
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.printText('\n');
				printer.print(EscPosCommands.ALIGN_CENTER);
				printer.print(EscPosCommands.CUT);
			} else {
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
			}

			printer.close();
		} catch (e) {
			throw new Error('Printer error: ' + (e as Error).message);
		}
	}

	onError(callback: (error: Error | string) => void): void {
		// Windows printer doesn't have persistent error events since connections are per-operation
	}
}
