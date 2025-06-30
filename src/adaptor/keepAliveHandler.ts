import type { SerialPort } from 'serialport';

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
							console.error('Keep-alive write error:', err);
						}
					});
				} catch (error) {
					console.error('Keep-alive error:', error);
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
