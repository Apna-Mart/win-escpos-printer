import { BarcodeScannerAdapter } from './adaptor/barcodeScannerAdaptor';
import type { ReadableDevice } from './adaptor/deviceAdaptor';
import type { DeviceManager } from './deviceManager';
import type { TerminalDevice, BaudRate } from './types';
import { updateDeviceConfig } from './deviceConfig';

export type ScanDataCallback = (data: string) => void;

export class ScannerManager {
	private deviceManager: DeviceManager;
	private scannerAdapters = new Map<string, ReadableDevice>();
	private activeScanners = new Set<string>(); // Track which devices are actively scanning
	private persistentCallbacks = new Map<string, ScanDataCallback[]>(); // Device-specific persistent callbacks
	private defaultScannerCallbacks: ScanDataCallback[] = []; // Default scanner callbacks
	private globalScanCallbacks: ScanDataCallback[] = []; // Global scan callbacks

	constructor(deviceManager: DeviceManager) {
		this.deviceManager = deviceManager;
		this.setupEventListeners();
	}

	async scanFromDevice(deviceId: string, callback: ScanDataCallback): Promise<void> {
		// Add callback to persistent storage
		if (!this.persistentCallbacks.has(deviceId)) {
			this.persistentCallbacks.set(deviceId, []);
		}
		this.persistentCallbacks.get(deviceId)!.push(callback);

		const device = this.deviceManager.getDevice(deviceId);
		if (!device) {
			console.log(`Device ${deviceId} not found, callback queued for when device connects`);
			return; // Don't throw error, just queue the callback
		}

		if (device.meta.deviceType !== 'scanner') {
			throw new Error(`Device ${deviceId} is not a scanner`);
		}

		await this.startScanningDevice(device);
	}

	async scanFromDefault(callback: ScanDataCallback): Promise<void> {
		// Add callback to default scanner callbacks
		this.defaultScannerCallbacks.push(callback);

		const defaultScanner = this.deviceManager.getDefaultDevice('scanner');
		if (!defaultScanner) {
			console.log('No default scanner found, callback queued for when default scanner connects');
			return; // Don't throw error, just queue the callback
		}

		await this.startScanningDevice(defaultScanner);
	}

	async stopScanning(deviceId: string): Promise<void> {
		if (this.activeScanners.has(deviceId)) {
			this.activeScanners.delete(deviceId);
		}

		await this.closeScannerAdapter(deviceId);
	}

	async stopScanningFromDefault(): Promise<void> {
		const defaultScanner = this.deviceManager.getDefaultDevice('scanner');
		if (defaultScanner) {
			await this.stopScanning(defaultScanner.id);
		}
		// Clear default scanner callbacks
		this.defaultScannerCallbacks = [];
	}

