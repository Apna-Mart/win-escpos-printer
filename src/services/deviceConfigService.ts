import {
	clearAllDevices,
	deleteDeviceConfig as deleteConfig,
	getAllDeviceConfig,
	getDeviceConfig,
	getDeviceCount,
	hasDeviceConfig,
	saveDeviceConfig,
	updateDeviceConfig as updateConfig,
} from '../core/deviceConfig';
import type { DeviceConfig } from '../core/types';

/**
 * Service for managing device configurations
 * Handles CRUD operations for device settings
 */
export class DeviceConfigService {
	/**
	 * Set/create device configuration
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @param config - Device configuration
	 * @returns true if successful, false otherwise
	 */
	async setDeviceConfig(
		vid: string,
		pid: string,
		config: DeviceConfig,
	): Promise<boolean> {
		try {
			saveDeviceConfig(vid, pid, config);
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
	async updateDeviceConfig(
		vid: string,
		pid: string,
		config: Partial<DeviceConfig>,
	): Promise<DeviceConfig | null> {
		try {
			const updatedConfig = updateConfig(vid, pid, config);
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
	async deleteDeviceConfig(vid: string, pid: string): Promise<boolean> {
		try {
			const deleted = deleteConfig(vid, pid);
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
	async deleteAllDeviceConfigs(): Promise<boolean> {
		try {
			const deleted = clearAllDevices();
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
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @param deviceType - Device type
	 * @returns true if successful, false otherwise
	 */
	async setDeviceAsDefault(
		vid: string,
		pid: string,
		deviceType: string,
	): Promise<boolean> {
		try {
			// First, unset any existing default for this device type
			const allConfigs = this.getAllDeviceConfigs();
			for (const [key, config] of Object.entries(allConfigs)) {
				if (config.deviceType === deviceType && config.setToDefault) {
					const [existingVid, existingPid] = key.split(':');
					if (existingVid !== vid || existingPid !== pid) {
						await this.updateDeviceConfig(existingVid, existingPid, {
							setToDefault: false,
						});
					}
				}
			}

			// Set this device as default
			const result = await this.updateDeviceConfig(vid, pid, {
				setToDefault: true,
			});
			return result !== null;
		} catch (error) {
			console.error(`Failed to set device ${vid}:${pid} as default:`, error);
			return false;
		}
	}

	/**
	 * Unset device as default
	 * @param vid - Vendor ID
	 * @param pid - Product ID
	 * @returns true if successful, false otherwise
	 */
	async unsetDeviceAsDefault(vid: string, pid: string): Promise<boolean> {
		try {
			const result = await this.updateDeviceConfig(vid, pid, {
				setToDefault: false,
			});
			return result !== null;
		} catch (error) {
			console.error(`Failed to unset device ${vid}:${pid} as default:`, error);
			return false;
		}
	}
}
