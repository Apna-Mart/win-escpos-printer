// Simple usage example showing the new split managers
import { createDeviceManagers } from './index_clean';

async function simpleExample() {
	// Create all managers at once
	const { deviceManager, printerManager, scannerManager, scaleManager } = createDeviceManagers();

	// Set up events
	deviceManager.onDeviceConnect(device => {
		console.log(`Device connected: ${device.id} (${device.meta.deviceType})`);
	});

	// 🔥 NEW: Global callbacks work even before devices connect!
	scannerManager.onScanData(data => {
		console.log(`🌍 Global scan: ${data}`);
	});

	scaleManager.onWeightData(weight => {
		console.log(`🌍 Global weight: ${weight}`);
	});

	// Start device manager
	await deviceManager.start();

	// 🔥 NEW: These work even if default devices aren't connected yet!
	// Callbacks are queued and will start working when devices connect
	console.log('Setting up callbacks (work even if devices not connected yet)...');

	// Multiple callbacks on same device - all will receive data
	await scannerManager.scanFromDefault(data => {
		console.log(`📄 Scanner A: ${data}`);
	});

	await scannerManager.scanFromDefault(data => {
		console.log(`📄 Scanner B: ${data}`);
	});

	await scaleManager.readFromDefault(weight => {
		console.log(`⚖️  Scale A: ${weight}`);
	});

	await scaleManager.readFromDefault(weight => {
		console.log(`⚖️  Scale B: ${weight}`);
	});

	console.log('✅ All callbacks set up! They will start working when devices connect/reconnect');

	// Example operations
	try {
		// Print to default printer
		await printerManager.printToDefault('🔥 Enhanced Device Manager Test\n\n\n');
		
		// 🔥 NEW: One-time weight reading with timeout
		setTimeout(async () => {
			try {
				const weight = await scaleManager.getCurrentWeight(3000);
				console.log(`📊 One-time weight reading: ${weight}`);
			} catch (error) {
				console.log(`❌ Weight timeout: ${error}`);
			}
		}, 5000);
		
	} catch (error) {
		console.error('Operation failed:', error);
	}

	console.log('\n🎯 Key Features Demonstrated:');
	console.log('✅ Callbacks work before devices connect');
	console.log('✅ Multiple listeners on same device');
	console.log('✅ Callbacks persist across device disconnects/reconnects');
	console.log('✅ Global callbacks for any device of same type');
	console.log('✅ One-time reading with timeout');

	// Clean shutdown
	setTimeout(async () => {
		await scannerManager.stopAllScanning();
		await scaleManager.stopAllReading();
		await deviceManager.stop();
		console.log('✅ Demo completed');
	}, 30000);
}

simpleExample().catch(console.error);