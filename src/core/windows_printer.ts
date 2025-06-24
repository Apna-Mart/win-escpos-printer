import iconv from 'iconv-lite';
import Jimp from 'jimp';

// Types and Interfaces
export interface PrinterInfo {
	name: string;
	description: string;
	isDefault: boolean;
	vid: string;
	pid: string;
	deviceId: string;
	isUsb: boolean;
	portName: string;
}

export interface ImageProcessingOptions {
	width?: number;
	threshold?: number;
	dither?: boolean;
}

export interface BarcodeOptions {
	width?: number;
	height?: number;
	font?: number;
	position?: number;
}

export interface QRCodeOptions {
	size?: number;
	errorLevel?: number;
}

export type BarcodeType =
	| 'UPC_A'
	| 'UPC_E'
	| 'EAN13'
	| 'EAN8'
	| 'CODE39'
	| 'ITF'
	| 'CODABAR';
export type CharacterSet = 'ASCII' | 'GBK';

interface NativePrinter {
	print(data: Buffer): boolean;
	close(): void;
}

interface NativePrinterConstructor {
	new (printerName: string): NativePrinter;
	getPrinterList(): PrinterInfo[];
}

// Error Classes
export class PrinterError extends Error {
	constructor(
		message: string,
		public code?: string,
	) {
		super(message);
		this.name = 'PrinterError';
	}
}

export class PrinterConnectionError extends PrinterError {
	constructor(printerName: string, originalError?: Error) {
		super(
			`Failed to connect to printer: ${printerName}${originalError ? ` - ${originalError.message}` : ''}`,
		);
		this.name = 'PrinterConnectionError';
		this.code = 'PRINTER_CONNECTION_FAILED';
	}
}

export class ImageProcessingError extends PrinterError {
	constructor(message: string, originalError?: Error) {
		super(
			`Image processing failed: ${message}${originalError ? ` - ${originalError.message}` : ''}`,
		);
		this.name = 'ImageProcessingError';
		this.code = 'IMAGE_PROCESSING_FAILED';
	}
}

export class PrintJobError extends PrinterError {
	constructor(message: string, originalError?: Error) {
		super(
			`Print job failed: ${message}${originalError ? ` - ${originalError.message}` : ''}`,
		);
		this.name = 'PrintJobError';
		this.code = 'PRINT_JOB_FAILED';
	}
}

// ESC/POS Commands
export const EscPosCommands = {
	// Printer control commands
	INIT: Buffer.from([0x1b, 0x40]),
	CUT: Buffer.from([0x1d, 0x56, 0x41, 0x00]),
	LINE_FEED: Buffer.from([0x0a]),

	// Text formatting commands
	BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
	BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),

	// Text alignment commands
	ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
	ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
	ALIGN_RIGHT: Buffer.from([0x1b, 0x61, 0x02]),

	// Font selection commands
	FONT_STANDARD: Buffer.from([0x1b, 0x4d, 0x00]),
	FONT_COMPRESSED: Buffer.from([0x1b, 0x4d, 0x01]),

	// Character set commands
	ASCII_MODE: Buffer.concat([
		Buffer.from([0x1b, 0x74, 0x00]),
		Buffer.from([0x1c, 0x2e]),
	]),

	CHINESE_MODE: Buffer.concat([
		Buffer.from([0x1b, 0x74, 0x15]),
		Buffer.from([0x1c, 0x26]),
	]),

	ENCODING_GBK: Buffer.from([0x1b, 0x74, 0x15]),
	ENCODING_ASCII: Buffer.from([0x1b, 0x74, 0x00]),

	// Barcode type commands
	BARCODE_TYPES: {
		UPC_A: Buffer.from([0x1d, 0x6b, 0x00]),
		UPC_E: Buffer.from([0x1d, 0x6b, 0x01]),
		EAN13: Buffer.from([0x1d, 0x6b, 0x02]),
		EAN8: Buffer.from([0x1d, 0x6b, 0x03]),
		CODE39: Buffer.from([0x1d, 0x6b, 0x04]),
		ITF: Buffer.from([0x1d, 0x6b, 0x05]),
		CODABAR: Buffer.from([0x1d, 0x6b, 0x06]),
	} as const,

	// QR code commands
	QR_PRINT: Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),

	// Image commands
	IMAGE_HIGH_DENSITY: Buffer.from([0x1d, 0x76, 0x30, 0x00]),

	// Dynamic command generators
	createTextSizeCommand(width: number = 0, height: number = 0): Buffer {
		const clampedWidth = Math.max(0, Math.min(7, width));
		const clampedHeight = Math.max(0, Math.min(7, height));
		const size = (clampedWidth << 4) | clampedHeight;
		return Buffer.from([0x1d, 0x21, size]);
	},

	createBarcodeHeightCommand(height: number): Buffer {
		return Buffer.from([0x1d, 0x68, Math.max(1, Math.min(255, height))]);
	},

	createBarcodeWidthCommand(width: number): Buffer {
		return Buffer.from([0x1d, 0x77, Math.max(1, Math.min(6, width))]);
	},

	createBarcodeFontCommand(font: number): Buffer {
		return Buffer.from([0x1d, 0x66, Math.max(0, Math.min(4, font))]);
	},

	createBarcodePositionCommand(position: number): Buffer {
		return Buffer.from([0x1d, 0x48, Math.max(0, Math.min(3, position))]);
	},

	createQRSizeCommand(size: number): Buffer {
		return Buffer.from([
			0x1d,
			0x28,
			0x6b,
			0x03,
			0x00,
			0x31,
			0x43,
			Math.max(1, Math.min(16, size)),
		]);
	},

	createQRErrorLevelCommand(level: number): Buffer {
		return Buffer.from([
			0x1d,
			0x28,
			0x6b,
			0x03,
			0x00,
			0x31,
			0x45,
			Math.max(48, Math.min(51, level)),
		]);
	},

	createQRDataCommand(data: string): Buffer {
		const length = data.length + 3;
		const pL = length % 256;
		const pH = Math.floor(length / 256);
		return Buffer.concat([
			Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
			Buffer.from(data),
		]);
	},

	createLineSpacingCommand(spacing: number): Buffer {
		return Buffer.from([0x1b, 0x33, Math.max(0, Math.min(255, spacing))]);
	},
} as const;

