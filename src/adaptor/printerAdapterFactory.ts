import type { TerminalDevice } from '../core/types';
import type { WritableDevice } from './deviceAdaptor';
import { UnixPrinterAdapter } from './unixPrinterAdapter';
import { WindowsPrinterAdapter } from './windowsPrinterAdapter';

export function createPrinterAdapter(device: TerminalDevice): WritableDevice {
	return process.platform === 'win32'
		? new WindowsPrinterAdapter(device)
		: new UnixPrinterAdapter(device);
}

export { WindowsPrinterAdapter, UnixPrinterAdapter };
