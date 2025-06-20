import { createDeviceManagers } from "./src";

const {deviceManager, scannerManager, scaleManager, printerManager} = createDeviceManagers();
deviceManager.onDeviceConnect((d) => {
	console.log(`Device connected ${JSON.stringify(d)}`);
})

deviceManager.onDeviceDisconnect((d) => {
	console.log(`Device diconnected ${JSON.stringify(d)}`);
})

// deviceManager.setDeviceConfig('0x26f1', '0x5650', {deviceType: 'scanner', setToDefault: true, baudrate: 9600, model: 'Table Top PD-310', brand: 'balajiPOS'}).then()
// deviceManager.setDeviceConfig('0x67b', '0x23a3', {deviceType: 'scale', setToDefault: true, baudrate: 9600, model: 'DS-252', brand: 'Essae'}).then()
// deviceManager.setDeviceConfig('0x483', '0x5743', {deviceType: 'printer', setToDefault: true, baudrate: "not-supported", model: 'RP-803', brand: 'balajiPOS'}).then()

scannerManager.onScanData((d) => {
	console.log(`Scan data ${JSON.stringify(d)}`);
	printerManager.printToDefault('Scan data: ' + JSON.stringify(d) + '').catch(()=>{
		console.log('Error printing');
	})
})

scaleManager.onWeightData((data) => {
	console.log(`Weight data ${JSON.stringify(data)}`);
})

deviceManager.start().then();
