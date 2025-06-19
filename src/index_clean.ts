// Clean Device Manager API
export { DeviceManager } from './deviceManager';
export { PrinterManager } from './printerManager';
export { ScannerManager, type ScanDataCallback } from './scannerManager';
export { ScaleManager, type WeightDataCallback } from './scaleManager';
export { DeviceEventEmitter, type DeviceConnectCallback, type DeviceDisconnectCallback, type DeviceDataCallback, type DeviceErrorCallback } from './deviceEvents';

// Re-export types for convenience
export type { TerminalDevice, DeviceType, DeviceConfig, BaudRate, DeviceStatus } from './types';

import { DeviceManager } from './deviceManager';
import { PrinterManager } from './printerManager';
import { ScannerManager } from './scannerManager';
import { ScaleManager } from './scaleManager';

// Convenience function to create all managers
export function createDeviceManagers() {
	const deviceManager = new DeviceManager();
	const printerManager = new PrinterManager(deviceManager);
	const scannerManager = new ScannerManager(deviceManager);
	const scaleManager = new ScaleManager(deviceManager);

	return {
		deviceManager,
		printerManager,
		scannerManager,
		scaleManager
	};
}

// Re-export existing functionality for backward compatibility
export * from './deviceDetector';
export * from './deviceConfig';