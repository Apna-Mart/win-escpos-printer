import { ThermalPrinterAdapter } from './adaptor/thermalPrinterAdaptor';
import type { WritableDevice } from './adaptor/deviceAdaptor';
import type { DeviceManager } from './deviceManager';
import type { TerminalDevice } from './types';
import { saveDeviceConfig, updateDeviceConfig } from './deviceConfig';

export class PrinterManager {
	private deviceManager: DeviceManager;
	private printerAdapters = new Map<string, WritableDevice>();

	constructor(deviceManager: DeviceManager) {
		this.deviceManager = deviceManager;
		this.setupEventListeners();
	}

	async printToDevice(deviceId: string, data: string, isImage = false): Promise<boolean> {
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
				baudrate: 'not-supported'
			});

			if (!updatedConfig) {
				// Create new config if doesn't exist
				saveDeviceConfig(device.vid, device.pid, {
					deviceType: 'printer',
					baudrate: 'not-supported',
					setToDefault: false,
					brand: '',
					model: ''
				});
			}

			// Update device metadata
			device.meta = { ...device.meta, deviceType: 'printer', baudrate: 'not-supported' };
			device.capabilities = ['write'];
		}

		try {
			const adapter = new ThermalPrinterAdapter(device);
			
			adapter.onError((error) => {
				console.error(`Printer adapter error for ${device.id}:`, error);
				this.deviceManager.getEventEmitter().emitDeviceError(device.id, new Error(String(error)));
				this.closePrinterAdapter(device.id);
			});

			await adapter.open();
			this.printerAdapters.set(device.id, adapter);
			console.log(`Printer adapter created for ${device.id}`);
		} catch (error) {
			console.error(`Failed to create printer adapter for ${device.id}:`, error);
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

	private setupEventListeners(): void {
		// Auto-create printer adapters for devices with printer type and default flag
		this.deviceManager.onDeviceConnect(async (device) => {
			if (device.meta.deviceType === 'printer' && device.meta.setToDefault) {
				try {
					await this.ensurePrinterAdapter(device);
				} catch (error) {
					console.error(`Failed to auto-create printer adapter for ${device.id}:`, error);
				}
			}
		});

		// Clean up adapters when devices disconnect
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			await this.closePrinterAdapter(deviceId);
		});
	}
}