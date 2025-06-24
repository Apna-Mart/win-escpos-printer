import { BarcodeScannerAdapter } from '../adaptor/barcodeScannerAdaptor';
import type { ReadableDevice } from '../adaptor/deviceAdaptor';
import { updateDeviceConfig } from '../core/deviceConfig';
import type { RetryOptions } from '../core/retryUtils';
import type { BaudRate, TerminalDevice } from '../core/types';
import type { DeviceManager } from './deviceManager';

export type ScanDataCallback = (data: string) => void;

export class ScannerManager {
	private deviceManager: DeviceManager;
	private scannerAdapters = new Map<string, ReadableDevice>();
	private activeScanners = new Set<string>(); // Track which devices are actively scanning
	private persistentCallbacks = new Map<string, ScanDataCallback[]>(); // Device-specific persistent callbacks
	private globalScanCallbacks: ScanDataCallback[] = []; // Global scan callbacks
	private pendingDefaultCallbacks: ScanDataCallback[] = []; // Callbacks waiting for default scanner
	private previousDefaultStates = new Map<string, boolean>(); // Track previous default states
	private retryOptions: Partial<RetryOptions>;

	constructor(
		deviceManager: DeviceManager,
		retryOptions: Partial<RetryOptions> = {},
	) {
		this.deviceManager = deviceManager;
		this.retryOptions = retryOptions;
		this.setupEventListeners();
	}

	async scanFromDevice(
		deviceId: string,
		callback: ScanDataCallback,
	): Promise<void> {
		// Add callback to persistent storage
		if (!this.persistentCallbacks.has(deviceId)) {
			this.persistentCallbacks.set(deviceId, []);
		}
		this.persistentCallbacks.get(deviceId)?.push(callback);

		const device = this.deviceManager.getDevice(deviceId);
		if (!device) {
			console.log(
				`Device ${deviceId} not found, callback queued for when device connects`,
			);
			return; // Don't throw error, just queue the callback
		}

		if (device.meta.deviceType !== 'scanner') {
			throw new Error(`Device ${deviceId} is not a scanner`);
		}

		await this.startScanningDevice(device);
	}

	async scanFromDefault(callback: ScanDataCallback): Promise<void> {
		const defaultScannerId = this.deviceManager.getDefaultDeviceId('scanner');
		if (!defaultScannerId) {
			console.log(
				'No default scanner found, callback queued for when default scanner connects',
			);
			// Store callback with a special key for "default scanner when it becomes available"
			this.storeCallbackForWhenDefaultConnects('scanner', callback);
			return;
		}

		await this.scanFromDevice(defaultScannerId, callback);
	}

	private storeCallbackForWhenDefaultConnects(
		_deviceType: 'scanner',
		callback: ScanDataCallback,
	): void {
		this.pendingDefaultCallbacks.push(callback);
	}

	async stopScanning(deviceId: string): Promise<void> {
		if (this.activeScanners.has(deviceId)) {
			this.activeScanners.delete(deviceId);
		}

		await this.closeScannerAdapter(deviceId);
	}

	async stopScanningFromDefault(): Promise<void> {
		const defaultScannerId = this.deviceManager.getDefaultDeviceId('scanner');
		if (defaultScannerId) {
			await this.stopScanning(defaultScannerId);
		}
		// Clear pending default callbacks
		this.pendingDefaultCallbacks = [];
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
		// Remove from pending default callbacks
		const pendingIndex = this.pendingDefaultCallbacks.indexOf(callback);
		if (pendingIndex > -1) {
			this.pendingDefaultCallbacks.splice(pendingIndex, 1);
			return;
		}

		// Remove from actual default device callbacks
		const defaultScannerId = this.deviceManager.getDefaultDeviceId('scanner');
		if (defaultScannerId) {
			this.removeCallback(defaultScannerId, callback);
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
				this.deviceManager
					.getEventEmitter()
					.onDeviceData(device.id, (_, data) => {
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
		// Send to device-specific callbacks (includes default scanner callbacks since they're stored by device ID)
		const deviceCallbacks = this.persistentCallbacks.get(deviceId) || [];
		deviceCallbacks.forEach((callback) => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in scan callback for ${deviceId}:`, error);
			}
		});

		// Send to global scan callbacks
		this.globalScanCallbacks.forEach((callback) => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in global scan callback:`, error);
			}
		});
	}

