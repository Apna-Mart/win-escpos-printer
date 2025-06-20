import { DeviceManager } from '../managers/deviceManager';
import { PrinterManager } from '../managers/printerManager';
import { ScannerManager } from '../managers/scannerManager';
import { ScaleManager } from '../managers/scaleManager';
import { PosWebSocketServer } from './posWebSocketServer';

export interface PosSystem {
	deviceManager: DeviceManager;
	printerManager: PrinterManager;
	scannerManager: ScannerManager;
	scaleManager: ScaleManager;
	webSocketServer: PosWebSocketServer;
}

export function createPosWebSocketServer(port = 8080): PosSystem {
	// Initialize device managers
	const deviceManager = new DeviceManager();
	const printerManager = new PrinterManager(deviceManager);
	const scannerManager = new ScannerManager(deviceManager);
	const scaleManager = new ScaleManager(deviceManager);

	// Create WebSocket server
	const webSocketServer = new PosWebSocketServer(
		deviceManager,
		printerManager,
		scannerManager,
		scaleManager,
		port,
	);

	return {
		deviceManager,
		printerManager,
		scannerManager,
		scaleManager,
		webSocketServer,
	};
}

export async function startPosSystem(port = 8080): Promise<PosSystem> {
	const system = createPosWebSocketServer(port);
	
	// Start the device manager
	await system.deviceManager.start();
	
	return system;
}

export async function stopPosSystem(system: PosSystem): Promise<void> {
	// Stop WebSocket server
	system.webSocketServer.close();
	
	// Stop all scanning/reading
	await system.scannerManager.stopAllScanning();
	await system.scaleManager.stopAllReading();
	await system.printerManager.closeAllPrinterAdapters();
	
	// Stop device manager
	await system.deviceManager.stop();
}