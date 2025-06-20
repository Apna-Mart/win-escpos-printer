import type { TerminalDevice } from '../core/types';
import type { WritableDevice } from './deviceAdaptor';
import { WindowsPrinterAdapter } from './windowsPrinterAdapter';
import { UnixPrinterAdapter } from './unixPrinterAdapter';

export function createPrinterAdapter(device: TerminalDevice): WritableDevice {
	return process.platform === 'win32' 
		? new WindowsPrinterAdapter(device)
		: new UnixPrinterAdapter(device);
}

export { WindowsPrinterAdapter, UnixPrinterAdapter };