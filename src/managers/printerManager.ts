import type { WritableDevice } from '../adaptor/deviceAdaptor';
import { createPrinterAdapter } from '../adaptor/printerAdapterFactory';
import { saveDeviceConfig, updateDeviceConfig } from '../core/deviceConfig';
import { logger } from '../core/logger';
import type { TerminalDevice } from '../core/types';
import type { DeviceManager } from './deviceManager';

export class PrinterManager {
	private deviceManager: DeviceManager;
	private printerAdapters = new Map<string, WritableDevice>();

	constructor(deviceManager: DeviceManager) {
		this.deviceManager = deviceManager;
		logger.debug('PrinterManager initialized');
		this.setupEventListeners();
	}

	async printToDevice(
		deviceId: string,
		data: string,
		isImage = false,
	): Promise<boolean> {
		logger.debug('Print request initiated', {
			deviceId,
			dataLength: data.length,
			isImage,
		});

		const device = this.deviceManager.getDevice(deviceId);
		if (!device) {
			logger.error('Print failed - device not found', { deviceId });
			throw new Error(`Device ${deviceId} not found`);
		}

		if (device.meta.deviceType !== 'printer') {
			logger.error('Print failed - device is not a printer', {
				deviceId,
				deviceType: device.meta.deviceType,
			});
			throw new Error(`Device ${deviceId} is not a printer`);
		}

		try {
			await this.ensurePrinterAdapter(device);
			const adapter = this.printerAdapters.get(deviceId);
			if (!adapter) {
				throw new Error(`Failed to create printer adapter for ${deviceId}`);
			}

			logger.debug('Sending data to printer', {
				deviceId,
				dataLength: data.length,
				isImage,
			});
			await adapter.write(data, isImage);
			logger.debug('Print completed successfully', {
				deviceId,
				dataLength: data.length,
				isImage,
			});
			return true;
		} catch (error) {
			logger.error('Print operation failed', { deviceId, error });
			throw error;
		}
	}

	async printToDefault(data: string, isImage = false): Promise<boolean> {
		logger.debug('Print to default printer request', {
			dataLength: data.length,
			isImage,
		});

		const defaultPrinter = this.deviceManager.getDefaultDevice('printer');
		if (!defaultPrinter) {
			logger.error('Print to default failed - no default printer available');
			throw new Error('No default printer found');
		}

		logger.debug('Using default printer', { deviceId: defaultPrinter.id });
		return this.printToDevice(defaultPrinter.id, data, isImage);
	}

