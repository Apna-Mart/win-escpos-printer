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
import { logger } from '../core/logger';
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
			logger.debug('Setting device config', {
			vid,
			pid,
			deviceType: config.deviceType,
			setToDefault: config.setToDefault,
		});

		try {
			saveDeviceConfig(vid, pid, config);
			logger.info('Device config saved', {
				vid,
				pid,
				deviceType: config.deviceType,
				setToDefault: config.setToDefault,
			});
			return true;
		} catch (error) {
			logger.error('Failed to set device config', {
				vid,
				pid,
				deviceType: config.deviceType,
				error,
			});
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
		logger.debug('Updating device config', {
			vid,
			pid,
			changes: config,
		});

		try {
			const updatedConfig = updateConfig(vid, pid, config);
			if (updatedConfig) {
				logger.info('Device config updated', {
					vid,
					pid,
					deviceType: updatedConfig.deviceType,
					setToDefault: updatedConfig.setToDefault,
				});
			} else {
				logger.warn('Device config update failed', {
					vid,
					pid,
				});
			}
			return updatedConfig;
		} catch (error) {
			logger.error('Failed to update device config', {
				vid,
				pid,
				error,
			});
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
		logger.debug('Deleting device config', {
			vid,
			pid,
		});

		try {
			const deleted = deleteConfig(vid, pid);
			if (deleted) {
				logger.info('Device config deleted', {
					vid,
					pid,
				});
			} else {
				logger.warn('Device config not found for deletion', {
					vid,
					pid,
				});
			}
			return deleted;
		} catch (error) {
			logger.error('Failed to delete device config', {
				vid,
				pid,
				error,
			});
			return false;
		}
	}

	/**
	 * Delete all device configurations
	 * @returns true if any configs were deleted, false otherwise
	 */
	async deleteAllDeviceConfigs(): Promise<boolean> {
		logger.debug('Deleting all device configs');

		try {
			const configCount = this.getConfiguredDeviceCount();
			const deleted = clearAllDevices();

			if (deleted) {
				logger.info('All device configs deleted', {
					deletedCount: configCount,
				});
			} else {
				logger.warn('No device configs found to delete');
			}
			return deleted;
		} catch (error) {
			logger.error('Failed to delete all device configs', { error });
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
		logger.debug('Getting device configuration', {
			vid,
			pid,
			deviceId: `device_${vid}_${pid}`,
		});

		try {
			const config = getDeviceConfig(vid, pid);
			if (config) {
				logger.debug('Device configuration found', {
					vid,
					pid,
					deviceId: `device_${vid}_${pid}`,
					config: {
						deviceType: config.deviceType,
						baudrate: config.baudrate,
						setToDefault: config.setToDefault,
						brand: config.brand,
						model: config.model,
					},
				});
			} else {
				logger.debug('Device config not found', {
					vid,
					pid,
				});
			}
			return config;
		} catch (error) {
			logger.error('Failed to get device config', {
				vid,
				pid,
				error,
			});
			return null;
		}
	}

	/**
	 * Get all device configurations
	 * @returns Record of all device configurations
	 */
	getAllDeviceConfigs(): Record<string, DeviceConfig> {

		try {
			const configs = getAllDeviceConfig();
			const configCount = Object.keys(configs).length;
			const deviceTypes = Object.values(configs).reduce(
				(acc, config) => {
					acc[config.deviceType] = (acc[config.deviceType] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>,
			);

			logger.debug('All device configs retrieved', {
				configCount,
				deviceTypes,
			});

			return configs;
		} catch (error) {
			logger.error('Failed to get all device configs', { error });
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
			const hasConfig = hasDeviceConfig(vid, pid);
			logger.debug('Device config check result', {
				vid,
				pid,
				hasConfig,
			});
			return hasConfig;
		} catch (error) {
			logger.error('Failed to check device config', {
				vid,
				pid,
				error,
			});
			return false;
		}
	}

	/**
	 * Get count of configured devices
	 * @returns Number of devices with saved configurations
	 */
	getConfiguredDeviceCount(): number {

		try {
			const count = getDeviceCount();
			return count;
		} catch (error) {
			logger.error('Failed to get device count', { error });
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
		logger.debug('Setting device as default', {
			vid,
			pid,
			deviceId: `device_${vid}_${pid}`,
			deviceType,
		});

		try {
			// First, unset any existing default for this device type
			const allConfigs = this.getAllDeviceConfigs();
			const existingDefaults = Object.entries(allConfigs).filter(
				([_, config]) =>
					config.deviceType === deviceType && config.setToDefault,
			);

			logger.debug('Found existing default devices for type', {
				deviceType,
				existingDefaultCount: existingDefaults.length,
				existingDefaults: existingDefaults.map(([key, config]) => ({
					key,
					deviceType: config.deviceType,
					brand: config.brand,
					model: config.model,
				})),
			});

			for (const [key, config] of existingDefaults) {
				if (config.deviceType === deviceType && config.setToDefault) {
					const [existingVid, existingPid] = key.split(':');
					if (existingVid !== vid || existingPid !== pid) {
						logger.debug('Unsetting existing default device', {
							existingVid,
							existingPid,
							existingDeviceId: `device_${existingVid}_${existingPid}`,
							deviceType,
						});
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

			if (result !== null) {
				logger.info('Device set as default', {
					vid,
					pid,
					deviceType,
				});
			} else {
				logger.error('Failed to set device as default - update returned null', {
					vid,
					pid,
					deviceId: `device_${vid}_${pid}`,
					deviceType,
				});
			}
			return result !== null;
		} catch (error) {
			logger.error('Failed to set device as default', {
				vid,
				pid,
				deviceId: `device_${vid}_${pid}`,
				deviceType,
				error,
			});
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
		logger.debug('Unsetting device as default', {
			vid,
			pid,
			deviceId: `device_${vid}_${pid}`,
		});

		try {
			const result = await this.updateDeviceConfig(vid, pid, {
				setToDefault: false,
			});

			if (result !== null) {
				logger.info('Device unset as default successfully', {
					vid,
					pid,
					deviceId: `device_${vid}_${pid}`,
					deviceType: result.deviceType,
				});
			} else {
				logger.error(
					'Failed to unset device as default - update returned null',
					{
						vid,
						pid,
						deviceId: `device_${vid}_${pid}`,
					},
				);
			}
			return result !== null;
		} catch (error) {
			logger.error('Failed to unset device as default', {
				vid,
				pid,
				deviceId: `device_${vid}_${pid}`,
				error,
			});
			return false;
		}
	}
}
