import { logger } from './logger';
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
		logger.debug('Device connect callback registered', {
			totalCallbacks: this.connectCallbacks.length,
		});
	}

	onDeviceDisconnect(callback: DeviceDisconnectCallback): void {
		this.disconnectCallbacks.push(callback);
		logger.debug('Device disconnect callback registered', {
			totalCallbacks: this.disconnectCallbacks.length,
		});
	}

	onDeviceData(deviceId: string, callback: DeviceDataCallback): void {
		if (!this.dataCallbacks.has(deviceId)) {
			this.dataCallbacks.set(deviceId, []);
			logger.debug('Created new data callback array for device', { deviceId });
		}
		this.dataCallbacks.get(deviceId)?.push(callback);
		logger.debug('Device data callback registered', {
			deviceId,
			callbacksForDevice: this.dataCallbacks.get(deviceId)?.length || 0,
			totalDevicesWithCallbacks: this.dataCallbacks.size,
		});
	}

	onDeviceError(callback: DeviceErrorCallback): void {
		this.errorCallbacks.push(callback);
		logger.debug('Device error callback registered', {
			totalCallbacks: this.errorCallbacks.length,
		});
	}

	removeDeviceDataCallbacks(deviceId: string): void {
		const hadCallbacks = this.dataCallbacks.has(deviceId);
		const callbackCount = this.dataCallbacks.get(deviceId)?.length || 0;
		this.dataCallbacks.delete(deviceId);
		if (hadCallbacks) {
			logger.debug('Removed device data callbacks', {
				deviceId,
				removedCallbacks: callbackCount,
				remainingDevices: this.dataCallbacks.size,
			});
		}
	}

	emitDeviceConnect(device: TerminalDevice): void {
		logger.debug('Emitting device connect event', {
			deviceId: device.id,
			deviceType: device.meta.deviceType,
			callbackCount: this.connectCallbacks.length,
		});

		this.connectCallbacks.forEach((callback, index) => {
			try {
				callback(device);
				logger.debug('Device connect callback executed successfully', {
					deviceId: device.id,
					callbackIndex: index,
				});
			} catch (error) {
				logger.error('Error in device connect callback', {
					deviceId: device.id,
					callbackIndex: index,
					error,
				});
			}
		});
	}

	emitDeviceDisconnect(deviceId: string): void {
		logger.debug('Emitting device disconnect event', {
			deviceId,
			callbackCount: this.disconnectCallbacks.length,
			hasDataCallbacks: this.dataCallbacks.has(deviceId),
		});

		this.disconnectCallbacks.forEach((callback, index) => {
			try {
				callback(deviceId);
				logger.debug('Device disconnect callback executed successfully', {
					deviceId,
					callbackIndex: index,
				});
			} catch (error) {
				logger.error('Error in device disconnect callback', {
					deviceId,
					callbackIndex: index,
					error,
				});
			}
		});
		// Clean up data callbacks for disconnected device
		this.removeDeviceDataCallbacks(deviceId);
	}

	emitDeviceData(deviceId: string, data: string): void {
		const callbacks = this.dataCallbacks.get(deviceId) || [];
		logger.debug('Emitting device data event', {
			deviceId,
			dataLength: data.length,
			callbackCount: callbacks.length,
			dataPreview: data.substring(0, 50) + (data.length > 50 ? '...' : ''),
		});

		callbacks.forEach((callback, index) => {
			try {
				callback(deviceId, data);
				logger.debug('Device data callback executed successfully', {
					deviceId,
					callbackIndex: index,
				});
			} catch (error) {
				logger.error('Error in device data callback', {
					deviceId,
					callbackIndex: index,
					error,
				});
			}
		});
	}

	emitDeviceError(deviceId: string, error: Error): void {
		logger.error('Emitting device error event', {
			deviceId,
			error: error.message,
			callbackCount: this.errorCallbacks.length,
		});

		this.errorCallbacks.forEach((callback, index) => {
			try {
				callback(deviceId, error);
				logger.debug('Device error callback executed successfully', {
					deviceId,
					callbackIndex: index,
				});
			} catch (callbackError) {
				logger.error('Error in device error callback', {
					deviceId,
					callbackIndex: index,
					originalError: error.message,
					callbackError,
				});
			}
		});
	}

	clear(): void {
		const stats = {
			connectCallbacks: this.connectCallbacks.length,
			disconnectCallbacks: this.disconnectCallbacks.length,
			dataCallbackDevices: this.dataCallbacks.size,
			totalDataCallbacks: Array.from(this.dataCallbacks.values()).reduce(
				(sum, arr) => sum + arr.length,
				0,
			),
			errorCallbacks: this.errorCallbacks.length,
		};

		logger.debug('Clearing all device event callbacks', stats);

		this.connectCallbacks = [];
		this.disconnectCallbacks = [];
		this.dataCallbacks.clear();
		this.errorCallbacks = [];

		logger.info('Device event emitter cleared', { clearedCallbacks: stats });
	}
}
