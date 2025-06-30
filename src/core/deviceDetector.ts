import Serial from '@node-escpos/serialport-adapter';
import USB from '@node-escpos/usb-adapter';
import { type Device, usb } from 'usb';
import { getDeviceConfig } from './deviceConfig';
import { logger } from './logger';
import type { TerminalDevice } from './types';
import { type PrinterInfo, ThermalWindowPrinter } from './windows_printer';

// Helper function to format ID as hexadecimal string
const toHexString = (value: number | string): string => {
	const num = typeof value === 'string' ? Number.parseInt(value, 16) : value;
	return `0x${num.toString(16).toLowerCase()}`;
};

// Filter USB devices excluding common system device classes
function getFilteredUsbDevices(): Device[] {
	logger.debug('Scanning for USB devices');
	const excludedClasses = new Set([3, 9, 11, 14, 224, 239]);
	const allDevices = usb.getDeviceList();
	const filteredDevices = allDevices.filter(
		(device) => !excludedClasses.has(device.deviceDescriptor.bDeviceClass),
	);
	logger.debug('USB device scan completed', {
		totalDevices: allDevices.length,
		filteredDevices: filteredDevices.length,
		excludedClasses: Array.from(excludedClasses),
	});
	return filteredDevices;
}

// Get Windows thermal printers
function getWindowsPrinters(connectedDevices: Device[]): TerminalDevice[] {
	logger.debug('Detecting Windows thermal printers', {
		connectedDeviceCount: connectedDevices.length,
	});
	const printingDevices = USB.findPrinter();
	logger.debug('USB printing devices found', { count: printingDevices.length });

	const printersWithVidPid = connectedDevices.flatMap((device) =>
		printingDevices.filter(
			(printer) =>
				printer.deviceDescriptor.idProduct ===
					device.deviceDescriptor.idProduct &&
				printer.deviceDescriptor.idVendor === device.deviceDescriptor.idVendor,
		),
	);
	logger.debug('Matched printers with VID/PID', {
		count: printersWithVidPid.length,
	});

	if (printersWithVidPid.length === 0) {
		logger.debug('No Windows printers found with matching VID/PID');
		return [];
	}

	const connectedPrintersOnWindows: PrinterInfo[] = [];
	const devices: TerminalDevice[] = [];
	const availablePrinters = ThermalWindowPrinter.getAvailablePrinters();
	logger.debug('Available Windows printers', {
		count: availablePrinters.length,
		printers: availablePrinters.map((p) => ({
			name: p.name,
			portName: p.portName,
		})),
	});
	const pattern = /^USB\d+$/;
	const windowsPrinter = connectedDevices.flatMap((_device) =>
		availablePrinters.filter((printer) => pattern.test(printer.portName)),
	)[0];

	windowsPrinter.vid = toHexString(
		printersWithVidPid[0].deviceDescriptor.idVendor,
	);
	windowsPrinter.pid = toHexString(
		printersWithVidPid[0].deviceDescriptor.idProduct,
	);

	// TODO: Bruteforce logic added to add vid pid manually
	connectedPrintersOnWindows.push(windowsPrinter);

	logger.debug('Creating Windows printer devices', {
		count: connectedPrintersOnWindows.length,
	});
	for (const printer of connectedPrintersOnWindows) {
		const id = `device_${toHexString(printer.vid)}_${toHexString(printer.pid)}`;
		logger.debug('Creating Windows printer device', {
			id,
			name: printer.name,
			portName: printer.portName,
			vid: printer.vid,
			pid: printer.pid,
		});
		const terminalDevice: TerminalDevice = {
			capabilities: ['write'],
			id: id,
			name: printer.name,
			meta: {
				deviceType: 'printer',
				baudrate: 'not-supported',
				setToDefault: false,
				brand: '',
				model: '',
			},
			path: printer.portName,
			pid: toHexString(printer.pid),
			vid: toHexString(printer.vid),
			manufacturer: '',
			serialNumber: '',
		};
		devices.push(terminalDevice);
	}

	logger.debug('Windows printers detection completed', {
		deviceCount: devices.length,
	});
	return devices;
}

