import log from 'loglevel';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogCallback = (
	level: LogLevel,
	message: string,
	data?: unknown,
) => void;

export interface LoggerConfig {
	level?: LogLevel;
	callback?: LogCallback;
}

class Logger {
	private logCallback?: LogCallback;

	constructor() {
		// Default to 'info' level for minimal production logs
		log.setLevel('info');
	}

	configure(config: LoggerConfig): void {
		if (config.level) {
			log.setLevel(config.level);
		}
		if (config.callback) {
			this.logCallback = config.callback;
		}
	}

	private logWithCallback(
		level: LogLevel,
		message: string,
		data?: unknown,
	): void {
		if (this.logCallback) {
			try {
				this.logCallback(level, message, data);
			} catch (error) {
				// Fallback to console if callback fails
				console.error('Logger callback failed:', error);
			}
		}
	}

	trace(message: string, data?: unknown): void {
		const formattedData = data ? JSON.stringify(data) : undefined;
		log.trace(message, formattedData);
		this.logWithCallback('trace', message, data);
	}

	debug(message: string, data?: unknown): void {
		const formattedData = data ? JSON.stringify(data) : undefined;
		log.debug(message, formattedData);
		this.logWithCallback('debug', message, data);
	}

	info(message: string, data?: unknown): void {
		const formattedData = data ? JSON.stringify(data) : undefined;
		log.info(message, formattedData);
		this.logWithCallback('info', message, data);
	}

	warn(message: string, data?: unknown): void {
		const formattedData = data ? JSON.stringify(data) : undefined;
		log.warn(message, formattedData);
		this.logWithCallback('warn', message, data);
	}

	error(message: string, error?: unknown): void {
		const formattedData = error ? JSON.stringify(error) : undefined;
		log.error(message, formattedData);
		this.logWithCallback('error', message, error);
	}

	getLevel(): LogLevel {
		const level = log.getLevel();
		const levelNames: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
		return levelNames[level] || 'info';
	}

	setLevel(level: LogLevel): void {
		log.setLevel(level);
	}
}

// Export singleton logger instance
export const logger = new Logger();

// Export for backwards compatibility and convenience
export default logger;
