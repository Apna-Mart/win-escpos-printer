import { usb } from 'usb';
import type { TerminalDevice, DeviceType, DeviceConfig } from './types';
import { getConnectedDevices, devicesWithSavedConfig } from './deviceDetector';
import { DeviceEventEmitter, type DeviceConnectCallback, type DeviceDisconnectCallback } from './deviceEvents';
import { 
	saveDeviceConfig, 
	getDeviceConfig, 
	updateDeviceConfig as updateConfig, 
	deleteDeviceConfig as deleteConfig,
	clearAllDevices,
	getAllDeviceConfig,
	hasDeviceConfig,
	getDeviceCount
} from './deviceConfig';

export class DeviceManager {
	private devices = new Map<string, TerminalDevice>();
	private events = new DeviceEventEmitter();
	private usbDetachTimeout?: NodeJS.Timeout;
	private refreshInterval?: NodeJS.Timeout;
	private isRunning = false;

	constructor() {}

	async start(): Promise<void> {
		if (this.isRunning) return;

		await this.refreshDevices();
		this.setupUSBListeners();
		this.startPeriodicRefresh();
		this.isRunning = true;
	}

	async stop(): Promise<void> {
		if (!this.isRunning) return;

		// Clean up timers
		if (this.usbDetachTimeout) {
			clearTimeout(this.usbDetachTimeout);
			this.usbDetachTimeout = undefined;
		}
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = undefined;
		}

		// Remove USB listeners
		usb.removeAllListeners('attach');
		usb.removeAllListeners('detach');

		// Clear events
		this.events.clear();

