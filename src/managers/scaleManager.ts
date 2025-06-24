import type { ReadableDevice } from '../adaptor/deviceAdaptor';
import { WeightScaleAdapter } from '../adaptor/weightScaleAdaptor';
import { updateDeviceConfig } from '../core/deviceConfig';
import type { RetryOptions } from '../core/retryUtils';
import type { BaudRate, TerminalDevice } from '../core/types';
import type { DeviceManager } from './deviceManager';

export type WeightDataCallback = (data: string) => void;

export class ScaleManager {
	private deviceManager: DeviceManager;
	private scaleAdapters = new Map<string, ReadableDevice>();
	private activeScales = new Set<string>(); // Track which devices are actively reading
	private persistentCallbacks = new Map<string, WeightDataCallback[]>(); // Device-specific persistent callbacks
	private globalWeightCallbacks: WeightDataCallback[] = []; // Global weight callbacks
	private pendingDefaultCallbacks: WeightDataCallback[] = []; // Callbacks waiting for default scale
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

	async readFromDevice(
		deviceId: string,
		callback: WeightDataCallback,
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

		if (device.meta.deviceType !== 'scale') {
			throw new Error(`Device ${deviceId} is not a scale`);
		}

		await this.startReadingDevice(device);
	}

	async readFromDefault(callback: WeightDataCallback): Promise<void> {
		const defaultScaleId = this.deviceManager.getDefaultDeviceId('scale');
		if (!defaultScaleId) {
			console.log(
				'No default scale found, callback queued for when default scale connects',
			);
			// Store callback with a special key for "default scale when it becomes available"
			this.storeCallbackForWhenDefaultConnects('scale', callback);
			return;
		}

		await this.readFromDevice(defaultScaleId, callback);
	}

	private storeCallbackForWhenDefaultConnects(
		_deviceType: 'scale',
		callback: WeightDataCallback,
	): void {
		this.pendingDefaultCallbacks.push(callback);
	}

	async stopReading(deviceId: string): Promise<void> {
		if (this.activeScales.has(deviceId)) {
			this.activeScales.delete(deviceId);
		}

		await this.closeScaleAdapter(deviceId);
	}

	async stopReadingFromDefault(): Promise<void> {
		const defaultScaleId = this.deviceManager.getDefaultDeviceId('scale');
		if (defaultScaleId) {
			await this.stopReading(defaultScaleId);
		}
		// Clear pending default callbacks
		this.pendingDefaultCallbacks = [];
	}

