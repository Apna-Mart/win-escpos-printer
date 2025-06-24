import type { WritableDevice } from '../adaptor/deviceAdaptor';
import { createPrinterAdapter } from '../adaptor/printerAdapterFactory';
import { saveDeviceConfig, updateDeviceConfig } from '../core/deviceConfig';
import type { TerminalDevice } from '../core/types';
import type { DeviceManager } from './deviceManager';

export class PrinterManager {
	private deviceManager: DeviceManager;
	private printerAdapters = new Map<string, WritableDevice>();

	constructor(deviceManager: DeviceManager) {
		this.deviceManager = deviceManager;
		this.setupEventListeners();
	}

	async printToDevice(
		deviceId: string,
		data: string,
		isImage = false,
	): Promise<boolean> {
		const device = this.deviceManager.getDevice(deviceId);
		if (!device || device.meta.deviceType !== 'printer') {
			throw new Error(`Device ${deviceId} is not a printer or not found`);
		}

		try {
			await this.ensurePrinterAdapter(device);
			const adapter = this.printerAdapters.get(deviceId);
			if (!adapter) {
				throw new Error(`Failed to create printer adapter for ${deviceId}`);
			}

			await adapter.write(data, isImage);
			return true;
		} catch (error) {
			console.error(`Print failed for device ${deviceId}:`, error);
			throw error;
		}
	}

	async printToDefault(data: string, isImage = false): Promise<boolean> {
		const defaultPrinter = this.deviceManager.getDefaultDevice('printer');
		if (!defaultPrinter) {
			throw new Error('No default printer found');
		}

		return this.printToDevice(defaultPrinter.id, data, isImage);
	}

	async ensurePrinterAdapter(device: TerminalDevice): Promise<void> {
		if (this.printerAdapters.has(device.id)) {
			return; // Adapter already exists
		}

		// Auto-configure device as printer if not already configured
		if (device.meta.deviceType !== 'printer') {
			const updatedConfig = updateDeviceConfig(device.vid, device.pid, {
				deviceType: 'printer',
				baudrate: 'not-supported',
			});

			if (!updatedConfig) {
				// Create new config if doesn't exist
				saveDeviceConfig(device.vid, device.pid, {
					deviceType: 'printer',
					baudrate: 'not-supported',
					setToDefault: false,
					brand: '',
					model: '',
				});
			}

			// Update device metadata
			device.meta = {
				...device.meta,
				deviceType: 'printer',
				baudrate: 'not-supported',
			};
			device.capabilities = ['write'];
		}

		try {
			const adapter = createPrinterAdapter(device);

			adapter.onError((error) => {
				console.error(`Printer adapter error for ${device.id}:`, error);
				this.deviceManager
					.getEventEmitter()
					.emitDeviceError(device.id, new Error(String(error)));
				// Don't close here - let device disconnect event handle cleanup
			});

			await adapter.open();
			this.printerAdapters.set(device.id, adapter);
			console.log(`Printer adapter created for ${device.id}`);
		} catch (error) {
			console.error(
				`Failed to create printer adapter for ${device.id}:`,
				error,
			);
			throw error;
		}
	}

	async closePrinterAdapter(deviceId: string): Promise<void> {
		const adapter = this.printerAdapters.get(deviceId);
		if (adapter) {
			try {
				await adapter.close();
			} catch (error) {
				console.error(`Error closing printer adapter for ${deviceId}:`, error);
			}
			this.printerAdapters.delete(deviceId);
		}
	}

	async closeAllPrinterAdapters(): Promise<void> {
		const adapters = Array.from(this.printerAdapters.keys());
		for (const deviceId of adapters) {
			await this.closePrinterAdapter(deviceId);
		}
	}

	getPrinterDevices(): TerminalDevice[] {
		return this.deviceManager.getDevicesByType('printer');
	}

	getDefaultPrinter(): TerminalDevice | undefined {
		return this.deviceManager.getDefaultDevice('printer');
	}

	async testPrint(): Promise<{ success: boolean; error?: string }> {
		try {
			// Find default printer device
			const printerDevice = this.deviceManager.getDefaultDevice('printer');

			if (!printerDevice) {
				throw new Error('No default scanner found');
			}

			console.log(`Starting test print on device: ${printerDevice.id}`);

			// Create test receipt content
			const testContent = `
================================
         TEST PRINT
================================
Date: ${new Date().toLocaleString()}
Device: ${printerDevice.meta?.brand || 'Unknown'} ${printerDevice.meta?.model || ''}
Status: Print test successful

This is a test print to verify
that your printer is working
correctly.

Thank you!
================================


`;

			// Use existing printToDevice method
			await this.printToDevice(printerDevice.id, testContent, false);

			console.log(
				`Test print completed successfully on device: ${printerDevice.id}`,
			);
			return { success: true };
		} catch (error) {
			console.error(`Error in testPrint: ${error}`);
			return { success: false, error: `Test print failed: ${error}` };
		}
	}

	private setupEventListeners(): void {
		// Auto-create printer adapters for devices with printer type and default flag
		this.deviceManager.onDeviceConnect(async (device) => {
			if (device.meta.deviceType === 'printer' && device.meta.setToDefault) {
				try {
					await this.ensurePrinterAdapter(device);
				} catch (error) {
					console.error(
						`Failed to auto-create printer adapter for ${device.id}:`,
						error,
					);
				}
			}
		});

		// Clean up adapters when devices disconnect
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			await this.closePrinterAdapter(deviceId);
		});
	}
}