// Main Printer Class
export class ThermalWindowPrinter {
	private readonly nativePrinter: NativePrinter | null = null;
	private readonly printerName: string;
	private currentCharset: CharacterSet = 'ASCII';
	private readonly isNativeSupported: boolean;

	private static nativePrinterClass: NativePrinterConstructor | null = null;

	static {
		console.log('ThermalWindowPrinter: Initializing native printer module...');
		console.log(
			`ThermalWindowPrinter: Platform: ${process.platform}, Architecture: ${process.arch}`,
		);

		try {
			console.log(
				'ThermalWindowPrinter: Attempting to load native module "escpos-lib"...',
			);
			const nativeModule = require('bindings')('escpos-lib');
			console.log(
				'ThermalWindowPrinter: Native module loaded, available exports:',
				Object.keys(nativeModule),
			);

			ThermalWindowPrinter.nativePrinterClass = nativeModule.Printer;
			console.log(
				'ThermalWindowPrinter: Native printer class initialized successfully',
			);
		} catch (error) {
			console.error(
				'ThermalWindowPrinter: Failed to load native printer module',
			);
			console.error('ThermalWindowPrinter: Error:', {
				message: error instanceof Error ? error.message : String(error),
				code:
					error && typeof error === 'object' && 'code' in error
						? error.code
						: undefined,
				path:
					error && typeof error === 'object' && 'path' in error
						? error.path
						: undefined,
			});

			if (
				error instanceof Error &&
				error.message.includes('MODULE_NOT_FOUND')
			) {
				console.error(
					'ThermalWindowPrinter: Native module not found - may need to rebuild with "npm run build"',
				);
			}

			ThermalWindowPrinter.nativePrinterClass = null;
		}
	}

	constructor(printerName: string) {
		this.printerName = printerName;
		this.isNativeSupported = !!ThermalWindowPrinter.nativePrinterClass;

		if (this.isNativeSupported && ThermalWindowPrinter.nativePrinterClass) {
			try {
				this.nativePrinter = new ThermalWindowPrinter.nativePrinterClass(
					printerName,
				);

				if (process.platform !== 'win32') {
					console.log(
						`ThermalPrinter: Running in compatibility mode on ${process.platform}. Printing operations will be simulated.`,
					);
				}
			} catch (error) {
				throw new PrinterConnectionError(
					printerName,
					error instanceof Error ? error : undefined,
				);
			}
		} else {
			console.warn(
				`ThermalPrinter: Native printer functionality not available. Running in compatibility mode.`,
			);
		}
	}

