import { usb } from 'usb';
import {
	devicesWithSavedConfig,
	getConnectedDevices,
} from '../core/deviceDetector';
import {
	type DeviceConnectCallback,
	type DeviceDisconnectCallback,
	DeviceEventEmitter,
} from '../core/deviceEvents';
import type { DeviceConfig, DeviceType, TerminalDevice } from '../core/types';
import { DeviceConfigService } from '../services/deviceConfigService';

export class DeviceManager {
	private devices = new Map<string, TerminalDevice>();
	private events = new DeviceEventEmitter();
	private isRunning = false;
	private refreshInProgress = false;
	private pendingRefresh = false;
	private usbListenersSetup = false;
	private configService = new DeviceConfigService();

	/**
	 * Get the device configuration service
	 * @returns DeviceConfigService instance
	 */
	getConfigService(): DeviceConfigService {
		return this.configService;
	}

	async start(): Promise<void> {
		if (this.isRunning) return;

		// Initial device scan
		await this.refreshDevices();

		// Setup USB monitoring (only once)
		if (!this.usbListenersSetup) {
			this.setupUSBListeners();
			this.usbListenersSetup = true;
		}

		this.isRunning = true;
	}

	async stop(): Promise<void> {
		if (!this.isRunning) return;

		// Remove USB listeners
		if (this.usbListenersSetup) {
			usb.removeAllListeners('attach');
			usb.removeAllListeners('detach');
			this.usbListenersSetup = false;
		}

		// Clear events
		this.events.clear();

		// Clear device cache
		this.devices.clear();

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
			(device) =>
				device.meta.deviceType === deviceType && device.meta.setToDefault,
		);
	}

	getDefaultDeviceId(deviceType: DeviceType): string | null {
		const defaultDevice = this.getDefaultDevice(deviceType);
		return defaultDevice ? defaultDevice.id : null;
	}

	getDevicesByType(deviceType: DeviceType): TerminalDevice[] {
		return Array.from(this.devices.values()).filter(
			(device) => device.meta.deviceType === deviceType,
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
				await new Promise((resolve) => setTimeout(resolve, 50));
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
					const existingDevice = this.devices.get(device.id);
					if (!existingDevice) continue;
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
			const currentDeviceIds = new Set(devicesWithConfig.map((d) => d.id));
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
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);

			// Convert numbers to hex strings for comparison
			const targetVid = `0x${vid.toString(16).toLowerCase()}`;
			const targetPid = `0x${pid.toString(16).toLowerCase()}`;

			// Filter to only devices matching the target VID/PID
			const targetDevices = devicesWithConfig.filter(
				(d) => d.vid === targetVid && d.pid === targetPid,
			);

			// Add/update only the target devices
			for (const device of targetDevices) {
				if (!this.devices.has(device.id)) {
					this.devices.set(device.id, device);
					this.events.emitDeviceConnect(device);
					console.log(`Added device via targeted refresh: ${device.id}`);
				} else {
					// Update existing device metadata
					const existingDevice = this.devices.get(device.id);
					if (!existingDevice) continue;
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
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);
			const currentDeviceIds = new Set(devicesWithConfig.map((d) => d.id));

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
	 * Refresh specific device configuration after config changes
	 */
	async refreshDeviceConfig(vid: string, pid: string): Promise<void> {
		if (this.refreshInProgress) {
			// Wait for current refresh to complete
			while (this.refreshInProgress) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		try {
			const detectedDevices = await getConnectedDevices();
			const devicesWithConfig = devicesWithSavedConfig(detectedDevices);

			// Filter to only devices matching the target VID/PID
			const targetDevices = devicesWithConfig.filter(
				(d) => d.vid === vid && d.pid === pid,
			);

			// Handle devices that exist in memory but no longer have configs
			const existingDeviceIds = Array.from(this.devices.keys()).filter((id) => {
				const device = this.devices.get(id);
				return device && device.vid === vid && device.pid === pid;
			});

			if (targetDevices.length === 0 && existingDeviceIds.length > 0) {
				// Config was deleted - clean up devices and scanner subscriptions
				for (const deviceId of existingDeviceIds) {
					const existingDevice = this.devices.get(deviceId);
					if (existingDevice && existingDevice.meta.deviceType === 'scanner') {
						// Clean up scanner subscription for this device before removing it
						await this.cleanupScannerSubscription(deviceId);
					}
					this.devices.delete(deviceId);
					this.events.emitDeviceDisconnect(deviceId);
					console.log(`Removed device after config deletion: ${deviceId}`);
				}
				return;
			}

			// Update only the target devices
			for (const device of targetDevices) {
				if (this.devices.has(device.id)) {
					const existingDevice = this.devices.get(device.id);
					if (!existingDevice) continue;
					
					// Check if device became unassigned (config was deleted)
					const wasConfigured = existingDevice.meta.deviceType !== 'unassigned';
					const isNowUnassigned = device.meta.deviceType === 'unassigned';
					
					if (wasConfigured && isNowUnassigned) {
						// Device lost its configuration - clean up scanner subscription
						if (existingDevice.meta.deviceType === 'scanner') {
							await this.cleanupScannerSubscription(device.id);
						}
					}

					const hasChanges =
						existingDevice.meta.deviceType !== device.meta.deviceType ||
						existingDevice.meta.setToDefault !== device.meta.setToDefault ||
						existingDevice.meta.baudrate !== device.meta.baudrate ||
						existingDevice.meta.brand !== device.meta.brand ||
						existingDevice.meta.model !== device.meta.model;

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

	/**
	 * Clean up scanner subscription for a device (used when config is deleted)
	 * This method triggers cleanup before the device is actually removed
	 */
	private async cleanupScannerSubscription(deviceId: string): Promise<void> {
		try {
			// Emit device disconnect to trigger scanner manager cleanup before actual removal
			// This ensures scanner adapters are properly closed when configs are deleted
			this.events.emitDeviceDisconnect(deviceId);
			console.log(`Pre-cleanup scanner subscription for device: ${deviceId}`);
		} catch (error) {
			console.error(`Error cleaning up scanner subscription for ${deviceId}:`, error);
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

	// Device Configuration Methods (delegate to config service + trigger refresh)

	async setDeviceConfig(
		vid: string,
		pid: string,
		config: DeviceConfig,
	): Promise<boolean> {
		const result = await this.configService.setDeviceConfig(vid, pid, config);
		if (result) {
			await this.refreshDeviceConfig(vid, pid);
		}
		return result;
	}

	async updateDeviceConfig(
		vid: string,
		pid: string,
		config: Partial<DeviceConfig>,
	): Promise<DeviceConfig | null> {
		const result = await this.configService.updateDeviceConfig(
			vid,
			pid,
			config,
		);
		if (result) {
			await this.refreshDeviceConfig(vid, pid);
		}
		return result;
	}

	async deleteDeviceConfig(vid: string, pid: string): Promise<boolean> {
		const result = await this.configService.deleteDeviceConfig(vid, pid);
		if (result) {
			await this.refreshDeviceConfig(vid, pid);
		}
		return result;
	}

	async deleteAllDeviceConfigs(): Promise<boolean> {
		// Get current devices before deleting configs
		const currentDevices = Array.from(this.devices.values());
		const deviceVidPids = new Set(
			currentDevices.map((d) => `${d.vid}:${d.pid}`),
		);
		for (const vidPidKey of deviceVidPids) {
			const [vid, pid] = vidPidKey.split(':');
			await this.configService.deleteDeviceConfig(vid, pid);
			await this.refreshDeviceConfig(vid, pid);
		}
		return true;
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

		const result = await this.configService.setDeviceAsDefault(
			device.vid,
			device.pid,
			device.meta.deviceType,
		);
		if (result) {
			await this.refreshDevices(); // Full refresh to update all default states
		}
		return result;
	}

	async unsetDeviceAsDefault(deviceId: string): Promise<boolean> {
		const device = this.getDevice(deviceId);
		if (!device) {
			console.error(`Device ${deviceId} not found`);
			return false;
		}

		const result = await this.configService.unsetDeviceAsDefault(
			device.vid,
			device.pid,
		);
		if (result) {
			await this.refreshDeviceConfig(device.vid, device.pid);
		}
		return result;
	}

	// Read-only config methods (delegate to config service)
	getDeviceConfig(vid: string, pid: string) {
		return this.configService.getDeviceConfig(vid, pid);
	}

	getAllDeviceConfigs() {
		return this.configService.getAllDeviceConfigs();
	}

	hasDeviceConfig(vid: string, pid: string) {
		return this.configService.hasDeviceConfig(vid, pid);
	}

	getConfiguredDeviceCount() {
		return this.configService.getConfiguredDeviceCount();
	}
}
