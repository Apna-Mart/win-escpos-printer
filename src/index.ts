// Core managers

import { type LoggerConfig, logger } from './core/logger';
import type { RetryOptions } from './core/retryUtils';
import { DeviceManager } from './managers/deviceManager';
import { PrinterManager } from './managers/printerManager';
import { ScaleManager } from './managers/scaleManager';
import { ScannerManager } from './managers/scannerManager';

export { BarcodeScannerAdapter } from './adaptor/barcodeScannerAdaptor';
export {
	DeviceAdapter,
	ReadableDevice,
	WritableDevice,
} from './adaptor/deviceAdaptor';
export { UnixPrinterAdapter } from './adaptor/unixPrinterAdapter';
export { WeightScaleAdapter } from './adaptor/weightScaleAdaptor';
export { WindowsPrinterAdapter } from './adaptor/windowsPrinterAdapter';
// Core utilities
export * from './core/deviceConfig';
export {
	devicesWithSavedConfig,
	getConnectedDevices,
} from './core/deviceDetector';
export { DeviceEventEmitter } from './core/deviceEvents';
export {
	type LogCallback,
	type LoggerConfig,
	type LogLevel,
	logger,
} from './core/logger';
export { PersistentStorage } from './core/persistentStorage';
export {
	RetryError,
	type RetryOptions,
	withExponentialBackoff,
} from './core/retryUtils';
// Types
export * from './core/types';
// Adaptors
export { DeviceManager } from './managers/deviceManager';
export { PrinterManager } from './managers/printerManager';
export { ScaleManager } from './managers/scaleManager';
export { ScannerManager } from './managers/scannerManager';

// Services
export { DeviceConfigService } from './services/deviceConfigService';

// Factory function for easy initialization
export function createDeviceManagers(options?: {
	scannerRetry?: Partial<RetryOptions>;
	scaleRetry?: Partial<RetryOptions>;
	logging?: LoggerConfig;
}) {
	// Configure logging if provided
	if (options?.logging) {
		logger.configure(options.logging);
	}

	const deviceManager = new DeviceManager();
	const printerManager = new PrinterManager(deviceManager);
	const scannerManager = new ScannerManager(
		deviceManager,
		options?.scannerRetry,
	);
	const scaleManager = new ScaleManager(deviceManager, options?.scaleRetry);

	return {
		deviceManager,
		printerManager,
		scannerManager,
		scaleManager,
	};
}