	// Static methods
	static getAvailablePrinters(): PrinterInfo[] {
		if (!ThermalWindowPrinter.nativePrinterClass) {
			console.warn(
				'getAvailablePrinters: Native printer functionality not available. Returning empty list.',
			);
			return [];
		}

		try {
			return ThermalWindowPrinter.nativePrinterClass.getPrinterList();
		} catch (error) {
			throw new PrinterError(
				'Failed to retrieve printer list',
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}

	// Core printing methods
	print(data: Buffer | string): boolean {
		if (!data) {
			throw new PrinterError('Print data cannot be empty');
		}

		const buffer = data instanceof Buffer ? data : Buffer.from(data);

		if (!this.isNativeSupported || !this.nativePrinter) {
			console.log(
				`ThermalPrinter: Would print ${buffer.length} bytes to printer '${this.printerName}' (compatibility mode)`,
			);
			return true;
		}

		try {
			return this.nativePrinter.print(buffer);
		} catch (error) {
			throw new PrintJobError(
				'Failed to send data to printer',
				error instanceof Error ? error : undefined,
			);
		}
	}

	close(): boolean {
		if (!this.isNativeSupported || !this.nativePrinter) {
			console.log(
				`ThermalPrinter: Would close printer '${this.printerName}' (compatibility mode)`,
			);
			return true;
		}

		try {
			this.nativePrinter.close();
			return true;
		} catch (error) {
			throw new PrinterError(
				'Failed to close printer connection',
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}

	// Text encoding methods
	private encodeText(text: string, charset: CharacterSet = 'ASCII'): Buffer {
		if (!text) {
			return Buffer.alloc(0);
		}

		try {
			if (charset === 'GBK') {
				return iconv.encode(text, 'GBK');
			}
			return Buffer.from(text, 'utf8');
		} catch (error) {
			throw new PrinterError(
				`Failed to encode text with charset ${charset}`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}

	// Text printing methods
	printText(text: string, charset: CharacterSet = 'ASCII'): boolean {
		const modeCommand =
			charset === 'GBK'
				? EscPosCommands.CHINESE_MODE
				: EscPosCommands.ASCII_MODE;
		const encodedText = this.encodeText(text, charset);
		const data = Buffer.concat([modeCommand, encodedText]);

		this.currentCharset = charset;
		return this.print(data);
	}

	printChineseText(text: string): boolean {
		return this.printText(text, 'GBK');
	}

	printAsciiText(text: string): boolean {
		return this.printText(text, 'ASCII');
	}

	// Font and formatting methods
	setFontStandard(): boolean {
		return this.print(EscPosCommands.FONT_STANDARD);
	}

	setFontCompressed(): boolean {
		return this.print(EscPosCommands.FONT_COMPRESSED);
	}

	setTextSize(width: number = 0, height: number = 0): boolean {
		if (width < 0 || width > 7 || height < 0 || height > 7) {
			throw new PrinterError(
				'Text size width and height must be between 0 and 7',
			);
		}
		return this.print(EscPosCommands.createTextSizeCommand(width, height));
	}

	setTextNormal(): boolean {
		return this.setTextSize(0, 0);
	}

	setTextDoubleHeight(): boolean {
		return this.setTextSize(0, 1);
	}

	setTextDoubleWidth(): boolean {
		return this.setTextSize(1, 0);
	}

	setTextDoubleSize(): boolean {
		return this.setTextSize(1, 1);
	}

	setBold(enabled: boolean = true): boolean {
		return this.print(
			enabled ? EscPosCommands.BOLD_ON : EscPosCommands.BOLD_OFF,
		);
	}

	setAlignment(alignment: 'left' | 'center' | 'right'): boolean {
		const alignmentCommands = {
			left: EscPosCommands.ALIGN_LEFT,
			center: EscPosCommands.ALIGN_CENTER,
			right: EscPosCommands.ALIGN_RIGHT,
		};

		const command = alignmentCommands[alignment];
		if (!command) {
			throw new PrinterError(
				`Invalid alignment: ${alignment}. Must be 'left', 'center', or 'right'`,
			);
		}

		return this.print(command);
	}

	// Control methods
	initialize(): boolean {
		return this.print(EscPosCommands.INIT);
	}

	cutPaper(): boolean {
		return this.print(EscPosCommands.CUT);
	}

	feedLine(lines: number = 1): boolean {
		if (lines < 1) {
			throw new PrinterError('Number of lines must be at least 1');
		}

		const lineFeeds = Buffer.alloc(lines, 0x0a);
		return this.print(lineFeeds);
	}

	// Barcode methods
	printBarcode(
		data: string,
		type: BarcodeType = 'EAN13',
		options: BarcodeOptions = {},
	): boolean {
		if (!data) {
			throw new PrinterError('Barcode data cannot be empty');
		}

		const { width = 3, height = 64, font = 0, position = 2 } = options;

		if (!EscPosCommands.BARCODE_TYPES[type]) {
			throw new PrinterError(`Unsupported barcode type: ${type}`);
		}

		const barcodeData = Buffer.concat([
			EscPosCommands.createBarcodeHeightCommand(height),
			EscPosCommands.createBarcodeWidthCommand(width),
			EscPosCommands.createBarcodeFontCommand(font),
			EscPosCommands.createBarcodePositionCommand(position),
			EscPosCommands.BARCODE_TYPES[type],
			Buffer.from(data),
			Buffer.from([0x00]),
		]);

		return this.print(barcodeData);
	}

	// QR code methods
	printQRCode(data: string, options: QRCodeOptions = {}): boolean {
		if (!data) {
			throw new PrinterError('QR code data cannot be empty');
		}

		const { size = 8, errorLevel = 49 } = options;

		const qrData = Buffer.concat([
			EscPosCommands.createQRSizeCommand(size),
			EscPosCommands.createQRErrorLevelCommand(errorLevel),
			EscPosCommands.createQRDataCommand(data),
			EscPosCommands.QR_PRINT,
		]);

		return this.print(qrData);
	}

	// Image processing methods
	async processImageFromFile(
		imagePath: string,
		options: ImageProcessingOptions = {},
	): Promise<Buffer> {
		if (!imagePath) {
			throw new ImageProcessingError('Image path cannot be empty');
		}

		const { width = 384, threshold = 128, dither = true } = options;

		try {
			const image = await Jimp.read(imagePath);
			return this.processImageBuffer(image, { width, threshold, dither });
		} catch (error) {
			throw new ImageProcessingError(
				`Failed to read image from path: ${imagePath}`,
				error instanceof Error ? error : undefined,
			);
		}
	}

	async processImageFromBase64(
		base64Data: string,
		options: ImageProcessingOptions = {},
	): Promise<Buffer> {
		if (!base64Data) {
			throw new ImageProcessingError('Base64 data cannot be empty');
		}

		const { width = 384, threshold = 128, dither = true } = options;

		try {
			let cleanBase64 = base64Data;
			if (base64Data.startsWith('data:')) {
				const commaIndex = base64Data.indexOf(',');
				if (commaIndex !== -1) {
					cleanBase64 = base64Data.substring(commaIndex + 1);
				}
			}

			const imageBuffer = Buffer.from(cleanBase64, 'base64');
			const image = await Jimp.read(imageBuffer);
			return this.processImageBuffer(image, { width, threshold, dither });
		} catch (error) {
			throw new ImageProcessingError(
				'Failed to process base64 image data',
				error instanceof Error ? error : undefined,
			);
		}
	}

	private async processImageBuffer(
		image: Jimp,
		options: ImageProcessingOptions,
	): Promise<Buffer> {
		const { width = 384, threshold = 128, dither = true } = options;

		try {
			image.scaleToFit(width, Jimp.AUTO);
			image.grayscale();

			if (dither) {
				image.dither16();
			} else {
				image.threshold({ max: threshold });
			}

			const imgWidth = image.getWidth();
			const imgHeight = image.getHeight();
			const bytesPerLine = Math.ceil(imgWidth / 8);

			const printData: Buffer[] = [];
			const header = Buffer.concat([
				EscPosCommands.IMAGE_HIGH_DENSITY,
				Buffer.from([bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff]),
				Buffer.from([imgHeight & 0xff, (imgHeight >> 8) & 0xff]),
			]);
			printData.push(header);

			for (let y = 0; y < imgHeight; y++) {
				const row = new Uint8Array(bytesPerLine);
				for (let x = 0; x < imgWidth; x++) {
					const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
					const isBlack = pixel.r < threshold;
					if (isBlack) {
						const byteIndex = Math.floor(x / 8);
						const bitIndex = 7 - (x % 8);
						row[byteIndex] |= 1 << bitIndex;
					}
				}
				printData.push(Buffer.from(row));
			}

			return Buffer.concat(printData);
		} catch (error) {
			throw new ImageProcessingError(
				'Failed to process image buffer',
				error instanceof Error ? error : undefined,
			);
		}
	}

	async printImageFromFile(
		imagePath: string,
		options: ImageProcessingOptions = {},
	): Promise<boolean> {
		try {
			const imageData = await this.processImageFromFile(imagePath, options);
			return this.print(imageData);
		} catch (error) {
			if (error instanceof ImageProcessingError) {
				throw error;
			}
			throw new PrintJobError(
				`Failed to print image from file: ${imagePath}`,
				error instanceof Error ? error : undefined,
			);
		}
	}

	async printImageFromBase64(
		base64Data: string,
		options: ImageProcessingOptions = {},
	): Promise<boolean> {
		try {
			const imageData = await this.processImageFromBase64(base64Data, options);
			return this.print(imageData);
		} catch (error) {
			if (error instanceof ImageProcessingError) {
				throw error;
			}
			throw new PrintJobError(
				'Failed to print image from base64 data',
				error instanceof Error ? error : undefined,
			);
		}
	}

	// Getters
	get name(): string {
		return this.printerName;
	}

	get charset(): CharacterSet {
		return this.currentCharset;
	}

	get isConnected(): boolean {
		return this.isNativeSupported && this.nativePrinter !== null;
	}

	get isCompatibilityMode(): boolean {
		return !this.isNativeSupported;
	}
}
