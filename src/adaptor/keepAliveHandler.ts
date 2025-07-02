import type { SerialPort } from 'serialport';
import { logger } from '../core/logger';

export interface KeepAliveDevice {
	readonly isOpen: boolean;
	readonly device: SerialPort;
}

export class KeepAliveHandler {
	private keepAliveInterval?: NodeJS.Timeout;
	private readonly keepAliveIntervalMs: number;
	private readonly device: KeepAliveDevice;

	constructor(device: KeepAliveDevice, keepAliveIntervalMs = 60000) {
		this.device = device;
		this.keepAliveIntervalMs = keepAliveIntervalMs;
	}

	start(): void {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
		}

		this.keepAliveInterval = setInterval(() => {
			if (this.device.isOpen && this.device.device.isOpen) {
				try {
					this.device.device.write('\x05', (err) => {
						if (err) {
							logger.error('Keep-alive write error', err);
						}
					});
				} catch (error) {
					logger.error('Keep-alive error', error);
				}
			}
		}, this.keepAliveIntervalMs);
	}

	stop(): void {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = undefined;
		}
	}
}