		this.isRunning = false;
	}

	onDeviceConnect(callback: DeviceConnectCallback): void {
		this.events.onDeviceConnect(callback);
	}

	onDeviceDisconnect(callback: DeviceDisconnectCallback): void {
		this.events.onDeviceDisconnect(callback);
	}

	getDevices(): TerminalDevice[] {
		return Array.from(this.devices.values());
	}

	getDevice(deviceId: string): TerminalDevice | undefined {
		return this.devices.get(deviceId);
	}

	getDefaultDevice(deviceType: DeviceType): TerminalDevice | undefined {
		return Array.from(this.devices.values()).find(
			device => device.meta.deviceType === deviceType && device.meta.setToDefault
		);
	}

	getDefaultDeviceId(deviceType: DeviceType): string | null {
		const defaultDevice = this.getDefaultDevice(deviceType);
		return defaultDevice ? defaultDevice.id : null;
	}

	getDevicesByType(deviceType: DeviceType): TerminalDevice[] {
		return Array.from(this.devices.values()).filter(
			device => device.meta.deviceType === deviceType
		);
	}

	getEventEmitter(): DeviceEventEmitter {
		return this.events;
	}

	async refreshDevices(): Promise<void> {
		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);

			// Check for new devices
			for (const device of devicesWithConfig) {
				if (!this.devices.has(device.id)) {
					this.devices.set(device.id, device);
					this.events.emitDeviceConnect(device);
				} else {
					// Update existing device metadata
					const existingDevice = this.devices.get(device.id)!;
					const hasChanges = 
						existingDevice.meta.deviceType !== device.meta.deviceType ||
						existingDevice.meta.setToDefault !== device.meta.setToDefault ||
						existingDevice.meta.baudrate !== device.meta.baudrate;

					if (hasChanges) {
						this.devices.set(device.id, device);
						// Emit connect event for metadata changes
						this.events.emitDeviceConnect(device);
					}
				}
			}

			// Check for disconnected devices
			const currentDeviceIds = new Set(devicesWithConfig.map(d => d.id));
			const deviceEntries = Array.from(this.devices.entries());
			for (const [deviceId] of deviceEntries) {
				if (!currentDeviceIds.has(deviceId)) {
					this.devices.delete(deviceId);
					this.events.emitDeviceDisconnect(deviceId);
				}
			}
		} catch (error) {
			console.error('Error refreshing devices:', error);
		}
	}

	private setupUSBListeners(): void {
		usb.on('attach', () => {
			this.debounceRefresh();
		});

		usb.on('detach', () => {
			this.debounceRefresh();
		});
	}

	private debounceRefresh(): void {
		if (this.usbDetachTimeout) {
			clearTimeout(this.usbDetachTimeout);
		}
		this.usbDetachTimeout = setTimeout(async () => {
			await this.refreshDevices();
		}, 1000);
	}

	private startPeriodicRefresh(): void {
		// Refresh devices every 3 seconds for serial port changes
		this.refreshInterval = setInterval(async () => {
			await this.refreshDevices();
		}, 3000);
	}

	// Device Configuration Management Methods

	/**
	 * Set/create device configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID  
	 * @param config - Device configuration
	 * @returns true if successful, false otherwise
	 */
	setDeviceConfig(vid: string, pid: string, config: DeviceConfig): boolean {
		try {
			saveDeviceConfig(vid, pid, config);
			// Refresh devices to apply new config
			this.refreshDevices();
			return true;
		} catch (error) {
			console.error(`Failed to set device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	/**
	 * Update existing device configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @param config - Partial device configuration to update
	 * @returns Updated configuration if successful, null otherwise
	 */
	updateDeviceConfig(vid: string, pid: string, config: Partial<DeviceConfig>): DeviceConfig | null {
		try {
			const updatedConfig = updateConfig(vid, pid, config);
			if (updatedConfig) {
				// Refresh devices to apply updated config
				this.refreshDevices();
			}
			return updatedConfig;
		} catch (error) {
			console.error(`Failed to update device config for ${vid}:${pid}:`, error);
			return null;
		}
	}

	/**
	 * Delete device configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @returns true if deleted, false if not found or error
	 */
	deleteDeviceConfig(vid: string, pid: string): boolean {
		try {
			const deleted = deleteConfig(vid, pid);
			if (deleted) {
				// Refresh devices to reflect config deletion
				this.refreshDevices();
			}
			return deleted;
		} catch (error) {
			console.error(`Failed to delete device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	/**
	 * Delete all device configurations
	 * @returns true if any configs were deleted, false otherwise
	 */
	deleteAllDeviceConfigs(): boolean {
		try {
			const deleted = clearAllDevices();
			if (deleted) {
				// Refresh devices to reflect all config deletions
				this.refreshDevices();
			}
			return deleted;
		} catch (error) {
			console.error('Failed to delete all device configs:', error);
			return false;
		}
	}

	/**
	 * Get device configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @returns Device configuration if found, null otherwise
	 */
	getDeviceConfig(vid: string, pid: string): DeviceConfig | null {
		try {
			return getDeviceConfig(vid, pid);
		} catch (error) {
			console.error(`Failed to get device config for ${vid}:${pid}:`, error);
			return null;
		}
	}

	/**
	 * Get all device configurations
	 * @returns Record of all device configurations
	 */
	getAllDeviceConfigs(): Record<string, DeviceConfig> {
		try {
			return getAllDeviceConfig();
		} catch (error) {
			console.error('Failed to get all device configs:', error);
			return {};
		}
	}

	/**
	 * Check if device has configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @returns true if device has config, false otherwise
	 */
	hasDeviceConfig(vid: string, pid: string): boolean {
		try {
			return hasDeviceConfig(vid, pid);
		} catch (error) {
			console.error(`Failed to check device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	/**
	 * Get count of configured devices
	 * @returns Number of devices with saved configurations
	 */
	getConfiguredDeviceCount(): number {
		try {
			return getDeviceCount();
		} catch (error) {
			console.error('Failed to get device count:', error);
			return 0;
		}
	}

	/**
	 * Set device as default for its type
	 * @param deviceId - Device ID
	 * @returns true if successful, false otherwise
	 */
	setDeviceAsDefault(deviceId: string): boolean {
		const device = this.getDevice(deviceId);
		if (!device) {
			console.error(`Device ${deviceId} not found`);
			return false;
		}

		if (device.meta.deviceType === 'unassigned') {
			console.error(`Cannot set unassigned device ${deviceId} as default`);
			return false;
		}

		// First, unset any existing default for this device type
		const existingDefault = this.getDefaultDevice(device.meta.deviceType);
		if (existingDefault && existingDefault.id !== deviceId) {
			const updated = this.updateDeviceConfig(existingDefault.vid, existingDefault.pid, {
				setToDefault: false
			});
			if (!updated) {
				console.error(`Failed to unset existing default device ${existingDefault.id}`);
				return false;
			}
		}

		// Set this device as default
		return this.updateDeviceConfig(device.vid, device.pid, {
			setToDefault: true
		}) !== null;
	}

	/**
	 * Unset device as default
	 * @param deviceId - Device ID
	 * @returns true if successful, false otherwise
	 */
	unsetDeviceAsDefault(deviceId: string): boolean {
		const device = this.getDevice(deviceId);
		if (!device) {
			console.error(`Device ${deviceId} not found`);
			return false;
		}

		return this.updateDeviceConfig(device.vid, device.pid, {
			setToDefault: false
		}) !== null;
	}
}