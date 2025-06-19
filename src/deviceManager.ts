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
	private isRunning = false;
	private refreshInProgress = false;
	private pendingRefresh = false;

	constructor() {}

	async start(): Promise<void> {
		if (this.isRunning) return;

		await this.refreshDevices();
		this.setupUSBListeners();
		// Note: Removed periodic refresh to prevent over-refreshing
		// USB events and manual refreshes provide sufficient coverage
		this.isRunning = true;
	}

	async stop(): Promise<void> {
		if (!this.isRunning) return;

		// Clean up timers
		if (this.usbDetachTimeout) {
			clearTimeout(this.usbDetachTimeout);
			this.usbDetachTimeout = undefined;
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
		// Prevent concurrent refresh operations - return the same promise for concurrent calls
		if (this.refreshInProgress) {
			this.pendingRefresh = true;
			// Wait for current refresh to complete instead of immediately returning
			while (this.refreshInProgress) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			return;
		}

		this.refreshInProgress = true;
		this.pendingRefresh = false;

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
		} finally {
			this.refreshInProgress = false;
			// If another refresh was requested while this one was running, do it once more
			if (this.pendingRefresh) {
				this.pendingRefresh = false;
				setTimeout(() => this.refreshDevices(), 50);
			}
		}
	}

	/**
	 * Targeted refresh for specific VID/PID (used for USB attach events)
	 */
	private async refreshDeviceByVidPid(vid: number, pid: number): Promise<void> {
		if (this.refreshInProgress) {
			// Wait for current refresh to complete
			while (this.refreshInProgress) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);
			
			// Convert numbers to hex strings for comparison
			const targetVid = `0x${vid.toString(16).toLowerCase()}`;
			const targetPid = `0x${pid.toString(16).toLowerCase()}`;

			// Filter to only devices matching the target VID/PID
			const targetDevices = devicesWithConfig.filter(d => 
				d.vid === targetVid && d.pid === targetPid
			);

			// Add/update only the target devices
			for (const device of targetDevices) {
				if (!this.devices.has(device.id)) {
					this.devices.set(device.id, device);
					this.events.emitDeviceConnect(device);
					console.log(`Added device via targeted refresh: ${device.id}`);
				} else {
					// Update existing device metadata
					const existingDevice = this.devices.get(device.id)!;
					const hasChanges = 
						existingDevice.meta.deviceType !== device.meta.deviceType ||
						existingDevice.meta.setToDefault !== device.meta.setToDefault ||
						existingDevice.meta.baudrate !== device.meta.baudrate;

					if (hasChanges) {
						this.devices.set(device.id, device);
						this.events.emitDeviceConnect(device);
						console.log(`Updated device via targeted refresh: ${device.id}`);
					}
				}
			}
		} catch (error) {
			console.error(`Error in targeted refresh for ${vid}:${pid}:`, error);
		}
	}

	/**
	 * Check for disconnected devices by comparing current state with fresh scan
	 */
	private async checkForDisconnectedDevices(): Promise<void> {
		if (this.refreshInProgress) {
			// Wait for current refresh to complete
			while (this.refreshInProgress) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);
			const currentDeviceIds = new Set(devicesWithConfig.map(d => d.id));
			
			// Find devices that are in our manager but no longer detected
			const deviceEntries = Array.from(this.devices.entries());
			for (const [deviceId] of deviceEntries) {
				if (!currentDeviceIds.has(deviceId)) {
					this.devices.delete(deviceId);
					this.events.emitDeviceDisconnect(deviceId);
					console.log(`Removed disconnected device: ${deviceId}`);
				}
			}
		} catch (error) {
			console.error('Error checking for disconnected devices:', error);
		}
	}

	/**
	 * Refresh specific device configuration
	 */
	private async refreshDeviceConfig(vid: string, pid: string): Promise<void> {
		if (this.refreshInProgress) {
			// Wait for current refresh to complete
			while (this.refreshInProgress) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);
			
			// Filter to only devices matching the target VID/PID
			const targetDevices = devicesWithConfig.filter(d => 
				d.vid === vid && d.pid === pid
			);

			// Update only the target devices
			for (const device of targetDevices) {
				if (this.devices.has(device.id)) {
					const existingDevice = this.devices.get(device.id)!;
					const hasChanges = 
						existingDevice.meta.deviceType !== device.meta.deviceType ||
						existingDevice.meta.setToDefault !== device.meta.setToDefault ||
						existingDevice.meta.baudrate !== device.meta.baudrate;

					if (hasChanges) {
						this.devices.set(device.id, device);
						this.events.emitDeviceConnect(device);
						console.log(`Updated device config: ${device.id}`);
					}
				}
			}
		} catch (error) {
			console.error(`Error refreshing config for ${vid}:${pid}:`, error);
		}
	}


	private setupUSBListeners(): void {
		usb.on('attach', (device) => {
			// Targeted refresh for the specific attached device
			const vid = device.deviceDescriptor.idVendor;
			const pid = device.deviceDescriptor.idProduct;
			console.log(`USB device attached: ${vid}:${pid}`);
			this.refreshDeviceByVidPid(vid, pid);
		});

		usb.on('detach', (device) => {
			// Check for disconnected devices
			const vid = device.deviceDescriptor.idVendor;
			const pid = device.deviceDescriptor.idProduct;
			console.log(`USB device detached: ${vid}:${pid}`);
			this.checkForDisconnectedDevices();
		});
	}

	async setDeviceConfig(vid: string, pid: string, config: DeviceConfig): Promise<boolean> {
		try {
			saveDeviceConfig(vid, pid, config);
			// Targeted refresh for only the specific device config that changed
			await this.refreshDeviceConfig(vid, pid);
			return true;
		} catch (error) {
			console.error(`Failed to set device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	async updateDeviceConfig(vid: string, pid: string, config: Partial<DeviceConfig>): Promise<DeviceConfig | null> {
		try {
			const updatedConfig = updateConfig(vid, pid, config);
			if (updatedConfig) {
				// Targeted refresh for only the specific device config that changed
				await this.refreshDeviceConfig(vid, pid);
			}
			return updatedConfig;
		} catch (error) {
			console.error(`Failed to update device config for ${vid}:${pid}:`, error);
			return null;
		}
	}

	async deleteDeviceConfig(vid: string, pid: string): Promise<boolean> {
		try {
			const deleted = deleteConfig(vid, pid);
			if (deleted) {
				// Targeted refresh for only the specific device config that was deleted
				await this.refreshDeviceConfig(vid, pid);
			}
			return deleted;
		} catch (error) {
			console.error(`Failed to delete device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	async deleteAllDeviceConfigs(): Promise<boolean> {
		try {
			const deleted = clearAllDevices();
			if (deleted) {
				// Full refresh needed since all configs were deleted
				await this.refreshDevices();
			}
			return deleted;
		} catch (error) {
			console.error('Failed to delete all device configs:', error);
			return false;
		}
	}

	getDeviceConfig(vid: string, pid: string): DeviceConfig | null {
		try {
			return getDeviceConfig(vid, pid);
		} catch (error) {
			console.error(`Failed to get device config for ${vid}:${pid}:`, error);
			return null;
		}
	}

	getAllDeviceConfigs(): Record<string, DeviceConfig> {
		try {
			return getAllDeviceConfig();
		} catch (error) {
			console.error('Failed to get all device configs:', error);
			return {};
		}
	}

	hasDeviceConfig(vid: string, pid: string): boolean {
		try {
			return hasDeviceConfig(vid, pid);
		} catch (error) {
			console.error(`Failed to check device config for ${vid}:${pid}:`, error);
			return false;
		}
	}

	getConfiguredDeviceCount(): number {
		try {
			return getDeviceCount();
		} catch (error) {
			console.error('Failed to get device count:', error);
			return 0;
		}
	}

	async setDeviceAsDefault(deviceId: string): Promise<boolean> {
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
			const updated = await this.updateDeviceConfig(existingDefault.vid, existingDefault.pid, {
				setToDefault: false
			});
			if (!updated) {
				console.error(`Failed to unset existing default device ${existingDefault.id}`);
				return false;
			}
		}

		// Set this device as default
		const result = await this.updateDeviceConfig(device.vid, device.pid, {
			setToDefault: true
		});
		return result !== null;
	}

	async unsetDeviceAsDefault(deviceId: string): Promise<boolean> {
		const device = this.getDevice(deviceId);
		if (!device) {
			console.error(`Device ${deviceId} not found`);
			return false;
		}

		const result = await this.updateDeviceConfig(device.vid, device.pid, {
			setToDefault: false
		});
		return result !== null;
	}
}