import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export class PersistentStorage {
	private storagePath: string;
	private data: Record<string, unknown> = {};
	private isLoaded = false;

	constructor(filename = 'escpos-device-config.json') {
		// Store in user's home directory/.escpos-lib/
		const configDir = path.join(os.homedir(), '.escpos-lib');
		this.storagePath = path.join(configDir, filename);
		this.ensureDirectoryExists();
		this.loadData();
	}

	private ensureDirectoryExists(): void {
		const dir = path.dirname(this.storagePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	private loadData(): void {
		if (this.isLoaded) return;

		try {
			if (fs.existsSync(this.storagePath)) {
				const fileContent = fs.readFileSync(this.storagePath, 'utf8');
				this.data = JSON.parse(fileContent);
			}
		} catch (error) {
			console.warn('Failed to load storage data:', error);
			this.data = {};
		}
		this.isLoaded = true;
	}

	private saveData(): void {
		try {
			fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2));
		} catch (error) {
			console.error('Failed to save storage data:', error);
			throw error;
		}
	}

	setValue<T>(key: string, value: T): void {
		this.loadData();
		this.data[key] = value;
		this.saveData();
	}

	getValue<T>(key: string): T | undefined {
		this.loadData();
		return this.data[key] as T | undefined;
	}

	getAllValues(): Record<string, unknown> {
		this.loadData();
		return { ...this.data };
	}

	unsetValue(key: string): void {
		this.loadData();
		delete this.data[key];
		this.saveData();
	}

	clear(): void {
		this.data = {};
		this.saveData();
	}

	getStoragePath(): string {
		return this.storagePath;
	}
}

// Create singleton instance
const storage = new PersistentStorage();

// Export interface compatible with node-global-storage
export const setValue = <T>(key: string, value: T): void => storage.setValue(key, value);
export const getValue = <T>(key: string): T | undefined => storage.getValue<T>(key);
export const getAllValues = (): Record<string, unknown> => storage.getAllValues();
export const unsetValue = (key: string): void => storage.unsetValue(key);
export const clear = (): void => storage.clear();
export const getStoragePath = (): string => storage.getStoragePath();

export default storage;