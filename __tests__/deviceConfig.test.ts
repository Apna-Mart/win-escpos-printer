import {
	saveDeviceConfig,
	getDeviceConfig,
	updateDeviceConfig,
	getAllDeviceConfig,
	deleteDeviceConfig,
	clearAllDevices,
	hasDeviceConfig,
	getDeviceCount,
} from '../src/core/deviceConfig';
import { type DeviceConfig } from '../src/core/types';
import * as storage from '../src/core/persistentStorage';

const mockValidConfig: DeviceConfig = {
	deviceType: 'printer',
	brand: 'HP',
	model: 'LaserJet',
	baudrate: 9600,
	setToDefault: true,
};

const mockValidConfig2: DeviceConfig = {
	deviceType: 'scanner',
	brand: 'Canon',
	model: 'CanoScan',
	baudrate: 'not-supported',
	setToDefault: false,
};

describe('deviceConfig', () => {
	beforeEach(() => {
		// Clear storage before each test
		storage.clear();
	});

	afterAll(() => {
		// Clean up after all tests
		storage.clear();
	});
	describe('saveDeviceConfig', () => {
		it('should save device config successfully', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			const result = getDeviceConfig('1234', '5678');
			expect(result).toEqual(mockValidConfig);
		});

		it('should overwrite existing config', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			saveDeviceConfig('1234', '5678', mockValidConfig2);
			const result = getDeviceConfig('1234', '5678');
			expect(result).toEqual(mockValidConfig2);
		});
	});

	describe('getDeviceConfig', () => {
		it('should return config when it exists', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			const result = getDeviceConfig('1234', '5678');
			expect(result).toEqual(mockValidConfig);
		});

		it('should return null when config does not exist', () => {
			const result = getDeviceConfig('9999', '0000');
			expect(result).toBeNull();
		});

		it('should handle empty vid/pid', () => {
			const result1 = getDeviceConfig('', '5678');
			const result2 = getDeviceConfig('1234', '');
			const result3 = getDeviceConfig('', '');
			expect(result1).toBeNull();
			expect(result2).toBeNull();
			expect(result3).toBeNull();
		});
	});

	describe('updateDeviceConfig', () => {
		beforeEach(() => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
		});

		it('should update existing config with valid partial config', () => {
			const partialConfig = { brand: 'Updated Brand', baudrate: 115200 as const };
			const result = updateDeviceConfig('1234', '5678', partialConfig);
			
			expect(result).toEqual({
				...mockValidConfig,
				...partialConfig,
			});
		});

		it('should return null for non-existent device', () => {
			const result = updateDeviceConfig('9999', '0000', { brand: 'Test' });
			expect(result).toBeNull();
		});

		it('should return null for empty vid/pid', () => {
			const result1 = updateDeviceConfig('', '5678', { brand: 'Test' });
			const result2 = updateDeviceConfig('1234', '', { brand: 'Test' });
			const result3 = updateDeviceConfig('', '', { brand: 'Test' });
			
			expect(result1).toBeNull();
			expect(result2).toBeNull();
			expect(result3).toBeNull();
		});

		it('should return null for empty config', () => {
			const result = updateDeviceConfig('1234', '5678', {});
			expect(result).toBeNull();
		});

		it('should return null for null/undefined config', () => {
			const result1 = updateDeviceConfig('1234', '5678', null as any);
			const result2 = updateDeviceConfig('1234', '5678', undefined as any);
			
			expect(result1).toBeNull();
			expect(result2).toBeNull();
		});

		describe('validation tests', () => {
			it('should reject invalid deviceType', () => {
				const result = updateDeviceConfig('1234', '5678', { deviceType: 'invalid' as any });
				expect(result).toBeNull();
			});

			it('should accept all valid deviceTypes', () => {
				const validTypes = ['printer', 'scanner', 'scale', 'unassigned'] as const;
				
				for (const deviceType of validTypes) {
					const result = updateDeviceConfig('1234', '5678', { deviceType });
					expect(result).not.toBeNull();
					expect(result?.deviceType).toBe(deviceType);
				}
			});

			it('should reject empty brand', () => {
				const result1 = updateDeviceConfig('1234', '5678', { brand: '' });
				const result2 = updateDeviceConfig('1234', '5678', { brand: '   ' });
				
				expect(result1).toBeNull();
				expect(result2).toBeNull();
			});

			it('should reject non-string brand', () => {
				const result = updateDeviceConfig('1234', '5678', { brand: 123 as any });
				expect(result).toBeNull();
			});

			it('should reject empty model', () => {
				const result1 = updateDeviceConfig('1234', '5678', { model: '' });
				const result2 = updateDeviceConfig('1234', '5678', { model: '   ' });
				
				expect(result1).toBeNull();
				expect(result2).toBeNull();
			});

			it('should reject non-string model', () => {
				const result = updateDeviceConfig('1234', '5678', { model: 123 as any });
				expect(result).toBeNull();
			});

			it('should accept valid baudrates', () => {
				const validBaudrates = [110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 128000, 256000, 'not-supported'] as const;
				
				for (const baudrate of validBaudrates) {
					const result = updateDeviceConfig('1234', '5678', { baudrate });
					expect(result).not.toBeNull();
					expect(result?.baudrate).toBe(baudrate);
				}
			});

			it('should reject invalid baudrates', () => {
				const invalidBaudrates = [100, 500, 999999, 'invalid', null, undefined];
				
				for (const baudrate of invalidBaudrates) {
					const result = updateDeviceConfig('1234', '5678', { baudrate: baudrate as any });
					expect(result).toBeNull();
				}
			});

			it('should reject non-boolean setToDefault', () => {
				const result1 = updateDeviceConfig('1234', '5678', { setToDefault: 'true' as any });
				const result2 = updateDeviceConfig('1234', '5678', { setToDefault: 1 as any });
				const result3 = updateDeviceConfig('1234', '5678', { setToDefault: null as any });
				
				expect(result1).toBeNull();
				expect(result2).toBeNull();
				expect(result3).toBeNull();
			});

			it('should accept boolean setToDefault', () => {
				const result1 = updateDeviceConfig('1234', '5678', { setToDefault: true });
				const result2 = updateDeviceConfig('1234', '5678', { setToDefault: false });
				
				expect(result1).not.toBeNull();
				expect(result2).not.toBeNull();
				expect(result1?.setToDefault).toBe(true);
				expect(result2?.setToDefault).toBe(false);
			});

			it('should reject unknown fields', () => {
				const result = updateDeviceConfig('1234', '5678', { unknownField: 'value' } as any);
				expect(result).toBeNull();
			});
		});
	});

	describe('getAllDeviceConfig', () => {
		it('should return empty object when no devices exist', () => {
			const result = getAllDeviceConfig();
			expect(result).toEqual({});
		});

		it('should return all device configs', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			saveDeviceConfig('ABCD', 'EFGH', mockValidConfig2);
			
			const result = getAllDeviceConfig();
			
			expect(Object.keys(result)).toHaveLength(2);
			expect(result['device_1234_5678']).toEqual(mockValidConfig);
			expect(result['device_ABCD_EFGH']).toEqual(mockValidConfig2);
		});

		it('should only return device keys, not other storage keys', () => {
			storage.setValue('other_key', 'other_value');
			saveDeviceConfig('1234', '5678', mockValidConfig);
			
			const result = getAllDeviceConfig();
			
			expect(Object.keys(result)).toHaveLength(1);
			expect(result['device_1234_5678']).toEqual(mockValidConfig);
			expect(result['other_key']).toBeUndefined();
		});
	});

	describe('deleteDeviceConfig', () => {
		it('should delete existing device config', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			expect(hasDeviceConfig('1234', '5678')).toBe(true);
			
			const result = deleteDeviceConfig('1234', '5678');
			
			expect(result).toBe(true);
			expect(hasDeviceConfig('1234', '5678')).toBe(false);
		});

		it('should return false for non-existent device', () => {
			const result = deleteDeviceConfig('9999', '0000');
			expect(result).toBe(false);
		});

		it('should handle empty vid/pid', () => {
			const result1 = deleteDeviceConfig('', '5678');
			const result2 = deleteDeviceConfig('1234', '');
			const result3 = deleteDeviceConfig('', '');
			
			expect(result1).toBe(false);
			expect(result2).toBe(false);
			expect(result3).toBe(false);
		});
	});

	describe('clearAllDevices', () => {
		it('should clear all device configs', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			saveDeviceConfig('ABCD', 'EFGH', mockValidConfig2);
			expect(getDeviceCount()).toBe(2);
			
			const result = clearAllDevices();
			
			expect(result).toBe(true);
			expect(getDeviceCount()).toBe(0);
		});

		it('should return false when no devices to clear', () => {
			const result = clearAllDevices();
			expect(result).toBe(false);
		});

		it('should only clear device keys, not other storage keys', () => {
			storage.setValue('other_key', 'other_value');
			saveDeviceConfig('1234', '5678', mockValidConfig);
			
			const result = clearAllDevices();
			
			expect(result).toBe(true);
			expect(getDeviceCount()).toBe(0);
			expect(storage.getValue('other_key')).toBe('other_value');
		});

		it('should handle storage errors gracefully', () => {
			const originalGetAllValues = storage.getAllValues;
			jest.spyOn(storage, 'getAllValues').mockImplementation(() => {
				throw new Error('Storage error');
			});
			
			const result = clearAllDevices();
			
			expect(result).toBe(false);
			jest.restoreAllMocks();
		});
	});

	describe('hasDeviceConfig', () => {
		it('should return true for existing device', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			const result = hasDeviceConfig('1234', '5678');
			expect(result).toBe(true);
		});

		it('should return false for non-existent device', () => {
			const result = hasDeviceConfig('9999', '0000');
			expect(result).toBe(false);
		});

		it('should handle empty vid/pid', () => {
			const result1 = hasDeviceConfig('', '5678');
			const result2 = hasDeviceConfig('1234', '');
			const result3 = hasDeviceConfig('', '');
			
			expect(result1).toBe(false);
			expect(result2).toBe(false);
			expect(result3).toBe(false);
		});
	});

	describe('getDeviceCount', () => {
		it('should return 0 when no devices exist', () => {
			const result = getDeviceCount();
			expect(result).toBe(0);
		});

		it('should return correct count with multiple devices', () => {
			saveDeviceConfig('1234', '5678', mockValidConfig);
			expect(getDeviceCount()).toBe(1);
			
			saveDeviceConfig('ABCD', 'EFGH', mockValidConfig2);
			expect(getDeviceCount()).toBe(2);
			
			deleteDeviceConfig('1234', '5678');
			expect(getDeviceCount()).toBe(1);
		});

		it('should only count device keys, not other storage keys', () => {
			storage.setValue('other_key', 'other_value');
			storage.setValue('another_key', 'another_value');
			saveDeviceConfig('1234', '5678', mockValidConfig);
			
			const result = getDeviceCount();
			expect(result).toBe(1);
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle special characters in vid/pid', () => {
			const specialVid = 'AB@#$%CD';
			const specialPid = 'EF^&*()GH';
			
			saveDeviceConfig(specialVid, specialPid, mockValidConfig);
			const result = getDeviceConfig(specialVid, specialPid);
			
			expect(result).toEqual(mockValidConfig);
		});

		it('should handle very long vid/pid strings', () => {
			const longVid = 'A'.repeat(1000);
			const longPid = 'B'.repeat(1000);
			
			saveDeviceConfig(longVid, longPid, mockValidConfig);
			const result = getDeviceConfig(longVid, longPid);
			
			expect(result).toEqual(mockValidConfig);
		});

		it('should handle unicode characters in config', () => {
			const unicodeConfig: DeviceConfig = {
				deviceType: 'printer',
				brand: '中文品牌',
				model: 'モデル名',
				baudrate: 9600,
				setToDefault: true,
			};
			
			saveDeviceConfig('1234', '5678', unicodeConfig);
			const result = getDeviceConfig('1234', '5678');
			
			expect(result).toEqual(unicodeConfig);
		});

		it('should maintain config integrity after multiple operations', () => {
			// Save initial config
			saveDeviceConfig('1234', '5678', mockValidConfig);
			
			// Update multiple times
			updateDeviceConfig('1234', '5678', { brand: 'Brand1' });
			updateDeviceConfig('1234', '5678', { model: 'Model1' });
			updateDeviceConfig('1234', '5678', { baudrate: 115200 });
			
			const result = getDeviceConfig('1234', '5678');
			
			expect(result).toEqual({
				deviceType: 'printer',
				brand: 'Brand1',
				model: 'Model1',
				baudrate: 115200,
				setToDefault: true,
			});
		});
	});
});