import { logger } from './logger';

export interface RetryOptions {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	multiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxAttempts: 10,
	baseDelayMs: 200, // 1/5 second
	maxDelayMs: 1000 * 10, // 5 seconds
	multiplier: 1.5,
};

export class RetryError extends Error {
	constructor(
		message: string,
		public readonly attempts: number,
		public readonly lastError: Error,
	) {
		super(message);
		this.name = 'RetryError';
		logger.error('Retry operation failed permanently', {
			attempts,
			lastError: lastError.message,
			finalMessage: message,
		});
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
	logger.debug('Starting retry operation', {
		maxAttempts: config.maxAttempts,
		baseDelayMs: config.baseDelayMs,
		maxDelayMs: config.maxDelayMs,
		multiplier: config.multiplier,
	});

	let lastError: Error | undefined;
	let delay = config.baseDelayMs;

	for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
		logger.debug('Retry attempt starting', {
			attempt,
			maxAttempts: config.maxAttempts,
		});
		try {
			const result = await operation();
			logger.debug('Retry operation succeeded', {
				attempt,
				totalAttempts: attempt,
			});
			return result;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			logger.debug('Retry attempt failed', {
				attempt,
				maxAttempts: config.maxAttempts,
				error: lastError.message,
				nextDelayMs: delay,
			});

			// If this is the last attempt, throw the retry error
			if (attempt === config.maxAttempts) {
				throw new RetryError(
					`Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError.message}`,
					attempt,
					lastError,
				);
			}

			// Log retry attempt
			logger.warn('Operation failed, retrying', {
				attempt,
				maxAttempts: config.maxAttempts,
				error: lastError.message,
				retryDelayMs: delay,
				remainingAttempts: config.maxAttempts - attempt,
			});

			// Wait before retrying
			logger.debug('Waiting before retry', { delayMs: delay });
			await new Promise((resolve) => setTimeout(resolve, delay));

			// Calculate next delay with exponential backoff
			const nextDelay = Math.min(delay * config.multiplier, config.maxDelayMs);
			logger.debug('Calculated next retry delay', {
				currentDelay: delay,
				nextDelay,
				multiplier: config.multiplier,
				maxDelay: config.maxDelayMs,
			});
			delay = nextDelay;
		}
	}

	// This should never be reached, but TypeScript requires it
	throw new RetryError(
		`Operation failed after ${config.maxAttempts} attempts`,
		config.maxAttempts,
		lastError ?? new Error('Unknown error'),
	);
}
