import { WebSocket, WebSocketServer } from 'ws';
import type { DeviceManager } from '../managers/deviceManager';
import type { PrinterManager } from '../managers/printerManager';
import type { ScannerManager } from '../managers/scannerManager';
import type { ScaleManager } from '../managers/scaleManager';
import type { TerminalDevice } from '../core/types';

interface ClientMessage {
	event: string;
	data?: unknown;
}

interface ServerResponse {
	event: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

interface PrintTextData {
	text: string;
}

interface PrintImageData {
	image: string;
}

interface StoreUpdateData {
	id: string;
	name: string;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrintTextData(data: unknown): data is PrintTextData {
	return (
		typeof data === 'object' &&
		data !== null &&
		'text' in data &&
		typeof (data as Record<string, unknown>).text === 'string'
	);
}

function isPrintImageData(data: unknown): data is PrintImageData {
	return (
		typeof data === 'object' &&
		data !== null &&
		'image' in data &&
		typeof (data as Record<string, unknown>).image === 'string'
	);
}

function isStoreUpdateData(data: unknown): data is StoreUpdateData {
	const obj = data as Record<string, unknown>;
	return (
		typeof data === 'object' &&
		data !== null &&
		'id' in data &&
		'name' in data &&
		typeof obj.id === 'string' &&
		typeof obj.name === 'string'
	);
}

export class PosWebSocketServer {
	private wss: WebSocketServer;
	private deviceManager: DeviceManager;
	private printerManager: PrinterManager;
	private scannerManager: ScannerManager;
	private scaleManager: ScaleManager;
	private readonly port: number;
	private scanSubscriptions = new Set<WebSocket>();
	private weightSubscriptions = new Set<WebSocket>();
	private pendingScanSubscriptions = new Set<WebSocket>();
	private pendingWeightSubscriptions = new Set<WebSocket>();
	private onLogCallback?: (log: string) => void;
	private onStoreUpdateCallback?: (storeId: string, storeName: string) => void;

	constructor(
		deviceManager: DeviceManager,
		printerManager: PrinterManager,
		scannerManager: ScannerManager,
		scaleManager: ScaleManager,
		port = 8080,
	) {
		this.deviceManager = deviceManager;
		this.printerManager = printerManager;
		this.scannerManager = scannerManager;
		this.scaleManager = scaleManager;
		this.port = port;
		this.wss = new WebSocketServer({ port: this.port });
		this.setupWebSocketServer();
	}

	setOnLog(callback: (log: string) => void) {
		this.onLogCallback = callback;
	}

	setOnStoreUpdate(callback: (storeId: string, storeName: string) => void) {
		this.onStoreUpdateCallback = callback;
	}

	private log(message: string) {
		if (this.onLogCallback) {
			this.onLogCallback(message);
		}
	}

	private setupWebSocketServer() {
		this.wss.on('connection', (ws: WebSocket) => {
			this.log('Client connected');

			ws.on('message', async (message: string) => {
				try {
					const clientMessage: ClientMessage = JSON.parse(message);
					await this.handleClientMessage(ws, clientMessage);
				} catch (error) {
					this.sendError(ws, 'Invalid JSON message', error);
				}
			});

			ws.on('close', () => {
				this.log('Client disconnected');
				this.cleanupSubscriptions(ws);
			});

			ws.on('error', (error) => {
				this.log(`WebSocket error: ${error}`);
				this.cleanupSubscriptions(ws);
			});

			// Send welcome message
			this.sendResponse(ws, {
				event: 'connected',
				success: true,
				data: { message: 'Connected to POS WebSocket Server' },
			});

			// Send current devices
			const devices = this.deviceManager.getDevices();
			this.sendResponse(ws, {
				event: 'devices',
				success: true,
				data: devices.map((device) => ({
					id: device.id,
					deviceType: device.meta?.deviceType,
					name: device.name,
					manufacturer: device.manufacturer,
					isDefault: device.meta?.setToDefault || false,
				})),
			});
		});

		this.log(`WebSocket server started on port ${this.port}`);

		// Setup device event listeners
		this.setupDeviceEventListeners();
	}

	private setupDeviceEventListeners() {
		// Device connect/disconnect events
		this.deviceManager.onDeviceConnect(async (device) => {
			await delay(1000);
			this.broadcastDeviceUpdate();
			await this.activatePendingSubscriptions();
		});

		this.deviceManager.onDeviceDisconnect(async (deviceId) => {
			await delay(1000);
			this.broadcastDeviceUpdate();
		});
	}