	async ensureScannerAdapter(
		device: TerminalDevice,
		baudRate?: BaudRate,
	): Promise<void> {
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

			const adapter = new BarcodeScannerAdapter(device, this.retryOptions);

			adapter.onError((error) => {
				console.error(`Scanner adapter error for ${device.id}:`, error);
				this.deviceManager
					.getEventEmitter()
					.emitDeviceError(device.id, new Error(String(error)));
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
			console.error(
				`Failed to create scanner adapter for ${device.id}:`,
				error,
			);
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

	// Get next scan from default scanner (one-time read with timeout)
	async getNextScan(timeoutMs = 10000): Promise<string> {
		const defaultScanner = this.getDefaultScanner();
		if (!defaultScanner) {
			throw new Error('No default scanner found');
		}

		return this.getNextScanFromDevice(defaultScanner.id, timeoutMs);
	}

	// Get next scan from specific scanner (one-time read with timeout)
	async getNextScanFromDevice(
		deviceId: string,
		timeoutMs = 10000,
	): Promise<string> {
		const device = this.deviceManager.getDevice(deviceId);
		if (!device) {
			throw new Error(`Device ${deviceId} not found`);
		}

		if (device.meta.deviceType !== 'scanner') {
			throw new Error(`Device ${deviceId} is not a scanner`);
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.removeCallback(deviceId, oneTimeCallback);
				reject(new Error(`Scan reading timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			const oneTimeCallback = (data: string) => {
				clearTimeout(timeout);
				this.removeCallback(deviceId, oneTimeCallback);
				resolve(data);
			};

			this.scanFromDevice(deviceId, oneTimeCallback).catch((error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
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
				console.error(
					`Failed to start scanning from existing scanner ${scanner.id}:`,
					error,
				);
			}
		});
	}

	private setupEventListeners(): void {
		// Handle device connections
		this.deviceManager.onDeviceConnect(async (device) => {
			try {
				// Check previous default state to detect status changes - FOR ANY DEVICE
				const wasDefault = this.previousDefaultStates.get(device.id) ?? false;
				const isDefault = device.meta.setToDefault ?? false;

				// Update previous state tracking
				this.previousDefaultStates.set(device.id, isDefault);

				// Auto-stop scanning if THIS SPECIFIC DEVICE lost default status (regardless of current deviceType)
				if (wasDefault && !isDefault) {
					console.log(`Auto-stopping scanning from device that lost default status: ${device.id}`);
					await this.stopScanning(device.id);
					return; // Exit early, no need to check start conditions
				}

				// Only process auto-start logic for scanner devices
				if (device.meta.deviceType === 'scanner') {

					// Check if this device has persistent callbacks waiting
					const hasCallbacks =
						this.persistentCallbacks.has(device.id) &&
						(this.persistentCallbacks.get(device.id)?.length ?? 0) > 0;

					// Check if this is the default scanner and has pending default callbacks
					const isDefaultWithPendingCallbacks =
						isDefault && this.pendingDefaultCallbacks.length > 0;

					// Check if there are global callbacks waiting
					const hasGlobalCallbacks = this.globalScanCallbacks.length > 0;

					// If this device becomes the default scanner, move pending callbacks to device-specific storage
					if (
						isDefault &&
						this.pendingDefaultCallbacks.length > 0
					) {
						if (!this.persistentCallbacks.has(device.id)) {
							this.persistentCallbacks.set(device.id, []);
						}
						this.persistentCallbacks
							.get(device.id)
							?.push(...this.pendingDefaultCallbacks);
						this.pendingDefaultCallbacks = []; // Clear pending callbacks
						console.log(
							`Moved ${this.persistentCallbacks.get(device.id)?.length} pending callbacks to default scanner: ${device.id}`,
						);
					}

					// Start scanning if device has callbacks waiting or is default with setToDefault=true
					if (
						hasCallbacks ||
						isDefaultWithPendingCallbacks ||
						hasGlobalCallbacks ||
						isDefault
					) {
						await this.startScanningDevice(device);

						if (isDefaultWithPendingCallbacks) {
							console.log(
								`Auto-started scanning from new default scanner: ${device.id}`,
							);
						} else if (hasCallbacks) {
							console.log(
								`Auto-resumed scanning from reconnected scanner: ${device.id}`,
							);
						} else if (isDefault) {
							console.log(
								`Auto-started scanning from default scanner: ${device.id}`,
							);
						}
					}
				}
			} catch (error) {
				console.error(
					`Failed to process device ${device.id}:`,
					error,
				);
			}
		});

		// Clean up adapters when devices disconnect (but keep callbacks for reconnection)
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			this.activeScanners.delete(deviceId);
			await this.closeScannerAdapter(deviceId);
		});
	}
}