	removeCallback(deviceId: string, callback: WeightDataCallback): void {
		const callbacks = this.persistentCallbacks.get(deviceId);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	removeDefaultCallback(callback: WeightDataCallback): void {
		// Remove from pending default callbacks
		const pendingIndex = this.pendingDefaultCallbacks.indexOf(callback);
		if (pendingIndex > -1) {
			this.pendingDefaultCallbacks.splice(pendingIndex, 1);
			return;
		}

		// Remove from actual default device callbacks
		const defaultScaleId = this.deviceManager.getDefaultDeviceId('scale');
		if (defaultScaleId) {
			this.removeCallback(defaultScaleId, callback);
		}
	}

	async stopAllReading(): Promise<void> {
		const activeDevices = Array.from(this.activeScales);
		for (const deviceId of activeDevices) {
			await this.stopReading(deviceId);
		}
	}

	private async startReadingDevice(device: TerminalDevice): Promise<void> {
		try {
			await this.ensureScaleAdapter(device);

			if (!this.activeScales.has(device.id)) {
				// Set up data callback that routes to all persistent callbacks
				this.deviceManager
					.getEventEmitter()
					.onDeviceData(device.id, (_, data) => {
						this.handleWeightData(device.id, data);
					});

				this.activeScales.add(device.id);
				console.log(`Started reading from scale: ${device.id}`);
			}
		} catch (error) {
			console.error(`Failed to start reading from ${device.id}:`, error);
			throw error;
		}
	}

	private handleWeightData(deviceId: string, data: string): void {
		// Send to device-specific callbacks (includes default scale callbacks since they're stored by device ID)
		const deviceCallbacks = this.persistentCallbacks.get(deviceId) || [];
		deviceCallbacks.forEach((callback) => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in weight callback for ${deviceId}:`, error);
			}
		});

		// Send to global weight callbacks
		this.globalWeightCallbacks.forEach((callback) => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in global weight callback:`, error);
			}
		});
	}

	async ensureScaleAdapter(
		device: TerminalDevice,
		baudRate?: BaudRate,
	): Promise<void> {
		if (this.scaleAdapters.has(device.id)) {
			return; // Adapter already exists
		}

		// Auto-configure device if not already configured
		if (device.meta.deviceType !== 'scale') {
			throw new Error(`Device ${device.id} must be configured as a scale`);
		}

		try {
			// Update device config with baudrate if needed
			if (baudRate && device.meta.baudrate !== baudRate) {
				updateDeviceConfig(device.vid, device.pid, { baudrate: baudRate });
				device.meta.baudrate = baudRate;
			}

			const adapter = new WeightScaleAdapter(device, this.retryOptions);

			adapter.onError((error) => {
				console.error(`Scale adapter error for ${device.id}:`, error);
				this.deviceManager
					.getEventEmitter()
					.emitDeviceError(device.id, new Error(String(error)));
				this.closeScaleAdapter(device.id);
			});

			// Set up data reading
			adapter.read((data) => {
				const dataStr = data.toString().trim();
				this.deviceManager.getEventEmitter().emitDeviceData(device.id, dataStr);
			});

			await adapter.open();
			this.scaleAdapters.set(device.id, adapter);
			console.log(`Scale adapter created for ${device.id}`);
		} catch (error) {
			console.error(`Failed to create scale adapter for ${device.id}:`, error);
			throw error;
		}
	}

	async closeScaleAdapter(deviceId: string): Promise<void> {
		const adapter = this.scaleAdapters.get(deviceId);
		if (adapter) {
			try {
				await adapter.close();
			} catch (error) {
				console.error(`Error closing scale adapter for ${deviceId}:`, error);
			}
			this.scaleAdapters.delete(deviceId);
		}
	}

	async closeAllScaleAdapters(): Promise<void> {
		const adapters = Array.from(this.scaleAdapters.keys());
		for (const deviceId of adapters) {
			await this.closeScaleAdapter(deviceId);
		}
		this.activeScales.clear();
	}

	getScaleDevices(): TerminalDevice[] {
		return this.deviceManager.getDevicesByType('scale');
	}

	getDefaultScale(): TerminalDevice | undefined {
		return this.deviceManager.getDefaultDevice('scale');
	}

	isReading(deviceId: string): boolean {
		return this.activeScales.has(deviceId);
	}

	getActiveScales(): string[] {
		return Array.from(this.activeScales);
	}

	// Get current weight from default scale (one-time read with timeout)
	async getCurrentWeight(timeoutMs = 5000): Promise<string> {
		const defaultScale = this.getDefaultScale();
		if (!defaultScale) {
			throw new Error('No default scale found');
		}

		return this.getCurrentWeightFromDevice(defaultScale.id, timeoutMs);
	}

	// Get current weight from specific scale (one-time read with timeout)
	async getCurrentWeightFromDevice(
		deviceId: string,
		timeoutMs = 5000,
	): Promise<string> {
		const device = this.deviceManager.getDevice(deviceId);
		if (!device) {
			throw new Error(`Device ${deviceId} not found`);
		}

		if (device.meta.deviceType !== 'scale') {
			throw new Error(`Device ${deviceId} is not a scale`);
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.removeCallback(deviceId, oneTimeCallback);
				reject(new Error(`Weight reading timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			const oneTimeCallback = (data: string) => {
				clearTimeout(timeout);
				this.removeCallback(deviceId, oneTimeCallback);
				resolve(data);
			};

			this.readFromDevice(deviceId, oneTimeCallback).catch((error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	}

	// Setup a global weight data callback (for any scale)
	onWeightData(callback: WeightDataCallback): void {
		this.globalWeightCallbacks.push(callback);

		// Start reading from any existing scales
		const scales = this.deviceManager.getDevicesByType('scale');
		scales.forEach(async (scale) => {
			try {
				await this.startReadingDevice(scale);
			} catch (error) {
				console.error(
					`Failed to start reading from existing scale ${scale.id}:`,
					error,
				);
			}
		});
	}

	private setupEventListeners(): void {
		// Handle device connections
		this.deviceManager.onDeviceConnect(async (device) => {
			if (device.meta.deviceType === 'scale') {
				try {
					// Check previous default state to detect status changes
					const wasDefault = this.previousDefaultStates.get(device.id) ?? false;
					const isDefault = device.meta.setToDefault ?? false;

					// Update previous state tracking
					this.previousDefaultStates.set(device.id, isDefault);

					// Auto-stop reading if device lost default status
					if (wasDefault && !isDefault) {
						console.log(`Auto-stopping reading from scale that lost default status: ${device.id}`);
						await this.stopReading(device.id);
						return; // Exit early, no need to check start conditions
					}

					// Check if this device has persistent callbacks waiting
					const hasCallbacks =
						this.persistentCallbacks.has(device.id) &&
						(this.persistentCallbacks.get(device.id)?.length ?? 0) > 0;

					// Check if this is the default scale and has pending default callbacks
					const isDefaultWithPendingCallbacks =
						isDefault && this.pendingDefaultCallbacks.length > 0;

					// Check if there are global callbacks waiting
					const hasGlobalCallbacks = this.globalWeightCallbacks.length > 0;

					// If this device becomes the default scale, move pending callbacks to device-specific storage
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
							`Moved ${this.persistentCallbacks.get(device.id)?.length} pending callbacks to default scale: ${device.id}`,
						);
					}

					// Start reading if device has callbacks waiting or is default with setToDefault=true
					if (
						hasCallbacks ||
						isDefaultWithPendingCallbacks ||
						hasGlobalCallbacks ||
						isDefault
					) {
						await this.startReadingDevice(device);

						if (isDefaultWithPendingCallbacks) {
							console.log(
								`Auto-started reading from new default scale: ${device.id}`,
							);
						} else if (hasCallbacks) {
							console.log(
								`Auto-resumed reading from reconnected scale: ${device.id}`,
							);
						} else if (isDefault) {
							console.log(
								`Auto-started reading from default scale: ${device.id}`,
							);
						}
					}
				} catch (error) {
					console.error(
						`Failed to auto-start reading from ${device.id}:`,
						error,
					);
				}
			}
		});

		// Clean up adapters when devices disconnect (but keep callbacks for reconnection)
		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			this.activeScales.delete(deviceId);
			await this.closeScaleAdapter(deviceId);
		});
	}
}
