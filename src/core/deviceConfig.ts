import * as storage from './persistentStorage';
import type { DeviceConfig } from './types';

const createDeviceKey = (vid: string, pid: string): string => {
	return `device_${vid}_${pid}`;
};

const isValidBaudRate = (value: unknown): boolean => {
	return (
		value === 'not-supported' ||
		(typeof value === 'number' &&
			[
				110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600,
				115200, 128000, 256000,
			].includes(value))
	);
};

const validateConfig = (config: Partial<DeviceConfig>): boolean => {
	for (const [field, value] of Object.entries(config)) {
		switch (field) {
			case 'deviceType':
				if (
					typeof value !== 'string' ||
					!['printer', 'scanner', 'scale', 'unassigned'].includes(value)
				) {
					return false;
				}
				break;
			case 'brand':
			case 'model':
				if (typeof value !== 'string' || value.trim() === '') {
					return false;
				}
				break;
			case 'baudrate':
				if (!isValidBaudRate(value)) {
					return false;
				}
				break;
			case 'setToDefault':
				if (typeof value !== 'boolean') {
					return false;
				}
				break;
			default:
				return false;
		}
	}
	return true;
};

const filterDeviceKeys = (
	allValues: Record<string, unknown>,
): Record<string, DeviceConfig> => {
	const deviceConfigs: Record<string, DeviceConfig> = {};
	for (const key in allValues) {
		if (key.startsWith('device_')) {
			deviceConfigs[key] = allValues[key] as DeviceConfig;
		}
	}
	return deviceConfigs;
};

// Main functions
export const saveDeviceConfig = (
	vid: string,
	pid: string,
	config: DeviceConfig,
): void => {
	const key = createDeviceKey(vid, pid);
	storage.setValue<DeviceConfig>(key, config);
};

export const getDeviceConfig = (
	vid: string,
	pid: string,
): DeviceConfig | null => {
	const key = createDeviceKey(vid, pid);
	return storage.getValue<DeviceConfig>(key) || null;
};

export const updateDeviceConfig = (
	vid: string,
	pid: string,
	config: Partial<DeviceConfig>,
): DeviceConfig | null => {
	if (!vid || !pid || !config || Object.keys(config).length === 0) {
		return null;
	}

	if (!validateConfig(config)) {
		return null;
	}

	const existingConfig = getDeviceConfig(vid, pid);
	if (!existingConfig) {
		return null;
	}

	const updatedConfig: DeviceConfig = { ...existingConfig, ...config };
	saveDeviceConfig(vid, pid, updatedConfig);
	return updatedConfig;
};

export const getAllDeviceConfig = (): Record<string, DeviceConfig> => {
	const allValues = storage.getAllValues();
	return filterDeviceKeys(allValues);
};

export const deleteDeviceConfig = (vid: string, pid: string): boolean => {
	const key = createDeviceKey(vid, pid);
	if (!storage.getValue<DeviceConfig>(key)) {
		return false;
	}

	storage.unsetValue(key);
	return true;
};

export const clearAllDevices = (): boolean => {
	try {
		const allValues = storage.getAllValues();
		let deleted = 0;

		for (const key in allValues) {
			if (key.startsWith('device_')) {
				storage.unsetValue(key);
				deleted++;
			}
		}

		return deleted > 0;
	} catch {
		return false;
	}
};

export const hasDeviceConfig = (vid: string, pid: string): boolean => {
	const key = createDeviceKey(vid, pid);
	return storage.getValue<DeviceConfig>(key) !== undefined;
};

export const getDeviceCount = (): number => {
	const allValues = storage.getAllValues();
	return Object.keys(allValues).filter((key) => key.startsWith('device_'))
		.length;
};
