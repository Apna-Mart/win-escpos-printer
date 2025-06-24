export interface RetryOptions {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	multiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxAttempts: 10,
	baseDelayMs: 200, // 1/5 second
	maxDelayMs: 5000, // 5 seconds
	multiplier: 2,
};

export class RetryError extends Error {
	constructor(
		message: string,
		public readonly attempts: number,
		public readonly lastError: Error,
	) {
		super(message);
		this.name = 'RetryError';
	}
}

/**
 * Executes an async operation with exponential backoff retry logic
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with the operation result or rejects with RetryError
 */
export async function withExponentialBackoff<T>(
	operation: () => Promise<T>,
	options: Partial<RetryOptions> = {},
): Promise<T> {
	const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
	let lastError: Error;
	let delay = config.baseDelayMs;

	for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// If this is the last attempt, throw the retry error
			if (attempt === config.maxAttempts) {
				throw new RetryError(
					`Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError.message}`,
					attempt,
					lastError,
				);
			}

			// Log retry attempt (but don't log the final failure here)
			console.log(
				`Port opening attempt ${attempt}/${config.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`,
			);

			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, delay));

			// Calculate next delay with exponential backoff
			delay = Math.min(delay * config.multiplier, config.maxDelayMs);
		}
	}

	// This should never be reached, but TypeScript requires it
	throw new RetryError(
		`Operation failed after ${config.maxAttempts} attempts`,
		config.maxAttempts,
		lastError || new Error('Unknown error'),
	);
}
