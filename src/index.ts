import { getConnectedDevices } from "./deviceDetector";
import { type Device, usb } from 'usb';
import Serial from '@node-escpos/serialport-adapter';
import USB from '@node-escpos/usb-adapter';
import { ThermalWindowPrinter } from "./windows_printer";
import { TerminalDevice } from "./types";

getConnectedDevices().then(devices => {
	console.log(devices);
})


USB.findPrinter().forEach(printer => {
	console.log(printer);
})

Serial.list().then(ports => {
	ports.forEach(port => {
		console.log(port);
	})
})