// Get macOS thermal printers
function getMacPrinters(connectedDevices: Device[]): TerminalDevice[] {
	logger.debug('Detecting macOS thermal printers', {
		connectedDeviceCount: connectedDevices.length,
	});
	const devices: TerminalDevice[] = [];
	const availablePrinters = USB.findPrinter();
	logger.debug('USB printing devices found on macOS', {
		count: availablePrinters.length,
	});

	const connectPrintersOnMac = connectedDevices.flatMap((device) =>
		availablePrinters.filter(
			(printer) =>
				printer.deviceDescriptor.idProduct ===
					device.deviceDescriptor.idProduct &&
				printer.deviceDescriptor.idVendor === device.deviceDescriptor.idVendor,
		),
	);
	logger.debug('Matched macOS printers with VID/PID', {
		count: connectPrintersOnMac.length,
	});

	for (const printer of connectPrintersOnMac) {
		const id =
			'device_' +
			toHexString(printer.deviceDescriptor.idVendor) +
			'_' +
			toHexString(printer.deviceDescriptor.idProduct);
		const terminalDevice: TerminalDevice = {
			capabilities: ['write'],
			id: id,
			name: '',
			meta: {
				deviceType: 'printer',
				baudrate: 'not-supported',
				setToDefault: false,
				brand: '',
				model: '',
			},
			path: printer.deviceAddress.toString(),
			pid: toHexString(printer.deviceDescriptor.idProduct),
			vid: toHexString(printer.deviceDescriptor.idVendor),
			manufacturer: (printer.deviceDescriptor.iManufacturer || '').toString(),
			serialNumber: (printer.deviceDescriptor.iSerialNumber || '').toString(),
		};
		devices.push(terminalDevice);
	}

	return devices;
}

// Get serial port devices
async function getSerialDevices(
	connectedDevices: Device[],
): Promise<TerminalDevice[]> {
	logger.debug('Detecting serial port devices', {
		connectedDeviceCount: connectedDevices.length,
	});
	const devices: TerminalDevice[] = [];
	const portInfos = await Serial.list();
	logger.debug('Serial ports found', { count: portInfos.length });

	const serialPorts = connectedDevices.flatMap((device) =>
		portInfos.filter(
			(port) =>
				Number.parseInt(port.productId || '0', 16) ===
					device.deviceDescriptor.idProduct &&
				Number.parseInt(port.vendorId || '0', 16) ===
					device.deviceDescriptor.idVendor,
		),
	);
	logger.debug('Matched serial ports with VID/PID', {
		count: serialPorts.length,
	});

	for (const port of serialPorts) {
		const id =
			'device_' +
			toHexString(port.vendorId || '0') +
			'_' +
			toHexString(port.productId || '0');
		logger.debug('Creating serial device', {
			id,
			path: port.path,
			vid: port.vendorId,
			pid: port.productId,
			manufacturer: port.manufacturer,
		});
		const terminalDevice: TerminalDevice = {
			capabilities: ['read'],
			id: id,
			meta: {
				deviceType: 'unassigned',
				baudrate: 9600,
				setToDefault: false,
				brand: '',
				model: '',
			},
			path: port.path,
			name: '',
			pid: toHexString(port.productId || '0'),
			vid: toHexString(port.vendorId || '0'),
			manufacturer: port.manufacturer || '',
			serialNumber: port.serialNumber || '',
		};
		devices.push(terminalDevice);
	}

	logger.debug('Serial devices detection completed', {
		deviceCount: devices.length,
	});
	return devices;
}

export function devicesWithSavedConfig(devices: TerminalDevice[]) {
	logger.debug('Applying saved configurations to devices', {
		deviceCount: devices.length,
	});
	return devices.map((device) => {
		const saved = getDeviceConfig(device.vid, device.pid);
		if (saved) {
			logger.debug('Applied saved config to device', {
				deviceId: device.id,
				config: saved,
			});
			device.meta = saved;
		} else {
			logger.debug('No saved config for device, using defaults', {
				deviceId: device.id,
				capabilities: device.capabilities,
			});
			// Reset to default metadata when no config exists (after deletion)
			device.meta = {
				deviceType: device.capabilities.includes('write')
					? 'printer'
					: 'unassigned',
				baudrate: device.capabilities.includes('read') ? 9600 : 'not-supported',
				setToDefault: false,
				brand: '',
				model: '',
			};
		}
		return device;
	});
}

// Main function to get all connected devices
export async function getConnectedDevices(): Promise<TerminalDevice[]> {
	logger.debug('Starting device detection scan');
	const devices: TerminalDevice[] = [];
	const connectedDevices = getFilteredUsbDevices();

	// Platform-specific printer detection
	logger.debug('Platform-specific device detection', {
		platform: process.platform,
	});
	if (process.platform === 'win32') {
		const windowsPrinters = getWindowsPrinters(connectedDevices);
		devices.push(...windowsPrinters);
		logger.debug('Added Windows printers', { count: windowsPrinters.length });
	}

	if (process.platform === 'darwin') {
		const macPrinters = getMacPrinters(connectedDevices);
		devices.push(...macPrinters);
		logger.debug('Added macOS printers', { count: macPrinters.length });
	}

	// Serial port detection
	const serialDevices = await getSerialDevices(connectedDevices);
	devices.push(...serialDevices);
	logger.debug('Added serial devices', { count: serialDevices.length });

	logger.debug('Device detection completed', {
		totalDevices: devices.length,
		platform: process.platform,
		deviceBreakdown: {
			printers: devices.filter((d) => d.capabilities.includes('write')).length,
			serial: devices.filter((d) => d.capabilities.includes('read')).length,
		},
	});
	return devices;
}