	private broadcastDeviceUpdate() {
		const devices = this.deviceManager.getDevices();
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) {
				this.sendResponse(client, {
					event: 'devices',
					success: true,
					data: devices.map((device) => ({
						id: device.id,
						deviceType: device.meta?.deviceType,
						name: device.name,
						manufacturer: device.manufacturer,
						isDefault: device.meta?.setToDefault || false,
					})),
				});
			}
		}
	}

	private async handleClientMessage(ws: WebSocket, message: ClientMessage) {
		// Only log non-routine events to reduce noise
		if (
			!['subscribe_scan', 'subscribe_weight', 'unsubscribe_scan', 'unsubscribe_weight'].includes(
				message.event,
			)
		) {
			this.log(`Received event: ${message.event}`);
		}

		try {
			switch (message.event) {
				case 'subscribe_scan':
					await this.handleSubscribeScan(ws);
					break;

				case 'unsubscribe_scan':
					await this.handleUnsubscribeScan(ws);
					break;

				case 'subscribe_weight':
					await this.handleSubscribeWeight(ws);
					break;

				case 'unsubscribe_weight':
					await this.handleUnsubscribeWeight(ws);
					break;

				case 'print_text':
					if (isPrintTextData(message.data)) {
						await this.handlePrintText(ws, message.data);
					} else {
						this.sendError(ws, 'Invalid print_text data format');
					}
					break;

				case 'print_image':
					if (isPrintImageData(message.data)) {
						await this.handlePrintImage(ws, message.data);
					} else {
						this.sendError(ws, 'Invalid print_image data format');
					}
					break;

				case 'update_store':
					if (isStoreUpdateData(message.data)) {
						this.handleUpdateStore(ws, message.data);
					} else {
						this.sendError(ws, 'Invalid update_store data format');
					}
					break;

				default:
					this.sendError(ws, `Unknown event: ${message.event}`);
			}
		} catch (error) {
			this.sendError(ws, `Error handling ${message.event}`, error);
		}
	}

	private async handleSubscribeScan(ws: WebSocket) {
		const scannerDevice = this.getDefaultDevice('scanner');
		
		// Only log scanner subscription errors, not routine operations
		if (!scannerDevice) {
			// Add to pending subscriptions
			this.pendingScanSubscriptions.add(ws);
			this.sendResponse(ws, {
				event: 'subscribe_scan',
				success: true,
				data: { message: 'Waiting for scanner device to connect', status: 'pending' },
			});
			return;
		}

		try {
			// Set up scanner callback for this WebSocket connection
			await this.scannerManager.scanFromDevice(scannerDevice.id, (data) => {
				// Only send to subscribed clients
				if (this.scanSubscriptions.has(ws) && ws.readyState === WebSocket.OPEN) {
					this.sendResponse(ws, {
						event: 'scan_data',
						success: true,
						data: { barcode: data.toString().trim(), deviceId: scannerDevice.id },
					});
				}
			});

			this.scanSubscriptions.add(ws);
			this.sendResponse(ws, {
				event: 'subscribe_scan',
				success: true,
				data: { message: 'Subscribed to scanner', deviceId: scannerDevice.id, status: 'active' },
			});
		} catch (error) {
			this.sendError(ws, 'Failed to subscribe to scanner', error);
		}
	}

	private async handleUnsubscribeScan(ws: WebSocket) {
		this.scanSubscriptions.delete(ws);
		this.pendingScanSubscriptions.delete(ws);

		this.sendResponse(ws, {
			event: 'unsubscribe_scan',
			success: true,
			data: { message: 'Unsubscribed from scanner' },
		});
	}

	private async handleSubscribeWeight(ws: WebSocket) {
		const scaleDevice = this.getDefaultDevice('scale');
		
		if (!scaleDevice) {
			// Add to pending subscriptions
			this.pendingWeightSubscriptions.add(ws);
			this.sendResponse(ws, {
				event: 'subscribe_weight',
				success: true,
				data: { message: 'Waiting for scale device to connect', status: 'pending' },
			});
			return;
		}

		try {
			// Set up scale callback for this WebSocket connection
			await this.scaleManager.readFromDevice(scaleDevice.id, (data) => {
				// Only send to subscribed clients
				if (this.weightSubscriptions.has(ws) && ws.readyState === WebSocket.OPEN) {
					this.sendResponse(ws, {
						event: 'weight_data',
						success: true,
						data: { weight: data.toString().trim(), deviceId: scaleDevice.id },
					});
				}
			});

			this.weightSubscriptions.add(ws);
			this.sendResponse(ws, {
				event: 'subscribe_weight',
				success: true,
				data: { message: 'Subscribed to scale', deviceId: scaleDevice.id, status: 'active' },
			});
		} catch (error) {
			this.sendError(ws, 'Failed to subscribe to scale', error);
		}
	}

