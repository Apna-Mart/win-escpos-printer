export type BaudRate =
	| 110
	| 300
	| 600
	| 1200
	| 2400
	| 4800
	| 9600
	| 14400
	| 19200
	| 38400
	| 57600
	| 115200
	| 128000
	| 256000;

export type DeviceType = 'printer' | 'scanner' | 'scale' | 'unassigned';

export type DeviceStatus = 'attached' | 'detached' | 'processing' | 'error';

export interface DeviceConfig {
	deviceType: DeviceType;
	brand: string;
	model: string;
	baudrate: BaudRate | 'not-supported';
	setToDefault: boolean;
}

export interface TerminalDevice {
	id: string;
	vid: string;
	pid: string;
	path: string;
	name: string;
	serialNumber: string;
	manufacturer: string;
	meta: DeviceConfig;
	capabilities: Array<'read' | 'write'>;
}
