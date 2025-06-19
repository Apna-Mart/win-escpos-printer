import { type Device, usb } from 'usb';
import Serial from '@node-escpos/serialport-adapter';
import USB from '@node-escpos/usb-adapter';
import { ThermalWindowPrinter } from "./windows_printer";
import { TerminalDevice } from "./types";
import { getDeviceConfig, saveDeviceConfig } from "./deviceConfig";


// Helper function to format ID as hexadecimal string
const toHexString = (value: number | string): string => {
	const num = typeof value === 'string' ? Number.parseInt(value, 16) : value;
	return `0x${num.toString(16).toLowerCase()}`;
};

// Filter USB devices excluding common system device classes
function getFilteredUsbDevices(): Device[] {
	const excludedClasses = new Set([3, 9, 11, 14, 224, 239]);
	return usb.getDeviceList().filter((device) =>
		!excludedClasses.has(device.deviceDescriptor.bDeviceClass)
	);
}

// Get Windows thermal printers
function getWindowsPrinters(connectedDevices: Device[]): TerminalDevice[] {
	const devices: TerminalDevice[] = [];
	const availablePrinters = ThermalWindowPrinter.getAvailablePrinters();

	const pattern = /^USB\d+$/;
	const connectedPrintersOnWindows = connectedDevices.flatMap(device =>
		availablePrinters.filter(printer =>
			printer.isUsb && pattern.test(printer.portName) &&
			Number.parseInt(printer.pid, 16) === device.deviceDescriptor.idProduct &&
			Number.parseInt(printer.vid, 16) === device.deviceDescriptor.idVendor
		)
	);

	for (const printer of connectedPrintersOnWindows) {
		const id = 'device_' + toHexString(printer.vid) + '_' + toHexString(printer.pid);
		const terminalDevice: TerminalDevice = {
			capabilities: ['write'],
			id: id,
			name: printer.name,
			meta: {deviceType: 'printer', baudrate: 'not-supported', setToDefault: false, brand: '', model: ''},
			path: printer.portName,
			pid: toHexString(printer.pid),
			vid: toHexString(printer.vid),
			manufacturer: '',
			serialNumber: ''
		};
		devices.push(terminalDevice);
	}

	return devices;
}

// Get macOS thermal printers
function getMacPrinters(connectedDevices: Device[]): TerminalDevice[] {
	const devices: TerminalDevice[] = [];
	const availablePrinters = USB.findPrinter();

	const connectPrintersOnMac = connectedDevices.flatMap(device =>
		availablePrinters.filter(printer =>
			printer.deviceDescriptor.idProduct === device.deviceDescriptor.idProduct &&
			printer.deviceDescriptor.idVendor === device.deviceDescriptor.idVendor
		)
	);

	for (const printer of connectPrintersOnMac) {
		const id = 'device_' + toHexString(printer.deviceDescriptor.idVendor) + '_' + toHexString(printer.deviceDescriptor.idProduct);
		const terminalDevice: TerminalDevice = {
			capabilities: ['write'],
			id: id,
			name:'',
			meta: {deviceType: 'printer', baudrate: 'not-supported', setToDefault: false, brand: '', model: ''},
			path: printer.deviceAddress.toString(),
			pid: toHexString(printer.deviceDescriptor.idProduct),
			vid: toHexString(printer.deviceDescriptor.idVendor),
			manufacturer: (printer.deviceDescriptor.iManufacturer || '').toString(),
			serialNumber: (printer.deviceDescriptor.iSerialNumber || '').toString()
		};
		devices.push(terminalDevice);
	}

	return devices;
}

// Get serial port devices
async function getSerialDevices(connectedDevices: Device[]): Promise<TerminalDevice[]> {
	const devices: TerminalDevice[] = [];
	const portInfos = await Serial.list();

	const serialPorts = connectedDevices.flatMap(device =>
		portInfos.filter(port =>
			Number.parseInt(port.productId || '0', 16) === device.deviceDescriptor.idProduct &&
			Number.parseInt(port.vendorId || '0', 16) === device.deviceDescriptor.idVendor
		)
	);

	for (const port of serialPorts) {
		const id = 'device_' + toHexString(port.vendorId || '0') + '_' + toHexString(port.productId || '0');
		const terminalDevice: TerminalDevice = {
			capabilities: ['read'],
			id: id,
			meta: {deviceType: 'unassigned', baudrate: 9600, setToDefault: false, brand: '', model: ''},
			path: port.path,
			name:'',
			pid: toHexString(port.productId || '0'),
			vid: toHexString(port.vendorId || '0'),
			manufacturer: port.manufacturer || '',
			serialNumber: port.serialNumber || ''
		};
		devices.push(terminalDevice);
	}

	return devices;
}

export function devicesWithSavedConfig(devices: TerminalDevice[]) {
	return devices.map(device => {
		const saved = getDeviceConfig(device.vid, device.pid)
		if (saved) {
			device.meta = saved;
		}
		return device;
	})
}


// Main function to get all connected devices
export async function getConnectedDevices(): Promise<TerminalDevice[]> {
	const devices: TerminalDevice[] = [];
	const connectedDevices = getFilteredUsbDevices();

	// Platform-specific printer detection
	if (process.platform === 'win32') {
		devices.push(...getWindowsPrinters(connectedDevices));
	}

	if (process.platform === 'darwin') {
		devices.push(...getMacPrinters(connectedDevices));
	}

	// Serial port detection
	const serialDevices = await getSerialDevices(connectedDevices);
	devices.push(...serialDevices);

	return devices;
}