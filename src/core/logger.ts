export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogCallback = (
	level: LogLevel,
	message: string,
	data?: string,
) => void;

export interface LoggerConfig {
	level?: LogLevel;
	callback?: LogCallback;
}

class Logger {
	private logCallback?: LogCallback;
	private isConfigured = false;
	private currentLevel: LogLevel = 'info';
	private readonly levelPriority: Record<LogLevel, number> = {
		trace: 0,
		debug: 1,
		info: 2,
		warn: 3,
		error: 4,
	};

	configure(config: LoggerConfig): void {
		if (config.level) {
			this.currentLevel = config.level;
		}
		if (config.callback) {
			this.logCallback = config.callback;
		}
		this.isConfigured = true;
	}

	private logWithCallback(
		level: LogLevel,
		message: string,
		data?: unknown,
	): void {
		if (!this.isConfigured || !this.logCallback || !this.shouldLog(level)) {
			return;
		}

		try {
			const formattedData =
				data !== undefined ? this.formatData(data) : undefined;
			this.logCallback(level, message, formattedData);
		} catch (_error) {
			// Silent failure - don't log to console
		}
	}

	private formatData(data: unknown): string {
		try {
			return JSON.stringify(data);
		} catch (_error) {
			// Fallback for non-serializable objects
			return String(data);
		}
	}

	private shouldLog(level: LogLevel): boolean {
		return this.levelPriority[level] >= this.levelPriority[this.currentLevel];
	}

	trace(message: string, data?: unknown): void {
		// Only call callback, no console logging
		this.logWithCallback('trace', message, data);
	}

	debug(message: string, data?: unknown): void {
		// Only call callback, no console logging
		this.logWithCallback('debug', message, data);
	}

	info(message: string, data?: unknown): void {
		// Only call callback, no console logging
		this.logWithCallback('info', message, data);
	}

	warn(message: string, data?: unknown): void {
		// Only call callback, no console logging
		this.logWithCallback('warn', message, data);
	}

	error(message: string, error?: unknown): void {
		// Only call callback, no console logging
		this.logWithCallback('error', message, error);
	}
}

// Export singleton logger instance
export const logger = new Logger();

// Export for backwards compatibility and convenience
export default logger;
