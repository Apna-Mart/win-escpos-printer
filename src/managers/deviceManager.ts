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
import { logger } from '../core/logger';
import type { DeviceConfig, DeviceType, TerminalDevice } from '../core/types';
import { DeviceConfigService } from '../services/deviceConfigService';

export class DeviceManager {
	private devices = new Map<string, TerminalDevice>();
	private events = new DeviceEventEmitter();
	private isRunning = false;
	private refreshInProgress = false;
	private pendingRefresh = false;
	private usbListenersSetup = false;
	private lastRefreshTime = 0;
	private readonly REFRESH_DEBOUNCE_MS = 500; // 500ms debounce
	private configService = new DeviceConfigService();

	/**
	 * Get the device configuration service
	 * @returns DeviceConfigService instance
	 */
	getConfigService(): DeviceConfigService {
		return this.configService;
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			logger.debug('DeviceManager already running, skipping start');
			return;
		}

		logger.info('Starting DeviceManager');
		await this.refreshDevices();

		// Setup USB monitoring (only once)
		if (!this.usbListenersSetup) {
			this.setupUSBListeners();
			this.usbListenersSetup = true;
		}

		this.isRunning = true;
		logger.info('DeviceManager started', {
			deviceCount: this.devices.size,
		});
	}

	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		logger.info('Stopping DeviceManager');

		// Remove USB listeners
		if (this.usbListenersSetup) {
			usb.removeAllListeners('attach');
			usb.removeAllListeners('detach');
			this.usbListenersSetup = false;
		}

		// Clear events and device cache
		this.events.clear();
		const deviceCount = this.devices.size;
		this.devices.clear();

		this.isRunning = false;
		logger.info('DeviceManager stopped', {
			clearedDevices: deviceCount,
		});
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
			logger.debug('Device refresh - detected devices', {
				total: detectedDevices.length,
				configured: devicesWithConfig.length,
			});

			// Check for new devices
			for (const device of devicesWithConfig) {
				if (!this.devices.has(device.id)) {
					this.devices.set(device.id, device);
					this.events.emitDeviceConnect(device);
					logger.info('Device connected', {
						deviceId: device.id,
						deviceType: device.meta.deviceType,
						vid: device.vid,
						pid: device.pid,
					});
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
						logger.debug('Device metadata updated', {
							deviceId: device.id,
							deviceType: device.meta.deviceType,
							setToDefault: device.meta.setToDefault,
						});
					}
				}
			}

			// Check for disconnected devices
			const currentDeviceIds = new Set(devicesWithConfig.map((d) => d.id));
			const deviceEntries = Array.from(this.devices.entries());
			logger.debug('Checking for disconnected devices', {
				currentIds: currentDeviceIds.size,
				managedDevices: this.devices.size,
			});

			for (const [deviceId] of deviceEntries) {
				if (!currentDeviceIds.has(deviceId)) {
					const device = this.devices.get(deviceId);
					this.devices.delete(deviceId);
					this.events.emitDeviceDisconnect(deviceId);
					logger.info('Device disconnected', {
						deviceId,
						deviceType: device?.meta.deviceType,
					});
				}
			}
			logger.debug('Device refresh completed', {
				totalDevices: this.devices.size,
			});
		} catch (error) {
			logger.error('Error refreshing devices', error);
		} finally {
			this.refreshInProgress = false;
			this.lastRefreshTime = Date.now();
			// If another refresh was requested while this one was running, do it once more
			if (this.pendingRefresh) {
				this.pendingRefresh = false;
				setTimeout(
					() => this.refreshDevices(),
					Math.max(50, this.REFRESH_DEBOUNCE_MS),
				);
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
					logger.debug('Device added via targeted refresh', {
						deviceId: device.id,
						vid: device.vid,
						pid: device.pid,
					});
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
						logger.debug('Device updated via targeted refresh', {
							deviceId: device.id,
							changes: {
								deviceType: device.meta.deviceType,
								setToDefault: device.meta.setToDefault,
								baudrate: device.meta.baudrate,
							},
						});
					}
				}
			}
		} catch (error) {
			logger.error('Error in targeted device refresh', {
				vid: `0x${vid.toString(16)}`,
				pid: `0x${pid.toString(16)}`,
				error,
			});
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
					logger.info('Device disconnected', { deviceId });
				}
			}
		} catch (error) {
			logger.error('Error checking for disconnected devices', error);
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
					logger.info('Device removed after config deletion', {
						deviceId,
						vid,
						pid,
					});
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
						logger.debug('Device configuration updated', {
							deviceId: device.id,
							deviceType: device.meta.deviceType,
							setToDefault: device.meta.setToDefault,
						});
					}
				}
			}
		} catch (error) {
			logger.error('Error refreshing device configuration', {
				vid,
				pid,
				error,
			});
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
			logger.debug('Cleaning up scanner subscription', { deviceId });
		} catch (error) {
			logger.error('Error cleaning up scanner subscription', {
				deviceId,
				error,
			});
		}
	}

	private setupUSBListeners(): void {
		usb.on('attach', (device) => {
			// Targeted refresh for the specific attached device
			const vid = device.deviceDescriptor.idVendor;
			const pid = device.deviceDescriptor.idProduct;
			logger.debug('USB device attached', {
				vid: `0x${vid.toString(16)}`,
				pid: `0x${pid.toString(16)}`,
			});
			this.refreshDeviceByVidPid(vid, pid);
		});

		usb.on('detach', (device) => {
			// Check for disconnected devices
			const vid = device.deviceDescriptor.idVendor;
			const pid = device.deviceDescriptor.idProduct;
			logger.debug('USB device detached', {
				vid: `0x${vid.toString(16)}`,
				pid: `0x${pid.toString(16)}`,
			});
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
			logger.error('Device not found', { deviceId });
			return false;
		}

		if (device.meta.deviceType === 'unassigned') {
			logger.error('Cannot set unassigned device as default', { deviceId });
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
			logger.error('Device not found', { deviceId });
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