	removeCallback(deviceId: string, callback: ScanDataCallback): void {
		const callbacks = this.persistentCallbacks.get(deviceId);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	removeDefaultCallback(callback: ScanDataCallback): void {
		const index = this.defaultScannerCallbacks.indexOf(callback);
		if (index > -1) {
			this.defaultScannerCallbacks.splice(index, 1);
		}
	}

	async stopAllScanning(): Promise<void> {
		const activeDevices = Array.from(this.activeScanners);
		for (const deviceId of activeDevices) {
			await this.stopScanning(deviceId);
		}
	}

	private async startScanningDevice(device: TerminalDevice): Promise<void> {
		try {
			await this.ensureScannerAdapter(device);
			
			if (!this.activeScanners.has(device.id)) {
				// Set up data callback that routes to all persistent callbacks
				this.deviceManager.getEventEmitter().onDeviceData(device.id, (_, data) => {
					this.handleScanData(device.id, data);
				});

				this.activeScanners.add(device.id);
				console.log(`Started scanning from device: ${device.id}`);
			}
		} catch (error) {
			console.error(`Failed to start scanning from ${device.id}:`, error);
			throw error;
		}
	}

	private handleScanData(deviceId: string, data: string): void {
		// Send to device-specific callbacks
		const deviceCallbacks = this.persistentCallbacks.get(deviceId) || [];
		deviceCallbacks.forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in scan callback for ${deviceId}:`, error);
			}
		});

		// Send to default scanner callbacks if this is the default scanner
		const defaultScanner = this.deviceManager.getDefaultDevice('scanner');
		if (defaultScanner && defaultScanner.id === deviceId) {
			this.defaultScannerCallbacks.forEach(callback => {
				try {
					callback(data);
				} catch (error) {
					console.error(`Error in default scan callback:`, error);
				}
			});
		}

		// Send to global scan callbacks
		this.globalScanCallbacks.forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in global scan callback:`, error);
			}
		});
	}

	async ensureScannerAdapter(device: TerminalDevice, baudRate?: BaudRate): Promise<void> {
		if (this.scannerAdapters.has(device.id)) {
			return; // Adapter already exists
		}

		// Auto-configure device if not already configured
		if (device.meta.deviceType !== 'scanner') {
			throw new Error(`Device ${device.id} must be configured as a scanner`);
		}

		try {
			// Update device config with baudrate if needed
			if (baudRate && device.meta.baudrate !== baudRate) {
				updateDeviceConfig(device.vid, device.pid, { baudrate: baudRate });
				device.meta.baudrate = baudRate;
			}

			const adapter = new BarcodeScannerAdapter(device);

			adapter.onError((error) => {
				console.error(`Scanner adapter error for ${device.id}:`, error);
				this.deviceManager.getEventEmitter().emitDeviceError(device.id, new Error(String(error)));
				this.closeScannerAdapter(device.id);
			});

			// Set up data reading
			adapter.read((data) => {
				const dataStr = data.toString().trim();
				this.deviceManager.getEventEmitter().emitDeviceData(device.id, dataStr);
			});

			await adapter.open();
			this.scannerAdapters.set(device.id, adapter);
			console.log(`Scanner adapter created for ${device.id}`);
		} catch (error) {
			console.error(`Failed to create scanner adapter for ${device.id}:`, error);
			throw error;
		}
	}

	async closeScannerAdapter(deviceId: string): Promise<void> {
		const adapter = this.scannerAdapters.get(deviceId);
		if (adapter) {
			try {
				await adapter.close();
			} catch (error) {
				console.error(`Error closing scanner adapter for ${deviceId}:`, error);
			}
			this.scannerAdapters.delete(deviceId);
		}
	}

	async closeAllScannerAdapters(): Promise<void> {
		const adapters = Array.from(this.scannerAdapters.keys());
		for (const deviceId of adapters) {
			await this.closeScannerAdapter(deviceId);
		}
		this.activeScanners.clear();
	}

	getScannerDevices(): TerminalDevice[] {
		return this.deviceManager.getDevicesByType('scanner');
	}

	getDefaultScanner(): TerminalDevice | undefined {
		return this.deviceManager.getDefaultDevice('scanner');
	}

	isScanning(deviceId: string): boolean {
		return this.activeScanners.has(deviceId);
	}

	getActiveScanners(): string[] {
		return Array.from(this.activeScanners);
	}

	// Setup a global scan data callback (for any scanner)
	onScanData(callback: ScanDataCallback): void {
		this.globalScanCallbacks.push(callback);
		
		// Start scanning from any existing scanners
		const scanners = this.deviceManager.getDevicesByType('scanner');
		scanners.forEach(async (scanner) => {
			try {
				await this.startScanningDevice(scanner);
			} catch (error) {
				console.error(`Failed to start scanning from existing scanner ${scanner.id}:`, error);
			}
		});
	}

	private setupEventListeners(): void {
		// Handle device connections
		this.deviceManager.onDeviceConnect(async (device) => {
			if (device.meta.deviceType === 'scanner') {
				try {
					// Check if this device has persistent callbacks waiting
					const hasCallbacks = this.persistentCallbacks.has(device.id) && 
						this.persistentCallbacks.get(device.id)!.length > 0;
					
					// Check if this is the default scanner and has default callbacks waiting
					const isDefaultWithCallbacks = device.meta.setToDefault && 
						this.defaultScannerCallbacks.length > 0;
					
					// Check if there are global callbacks waiting
					const hasGlobalCallbacks = this.globalScanCallbacks.length > 0;

					// Start scanning if device has callbacks waiting or is default with setToDefault=true
					if (hasCallbacks || isDefaultWithCallbacks || hasGlobalCallbacks || device.meta.setToDefault) {
						await this.startScanningDevice(device);
						
						if (isDefaultWithCallbacks) {
							console.log(`Auto-started scanning from reconnected default scanner: ${device.id}`);
						} else if (hasCallbacks) {
							console.log(`Auto-resumed scanning from reconnected scanner: ${device.id}`);
						} else if (device.meta.setToDefault) {
							console.log(`Auto-started scanning from default scanner: ${device.id}`);
						}
					}
				} catch (error) {
					console.error(`Failed to auto-start scanning from ${device.id}:`, error);
				}
			}
		});

		// Clean up adapters when devices disconnect (but keep callbacks for reconnection)
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			this.activeScanners.delete(deviceId);
			await this.closeScannerAdapter(deviceId);
			console.log(`Scanner ${deviceId} disconnected, callbacks preserved for reconnection`);
		});
	}
}