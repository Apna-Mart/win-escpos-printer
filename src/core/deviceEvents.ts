import type { TerminalDevice } from './types';

export type DeviceConnectCallback = (device: TerminalDevice) => void;
export type DeviceDisconnectCallback = (deviceId: string) => void;
export type DeviceDataCallback = (deviceId: string, data: string) => void;
export type DeviceErrorCallback = (deviceId: string, error: Error) => void;

export class DeviceEventEmitter {
	private connectCallbacks: DeviceConnectCallback[] = [];
	private disconnectCallbacks: DeviceDisconnectCallback[] = [];
	private dataCallbacks = new Map<string, DeviceDataCallback[]>();
	private errorCallbacks: DeviceErrorCallback[] = [];

	onDeviceConnect(callback: DeviceConnectCallback): void {
		this.connectCallbacks.push(callback);
	}

	onDeviceDisconnect(callback: DeviceDisconnectCallback): void {
		this.disconnectCallbacks.push(callback);
	}

	onDeviceData(deviceId: string, callback: DeviceDataCallback): void {
		if (!this.dataCallbacks.has(deviceId)) {
			this.dataCallbacks.set(deviceId, []);
		}
		this.dataCallbacks.get(deviceId)!.push(callback);
	}

	onDeviceError(callback: DeviceErrorCallback): void {
		this.errorCallbacks.push(callback);
	}

	removeDeviceDataCallbacks(deviceId: string): void {
		this.dataCallbacks.delete(deviceId);
	}

	emitDeviceConnect(device: TerminalDevice): void {
		this.connectCallbacks.forEach((callback) => {
			try {
				callback(device);
			} catch (error) {
				console.error('Error in device connect callback:', error);
			}
		});
	}

	emitDeviceDisconnect(deviceId: string): void {
		this.disconnectCallbacks.forEach((callback) => {
			try {
				callback(deviceId);
			} catch (error) {
				console.error('Error in device disconnect callback:', error);
			}
		});
		// Clean up data callbacks for disconnected device
		this.removeDeviceDataCallbacks(deviceId);
	}

	emitDeviceData(deviceId: string, data: string): void {
		const callbacks = this.dataCallbacks.get(deviceId) || [];
		callbacks.forEach((callback) => {
			try {
				callback(deviceId, data);
			} catch (error) {
				console.error(`Error in device data callback for ${deviceId}:`, error);
			}
		});
	}

	emitDeviceError(deviceId: string, error: Error): void {
		this.errorCallbacks.forEach((callback) => {
			try {
				callback(deviceId, error);
			} catch (error) {
				console.error('Error in device error callback:', error);
			}
		});
	}

	clear(): void {
		this.connectCallbacks = [];
		this.disconnectCallbacks = [];
		this.dataCallbacks.clear();
		this.errorCallbacks = [];
	}
}
