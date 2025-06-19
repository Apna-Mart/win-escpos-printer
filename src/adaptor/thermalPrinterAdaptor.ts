import { Image, Printer } from '@node-escpos/core';
import USB from '@node-escpos/usb-adapter';
import type USBAdapter from '@node-escpos/usb-adapter';
import type { WritableDevice } from './deviceAdaptor';
import { EscPosCommands, ThermalWindowPrinter } from "../core/windows_printer";
import { TerminalDevice } from "../core/types";
import assert from "node:assert";

export class ThermalPrinterAdapter implements WritableDevice {
  private windowsPrinter?: ThermalWindowPrinter;
  private readonly device?: USBAdapter;
  private printer?: Printer<[]>;
  private isOpen = false;
  private readonly isWindows: boolean;

  constructor(public terminalDevice: TerminalDevice) {
    assert(terminalDevice.meta.deviceType === 'printer', 'Terminal device is not a thermal printer');
    this.isWindows = process.platform === 'win32';
    
    if (!this.isWindows) {
      this.device = new USB(Number.parseInt(terminalDevice.vid.replace('0x', '')));
      this.printer = new Printer(this.device, { encoding: 'GB18030' });
    }
  }

  async open() {
    if (this.isOpen) {
      return Promise.resolve();
    }

    if (this.isWindows) {
      try {
        if (!this.windowsPrinter) {
          this.windowsPrinter = new ThermalWindowPrinter(this.terminalDevice.name);
        }
        this.isOpen = true;
      } catch (e) {
        throw new Error('Printer initialization error: ' + (e as Error).message);
      }
    } else {
      return new Promise<void>((resolve, reject) => {
        this.device!.open((err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            this.isOpen = true;
            resolve();
          }
        });
      });
    }
  }

  async close() {
    if (!this.isOpen) {
      return Promise.resolve();
    }

    if (this.isWindows) {
      this.isOpen = false;
    } else {
      return new Promise<void>((resolve) => {
        if (this.device) {
          this.device.close();
        }
        this.isOpen = false;
        resolve();
      });
    }
  }

  async write(data: string, isImage: boolean): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Printer not open');
    }

    if (this.isWindows) {
      try {
        if (!this.windowsPrinter) {
          throw new Error('Windows printer not initialized');
        }
        const printer = new ThermalWindowPrinter(this.terminalDevice.name);
        if (!isImage) {
          printer.printText(data);
          printer.print(EscPosCommands.ALIGN_CENTER);
          printer.printText('\n');
          printer.print(EscPosCommands.ALIGN_CENTER);
          printer.print(EscPosCommands.CUT);
        } else {
          printer.print(EscPosCommands.ALIGN_CENTER);
          await printer.printImageFromBase64(data, { width: 576, dither: true, threshold: 180 });
          printer.print(EscPosCommands.ALIGN_CENTER);
          printer.printText('\n');
          printer.print(EscPosCommands.ALIGN_CENTER);
          printer.print(EscPosCommands.CUT);
        }
        printer.close();
      } catch (e) {
        throw new Error('Printer error: ' + (e as Error).message);
      }
    } else {
      if (!isImage) {
        this.printer!.text(data);
        this.printer!.text('\n');
        this.printer!.cut(true);
        await this.printer!.close();
        await this.open();
      } else {
        const image = await Image.load(data);
        this.printer!.align('ct').raster(image, 'normal');
        this.printer!.println('\n').cut(true);
        await this.printer!.close();
        await this.open();
      }
    }
  }

  onError(callback: (error: Error | string) => void): void {
    if (!this.isWindows && this.device) {
      this.device.on('error', callback);
    }
  }
}