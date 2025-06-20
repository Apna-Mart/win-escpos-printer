import { createPosWebSocketServer, startPosSystem, stopPosSystem } from '../createPosWebSocketServer';
import { PosWebSocketServer } from '../posWebSocketServer';
import WebSocket from 'ws';

describe('PosWebSocketServer', () => {
	let system: ReturnType<typeof createPosWebSocketServer>;
	let client: WebSocket;

	beforeEach(async () => {
		// Use a different port for testing to avoid conflicts
		system = createPosWebSocketServer(8081);
		await system.deviceManager.start();
	});

	afterEach(async () => {
		if (client && client.readyState === WebSocket.OPEN) {
			client.close();
		}
		system.webSocketServer.close();
		await system.deviceManager.stop();
	});

	test('should create WebSocket server instance', () => {
		expect(system.webSocketServer).toBeInstanceOf(PosWebSocketServer);
		expect(system.deviceManager).toBeDefined();
		expect(system.printerManager).toBeDefined();
		expect(system.scannerManager).toBeDefined();
		expect(system.scaleManager).toBeDefined();
	});

	test('should accept WebSocket connections', (done) => {
		client = new WebSocket('ws://localhost:8081');

		client.on('open', () => {
			expect(client.readyState).toBe(WebSocket.OPEN);
			done();
		});

		client.on('error', (error) => {
			done(error);
		});
	});

	test('should send welcome message on connection', (done) => {
		client = new WebSocket('ws://localhost:8081');

		client.on('message', (data) => {
			const message = JSON.parse(data.toString());
			if (message.event === 'connected') {
				expect(message.success).toBe(true);
				expect(message.data.message).toBe('Connected to POS WebSocket Server');
				done();
			}
		});

		client.on('error', (error) => {
			done(error);
		});
	});

	test('should handle subscribe_scan event', (done) => {
		client = new WebSocket('ws://localhost:8081');

		let messageCount = 0;
		client.on('message', (data) => {
			const message = JSON.parse(data.toString());
			messageCount++;

			if (message.event === 'subscribe_scan') {
				expect(message.success).toBe(true);
				// Should succeed even without scanner (will be pending)
				expect(['active', 'pending']).toContain(message.data.status);
				done();
			} else if (messageCount > 5) {
				// Avoid infinite waiting
				done(new Error('Subscribe scan response not received'));
			}
		});

		client.on('open', () => {
			client.send(JSON.stringify({ event: 'subscribe_scan' }));
		});

		client.on('error', (error) => {
			done(error);
		});
	});

	test('should handle update_store event', (done) => {
		client = new WebSocket('ws://localhost:8081');

		let messageCount = 0;
		client.on('message', (data) => {
			const message = JSON.parse(data.toString());
			messageCount++;

			if (message.event === 'update_store') {
				expect(message.success).toBe(true);
				expect(message.data.storeId).toBe('test-store');
				expect(message.data.storeName).toBe('Test Store');
				done();
			} else if (messageCount > 5) {
				done(new Error('Update store response not received'));
			}
		});

		client.on('open', () => {
			client.send(
				JSON.stringify({
					event: 'update_store',
					data: { id: 'test-store', name: 'Test Store' },
				}),
			);
		});

		client.on('error', (error) => {
			done(error);
		});
	});

	test('should handle invalid JSON gracefully', (done) => {
		client = new WebSocket('ws://localhost:8081');

		let messageCount = 0;
		client.on('message', (data) => {
			const message = JSON.parse(data.toString());
			messageCount++;

			if (message.event === 'error') {
				expect(message.success).toBe(false);
				expect(message.error).toBe('Invalid JSON message');
				done();
			} else if (messageCount > 5) {
				done(new Error('Error response not received'));
			}
		});

		client.on('open', () => {
			client.send('invalid json');
		});

		client.on('error', (error) => {
			done(error);
		});
	});
});

describe('PosSystem Factory Functions', () => {
	test('startPosSystem should start device manager', async () => {
		const system = await startPosSystem(8082);
		
		expect(system.deviceManager).toBeDefined();
		expect(system.webSocketServer).toBeDefined();
		
		await stopPosSystem(system);
	});

	test('stopPosSystem should cleanup properly', async () => {
		const system = await startPosSystem(8083);
		
		// Should not throw
		await expect(stopPosSystem(system)).resolves.not.toThrow();
	});
});