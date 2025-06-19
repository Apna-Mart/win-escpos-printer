# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ESC/POS thermal printer library for Node.js with native Windows support and cross-platform compatibility. The library combines native C++ bindings for Windows printer communication with JavaScript/TypeScript high-level APIs for thermal printing operations.

## Architecture

### Core Components

- **Native Layer**: C++ bindings using N-API (Node.js Add-on API)
  - `src/native/printer.cpp` - Windows-specific printer implementation with full Windows Print Spooler integration
  - `src/native/stub.cpp` - Cross-platform stub for non-Windows environments (returns empty printer lists, simulates operations)
  - `binding.gyp` - Node-gyp build configuration with conditional compilation based on OS

- **JavaScript Layer**: `src/index.js` - Main ESC/POS printer class with comprehensive printing features
  - Auto-detects native module availability and falls back to compatibility mode
  - Supports both Windows native printing and cross-platform simulation
  - Character encoding support (ASCII, GBK for Chinese text)
  - Image processing with Jimp library (file paths and base64 data)
  - Barcode and QR code generation
  - Comprehensive ESC/POS command library

- **TypeScript Definitions**: `src/index.d.ts` - Complete type definitions for all printer functionality

- **Device Management System**: Split architecture for managing multiple device types
  - `src/deviceManager.ts` - Core device discovery, USB monitoring, and connection management
  - `src/printerManager.ts` - Printer-specific operations using ThermalPrinterAdapter
  - `src/scannerManager.ts` - Barcode scanner operations with persistent callbacks
  - `src/scaleManager.ts` - Weight scale operations with persistent callbacks and one-time readings
  - `src/deviceEvents.ts` - Centralized event handling for device connect/disconnect/data/error
  - `src/deviceDetector.ts` - Cross-platform device detection (Windows, macOS, Linux)
  - `src/deviceConfig.ts` - Device configuration persistence
  - `src/adaptor/` - Device adapter implementations for different hardware types

## Development Commands

```bash
# Build native module and TypeScript
npm run build

# Start development with file watching
npm start

# Clean native build artifacts
npm run clean

# Format and lint code
npm run check

# Rebuild native module (also runs during npm install)
npm install
```

## Platform-Specific Behavior

The library uses conditional compilation in `binding.gyp`:
- **Windows**: Compiles `printer.cpp` with full Windows Print Spooler integration, WMI USB device detection
- **Non-Windows**: Compiles `stub.cpp` providing API-compatible stubs that log operations but don't actually print

JavaScript layer automatically detects native module availability and switches to compatibility mode when needed.

## Key Features

### Printer Management
- `ESCPOSPrinter.getPrinterList()` - Returns detailed printer information including USB VID/PID detection
- Automatic printer handle management with proper resource cleanup

### Text Printing
- Multi-charset support (ASCII, GBK for Chinese)
- Font selection (Font A standard, Font B compressed) 
- Text sizing (normal, double height/width/size, custom multipliers 0-7)
- Text alignment (left, center, right)

### Graphics & Codes
- Image processing from file paths or base64 data
- Barcode support (UPC-A/E, EAN13/8, CODE39, ITF, CODABAR)
- QR code generation with size and error correction options
- Floyd-Steinberg dithering for image optimization

### ESC/POS Commands
- Complete command library in `ESCPOSPrinter.commands`
- Printer initialization, paper cutting, formatting
- Dynamic command generation for barcodes and QR codes

## Development Notes

### Native Module Development
- Uses N-API for Node.js version compatibility
- Windows implementation requires `wbemuuid.lib`, `advapi32.lib`, `ole32.lib`
- Cross-platform stub maintains API compatibility for development/testing on non-Windows

### Code Style
- Uses Biome for formatting with tab indentation and double quotes
- TypeScript compilation to `dist/` directory
- Private npm package (not published)

### Dependencies
- Core ESC/POS functionality: `@node-escpos/core`, `@node-escpos/usb-adapter`
- Serial communication: `serialport`
- Image processing: `jimp`
- Text encoding: `iconv-lite`
- Native compilation: `node-gyp`

## Device Manager System

### Overview
The device manager system provides a unified interface for managing thermal printers, barcode scanners, and weight scales. It features persistent callbacks, auto-reconnection, and real-time device monitoring.

### Key Features

#### Persistent Callbacks
- Callbacks work before devices are connected (queued until connection)
- Multiple listeners can be attached to the same device
- Callbacks survive device disconnections and automatically resume on reconnection
- Global callbacks work with any device of the same type

#### Auto-Reconnection
- Devices automatically reconnect when plugged back in
- All callbacks and reading states are preserved across disconnections
- Smart auto-start logic based on device metadata and callback presence

#### Device Management
- Cross-platform USB device detection and monitoring
- Real-time device connect/disconnect events
- Device configuration persistence
- Default device selection per device type

### Usage Examples

#### Basic Setup
```typescript
import { createDeviceManagers } from './src/index_clean';

const { deviceManager, printerManager, scannerManager, scaleManager } = createDeviceManagers();

// Set up device events
deviceManager.onDeviceConnect(device => {
  console.log(`Device connected: ${device.id} (${device.meta.deviceType})`);
});

await deviceManager.start();
```

#### Scanner Operations
```typescript
// Global callback for any scanner
scannerManager.onScanData(data => {
  console.log(`Scanned: ${data}`);
});

// Default scanner callback (works even before device connects)
await scannerManager.scanFromDefault(data => {
  console.log(`Default scanner: ${data}`);
});

// Multiple callbacks on same device
await scannerManager.scanFromDefault(data => console.log(`Listener A: ${data}`));
await scannerManager.scanFromDefault(data => console.log(`Listener B: ${data}`));
```

#### Scale Operations
```typescript
// Continuous weight monitoring
await scaleManager.readFromDefault(weight => {
  console.log(`Weight: ${weight}`);
});

// One-time weight reading with timeout
try {
  const weight = await scaleManager.getCurrentWeight(5000);
  console.log(`Current weight: ${weight}`);
} catch (error) {
  console.log(`Weight timeout: ${error}`);
}
```

#### Printer Operations
```typescript
// Print to default printer
await printerManager.printToDefault('Hello World\n\n\n');

// Print to specific printer
await printerManager.printToDevice('PRINTER_ID', 'Hello from specific printer\n\n\n');
```

### Architecture Requirements

#### When Working with Device Managers
1. **Use Existing Code**: Always leverage existing adaptors, deviceDetector, and deviceConfig
2. **Persistent Storage**: Callbacks must be stored persistently and survive device disconnections
3. **Queue Before Connect**: Allow callbacks to be set up before devices are connected
4. **Multiple Listeners**: Support multiple callbacks on the same device
5. **Auto-Reconnection**: Automatically resume functionality when devices reconnect
6. **Smart Auto-Start**: Start reading/scanning based on device metadata and callback presence

#### File Structure
- Split concerns into focused managers (device, printer, scanner, scale)
- Centralized event handling through DeviceEventEmitter
- Clean factory function for easy initialization
- Comprehensive examples demonstrating all features

#### Error Handling
- Graceful handling of device disconnections
- Callback error isolation (one callback error doesn't affect others)
- Timeout support for one-time operations
- Proper resource cleanup on shutdown