	private async handleUnsubscribeWeight(ws: WebSocket) {
		this.weightSubscriptions.delete(ws);
		this.pendingWeightSubscriptions.delete(ws);

		this.sendResponse(ws, {
			event: 'unsubscribe_weight',
			success: true,
			data: { message: 'Unsubscribed from scale' },
		});
	}

	private async handlePrintText(ws: WebSocket, data: PrintTextData) {
		if (!data || !data.text) {
			this.sendError(ws, 'Missing text data for printing');
			return;
		}

		try {
			await this.printerManager.printToDefault(data.text, false);
			this.sendResponse(ws, {
				event: 'print_text',
				success: true,
				data: { message: 'Text printed successfully' },
			});
		} catch (error) {
			this.sendError(ws, 'Failed to print text', error);
		}
	}

	private async handlePrintImage(ws: WebSocket, data: PrintImageData) {
		if (!data) {
			this.sendError(ws, 'Missing image data for printing');
			return;
		}

		try {
			await this.printerManager.printToDefault(data.image, true);
			this.sendResponse(ws, {
				event: 'print_image',
				success: true,
				data: { message: 'Image printed successfully' },
			});
		} catch (error) {
			this.sendError(ws, 'Failed to print image', error);
		}
	}

	private getDefaultDevice(deviceType: string): TerminalDevice | null {
		const defaultDevice = this.deviceManager.getDefaultDevice(deviceType as any);
		return defaultDevice || null;
	}

	private async activatePendingSubscriptions() {
		// Activate pending scan subscriptions
		if (this.pendingScanSubscriptions.size > 0) {
			const scannerDevice = this.getDefaultDevice('scanner');
			if (scannerDevice) {
				const pendingClients = Array.from(this.pendingScanSubscriptions);
				this.pendingScanSubscriptions.clear();

				for (const ws of pendingClients) {
					if (ws.readyState === WebSocket.OPEN) {
						this.log('Activating pending scan subscription for client');
						await this.handleSubscribeScan(ws);
					}
				}
			}
		}

		// Activate pending weight subscriptions
		if (this.pendingWeightSubscriptions.size > 0) {
			const scaleDevice = this.getDefaultDevice('scale');
			if (scaleDevice) {
				const pendingClients = Array.from(this.pendingWeightSubscriptions);
				this.pendingWeightSubscriptions.clear();

				for (const ws of pendingClients) {
					if (ws.readyState === WebSocket.OPEN) {
						this.log('Activating pending weight subscription for client');
						await this.handleSubscribeWeight(ws);
					}
				}
			}
		}
	}

	private cleanupSubscriptions(ws: WebSocket) {
		// Clean up subscriptions when client disconnects
		this.scanSubscriptions.delete(ws);
		this.weightSubscriptions.delete(ws);
		this.pendingScanSubscriptions.delete(ws);
		this.pendingWeightSubscriptions.delete(ws);
	}

	private sendResponse(ws: WebSocket, response: ServerResponse) {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(response));
		}
	}

	private handleUpdateStore(ws: WebSocket, data: StoreUpdateData) {
		if (!data || !data.id || !data.name) {
			this.sendError(ws, 'Missing store id or name in update_store request');
			return;
		}

		try {
			this.log(`Updating store context: ${data.id} - ${data.name}`);

			// Call the callback to update store context in main process
			if (this.onStoreUpdateCallback) {
				this.onStoreUpdateCallback(data.id, data.name);
			}

			this.sendResponse(ws, {
				event: 'update_store',
				success: true,
				data: {
					message: 'Store context updated successfully',
					storeId: data.id,
					storeName: data.name,
				},
			});
		} catch (error) {
			this.sendError(ws, 'Failed to update store context', error);
		}
	}

	private sendError(ws: WebSocket, message: string, error?: unknown) {
		this.log(`Error: ${message} - ${error}`);
		this.sendResponse(ws, {
			event: 'error',
			success: false,
			error: message,
			data: error instanceof Error ? error.message : error,
		});
	}

	public close() {
		this.log('Closing WebSocket server');
		this.wss.close();
	}

	public async restart() {
		try {
			this.log('Restarting WebSocket server...');

			// Clear subscriptions
			this.scanSubscriptions.clear();
			this.weightSubscriptions.clear();
			this.pendingScanSubscriptions.clear();
			this.pendingWeightSubscriptions.clear();

			// Close existing server
			this.wss.close();

			// Wait a bit for the server to close
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Create new server
			this.wss = new WebSocketServer({ port: this.port });
			this.setupWebSocketServer();

			this.log('WebSocket server restarted successfully');
		} catch (error) {
			this.log(`Error restarting WebSocket server: ${error}`);
			throw error;
		}
	}

	public getConnectedClients(): number {
		return this.wss.clients.size;
	}
}