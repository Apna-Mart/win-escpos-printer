// Core managers
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
export { PersistentStorage } from './core/persistentStorage';
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
export function createDeviceManagers() {
	const deviceManager = new DeviceManager();
	const printerManager = new PrinterManager(deviceManager);
	const scannerManager = new ScannerManager(deviceManager);
	const scaleManager = new ScaleManager(deviceManager);

	return {
		deviceManager,
		printerManager,
		scannerManager,
		scaleManager,
	};
}
