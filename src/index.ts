import { DeviceManager } from './managers/deviceManager';
import { PrinterManager } from './managers/printerManager';
import { ScaleManager } from './managers/scaleManager';
import { ScannerManager } from './managers/scannerManager';

async function demonstratePersistentCallbacks() {
	console.log('🚀 Demonstrating Persistent Callbacks and Auto-Reconnection\n');

	// Initialize managers
	const deviceManager = new DeviceManager();
	const printerManager = new PrinterManager(deviceManager);
	const scannerManager = new ScannerManager(deviceManager);
	const scaleManager = new ScaleManager(deviceManager);

	// Set up device connection/disconnection events
	deviceManager.onDeviceConnect((device) => {
		console.log(
			`✅ Device Connected: ${device.id} (${device.meta.deviceType})`,
		);
	});

	deviceManager.onDeviceDisconnect((deviceId) => {
		console.log(`❌ Device Disconnected: ${deviceId}`);
	});

	// Start device manager
	await deviceManager.start();
	console.log('📡 Device manager started\n');

	// 🔥 DEMO 1: Setting up callbacks BEFORE devices connect
	console.log('🔥 DEMO 1: Setting up callbacks BEFORE devices are connected');
	console.log(
		'This will queue callbacks and start scanning/reading when devices connect\n',
	);

	// Set up scanner callback before device connects
	await scannerManager.scanFromDefault((data) => {
		console.log(`📄 [QUEUED CALLBACK] Scanned: ${data}`);
	});
	console.log(
		'✅ Scanner callback queued for default scanner (even if not connected yet)',
	);

	// Set up scale callback before device connects
	await scaleManager.readFromDefault((weight) => {
		console.log(`⚖️  [QUEUED CALLBACK] Weight: ${weight}`);
	});
	console.log(
		'✅ Scale callback queued for default scale (even if not connected yet)',
	);

	// 🔥 DEMO 2: Multiple listeners on same device
	console.log('\n🔥 DEMO 2: Multiple listeners on same device');

	await scannerManager.scanFromDefault((data) => {
		console.log(`📄 [LISTENER A] Scanned: ${data}`);
	});

	await scannerManager.scanFromDefault((data) => {
		console.log(`📄 [LISTENER B] Scanned: ${data}`);
	});

	await scaleManager.readFromDefault((weight) => {
		console.log(`⚖️  [LISTENER A] Weight: ${weight}`);
	});

	await scaleManager.readFromDefault((weight) => {
		console.log(`⚖️  [LISTENER B] Weight: ${weight}`);
	});

	console.log(
		'✅ Multiple callbacks set up - each scan/weight reading will trigger all callbacks',
	);

	// 🔥 DEMO 3: Global callbacks that work with any device
	console.log('\n🔥 DEMO 3: Global callbacks for any scanner/scale');

	scannerManager.onScanData((data) => {
		console.log(`📄 [GLOBAL] Any scanner data: ${data}`);
	});

	scaleManager.onWeightData((weight) => {
		console.log(`⚖️  [GLOBAL] Any scale data: ${weight}`);
	});

	console.log(
		'✅ Global callbacks set up - will receive data from ANY scanner/scale',
	);

	// 🔥 DEMO 4: One-time weight reading
	console.log('\n🔥 DEMO 4: One-time weight reading with timeout');

	setTimeout(async () => {
		try {
			console.log('⚖️  Getting current weight (5 second timeout)...');
			const weight = await scaleManager.getCurrentWeight(5000);
			console.log(`📊 Current weight: ${weight}`);
		} catch (error) {
			console.log(`❌ Weight reading failed: ${error}`);
		}
	}, 5000);

	// Show current device status
	setTimeout(() => {
		const devices = deviceManager.getDevices();
		console.log(`\n📋 Currently connected devices: ${devices.length}`);
		devices.forEach((device) => {
			console.log(
				`   ${device.id}: ${device.meta.deviceType} (default: ${device.meta.setToDefault})`,
			);
		});

		const activeScanners = scannerManager.getActiveScanners();
		const activeScales = scaleManager.getActiveScales();
		console.log(
			`📊 Active scanners: ${activeScanners.length} - ${activeScanners.join(', ')}`,
		);
		console.log(
			`📊 Active scales: ${activeScales.length} - ${activeScales.join(', ')}`,
		);
	}, 3000);

	// Instructions for user
	console.log('\n📋 INSTRUCTIONS:');
	console.log('1. Connect/disconnect your scanner and scale devices');
	console.log('2. Notice that callbacks are preserved across disconnections');
	console.log(
		'3. When devices reconnect, scanning/reading automatically resumes',
	);
	console.log(
		'4. Scan barcodes or place items on scale to see multiple callbacks trigger',
	);
	console.log(
		'5. Try setting device as default in your config to see auto-start behavior',
	);

	// Demonstration of callback management
	setTimeout(() => {
		console.log('\n🔧 DEMO: Callback Management');

		// Show how to remove specific callbacks
		const testCallback = (data: string) =>
			console.log(`Test callback: ${data}`);

		scannerManager.scanFromDefault(testCallback);
		console.log('✅ Added test callback');

		setTimeout(() => {
			scannerManager.removeDefaultCallback(testCallback);
			console.log('✅ Removed test callback');
		}, 2000);
	}, 10000);

	// Clean shutdown after 60 seconds
	setTimeout(async () => {
		console.log('\n🛑 Shutting down demo...');
		await scannerManager.stopAllScanning();
		await scaleManager.stopAllReading();
		await deviceManager.stop();
		console.log('✅ Demo completed successfully');
		process.exit(0);
	}, 60000);

	// Handle graceful shutdown on Ctrl+C
	process.on('SIGINT', async () => {
		console.log('\n🛑 Received SIGINT, shutting down gracefully...');
		await scannerManager.stopAllScanning();
		await scaleManager.stopAllReading();
		await deviceManager.stop();
		console.log('✅ Demo stopped successfully');
		process.exit(0);
	});
}

// Run the demonstration
demonstratePersistentCallbacks().catch((error) => {
	console.error('❌ Demo failed:', error);
	process.exit(1);
});
