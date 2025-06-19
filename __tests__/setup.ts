import * as storage from 'node-global-storage';

// Global test setup
beforeEach(() => {
	// Clear all storage before each test
	try {
		const allValues = storage.getAllValues();
		for (const key in allValues) {
			storage.unsetValue(key);
		}
	} catch (error) {
		// If storage is not available or fails, continue with tests
		console.warn('Storage cleanup failed:', (error as Error).message);
	}
});