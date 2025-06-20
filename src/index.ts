import { DeviceManager } from './managers/deviceManager';
import { PrinterManager } from './managers/printerManager';
import { ScaleManager } from './managers/scaleManager';
import { ScannerManager } from './managers/scannerManager';

const deviceManager = new DeviceManager();
const printerManager = new PrinterManager(deviceManager);
const scannerManager = new ScannerManager(deviceManager);
const scaleManager = new ScaleManager(deviceManager);

deviceManager.onDeviceConnect((d)=>{
	console.log(`Device connected ${JSON.stringify(d)}`);
})

deviceManager.onDeviceDisconnect((d)=>{
	console.log(`Device diconnected ${JSON.stringify(d)}`);
})

deviceManager.setDeviceConfig('0x26f1', '0x5650', {deviceType: 'scanner', setToDefault: true, baudrate: 9600, model: 'Table Top PD-310', brand: 'balajiPOS'}).then()
deviceManager.setDeviceConfig('0x67b', '0x23a3', {deviceType: 'scale', setToDefault: true, baudrate: 9600, model: 'DS-252', brand: 'Essae'}).then()

scannerManager.onScanData((d)=>{
	console.log(`Scan data ${JSON.stringify(d)}`);
})

scaleManager.onWeightData((data)=>{
	console.log(`Weight data ${JSON.stringify(data)}`);
})

deviceManager.start().then();