	async ensurePrinterAdapter(device: TerminalDevice): Promise<void> {
		if (this.printerAdapters.has(device.id)) {
			logger.debug('Printer adapter already exists', { deviceId: device.id });
			return; // Adapter already exists
		}

		logger.debug('Creating printer adapter', {
			deviceId: device.id,
			currentType: device.meta.deviceType,
		});

		// Auto-configure device as printer if not already configured
		if (device.meta.deviceType !== 'printer') {
			logger.info('Auto-configuring device as printer', {
				deviceId: device.id,
				previousType: device.meta.deviceType,
			});
			const updatedConfig = updateDeviceConfig(device.vid, device.pid, {
				deviceType: 'printer',
				baudrate: 'not-supported',
			});

			if (!updatedConfig) {
				// Create new config if doesn't exist
				logger.debug('Creating new printer configuration', {
					vid: device.vid,
					pid: device.pid,
				});
				saveDeviceConfig(device.vid, device.pid, {
					deviceType: 'printer',
					baudrate: 'not-supported',
					setToDefault: false,
					brand: '',
					model: '',
				});
			} else {
				logger.debug('Updated existing device configuration', {
					vid: device.vid,
					pid: device.pid,
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
			logger.debug('Creating printer adapter instance', {
				deviceId: device.id,
				vid: device.vid,
				pid: device.pid,
			});
			const adapter = createPrinterAdapter(device);

			adapter.onError((error) => {
				logger.error('Printer adapter error', { deviceId: device.id, error });
				this.deviceManager
					.getEventEmitter()
					.emitDeviceError(device.id, new Error(String(error)));
				// Don't close here - let device disconnect event handle cleanup
			});

			logger.debug('Opening printer adapter connection', {
				deviceId: device.id,
			});
			await adapter.open();
			this.printerAdapters.set(device.id, adapter);
			logger.debug('Printer adapter created successfully', {
				deviceId: device.id,
				vid: device.vid,
				pid: device.pid,
			});
		} catch (error) {
			logger.error('Failed to create printer adapter', {
				deviceId: device.id,
				error,
			});
			throw error;
		}
	}

	async closePrinterAdapter(deviceId: string): Promise<void> {
		const adapter = this.printerAdapters.get(deviceId);
		if (adapter) {
			logger.debug('Closing printer adapter', { deviceId });
			try {
				await adapter.close();
				logger.debug('Printer adapter closed successfully', { deviceId });
			} catch (error) {
				logger.error('Error closing printer adapter', { deviceId, error });
			}
			this.printerAdapters.delete(deviceId);
		} else {
			logger.debug('No printer adapter to close', { deviceId });
		}
	}

	async closeAllPrinterAdapters(): Promise<void> {
		const adapters = Array.from(this.printerAdapters.keys());
		logger.debug('Closing all printer adapters', { count: adapters.length });
		for (const deviceId of adapters) {
			await this.closePrinterAdapter(deviceId);
		}
		logger.info('All printer adapters closed', { count: adapters.length });
	}

	getPrinterDevices(): TerminalDevice[] {
		const devices = this.deviceManager.getDevicesByType('printer');
		logger.debug('Retrieved printer devices', { count: devices.length });
		return devices;
	}

	getDefaultPrinter(): TerminalDevice | undefined {
		const defaultPrinter = this.deviceManager.getDefaultDevice('printer');
		logger.debug('Retrieved default printer', {
			deviceId: defaultPrinter?.id || 'none',
		});
		return defaultPrinter;
	}

	async testPrint(): Promise<{ success: boolean; error?: string }> {
		logger.info('Test print initiated');
		try {
			// Find default printer device
			const printerDevice = this.deviceManager.getDefaultDevice('printer');

			if (!printerDevice) {
				logger.error('Test print failed - no default printer found');
				throw new Error('No default printer found');
			}

			logger.info('Starting test print', {
				deviceId: printerDevice.id,
				brand: printerDevice.meta?.brand,
				model: printerDevice.meta?.model,
			});

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
			logger.debug('Sending test content to printer', {
				deviceId: printerDevice.id,
				contentLength: testContent.length,
			});
			await this.printToDevice(printerDevice.id, testContent, false);

			logger.debug('Test print completed successfully', {
				deviceId: printerDevice.id,
			});
			return { success: true };
		} catch (error) {
			logger.error('Test print failed', { error });
			return { success: false, error: `Test print failed: ${error}` };
		}
	}

	private setupEventListeners(): void {
		logger.debug('Setting up PrinterManager event listeners');

		// Auto-create printer adapters for devices with printer type and default flag
		this.deviceManager.onDeviceConnect(async (device) => {
			if (device.meta.deviceType === 'printer' && device.meta.setToDefault) {
				logger.debug('Auto-creating printer adapter for default printer', {
					deviceId: device.id,
				});
				try {
					await this.ensurePrinterAdapter(device);
					logger.debug('Auto-created printer adapter successfully', {
						deviceId: device.id,
					});
				} catch (error) {
					logger.error('Failed to auto-create printer adapter', {
						deviceId: device.id,
						error,
					});
				}
			} else if (device.meta.deviceType === 'printer') {
				logger.debug('Printer device connected but not set as default', {
					deviceId: device.id,
				});
			}
		});

		// Clean up adapters when devices disconnect
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			logger.debug('Device disconnected, cleaning up printer adapter', {
				deviceId,
			});
			await this.closePrinterAdapter(deviceId);
		});
	}
}
