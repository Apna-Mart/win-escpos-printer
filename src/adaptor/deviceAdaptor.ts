export interface DeviceAdapter {
	open(): Promise<void>;

	close(): Promise<void>;

	onError(callback: (error: Error | string) => void): void;
}

export interface WritableDevice extends DeviceAdapter {
	write(data: string, isImage: boolean): Promise<void>;
}

export interface ReadableDevice extends DeviceAdapter {
	read(callback: (data: Buffer | string) => void): void;
}
