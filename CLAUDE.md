# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ESC/POS thermal printer library for Node.js with native Windows support and cross-platform compatibility. The library combines native C++ bindings for Windows printer communication with JavaScript/TypeScript high-level APIs for thermal printing operations, along with comprehensive device management for printers, barcode scanners, and weight scales.

## Architecture

### Core Components

- **Native Layer**: C++ bindings using N-API (Node.js Add-on API)
  - `src/native/printer.cpp` - Windows-specific printer implementation with full Windows Print Spooler integration
  - `src/native/stub.cpp` - Cross-platform stub for non-Windows environments (returns empty printer lists, simulates operations)
  - `binding.gyp` - Node-gyp build configuration with conditional compilation based on OS

- **Device Management System**: Unified architecture for managing multiple device types
  - `src/managers/deviceManager.ts` - Core device discovery, USB monitoring, and connection management
  - `src/managers/printerManager.ts` - Printer-specific operations using adapter pattern
  - `src/managers/scannerManager.ts` - Barcode scanner operations with persistent callbacks
  - `src/managers/scaleManager.ts` - Weight scale operations with persistent callbacks and one-time readings

- **Core Utilities**: 
  - `src/core/deviceEvents.ts` - Centralized event handling for device connect/disconnect/data/error
  - `src/core/deviceDetector.ts` - Cross-platform device detection (Windows, macOS, Linux)
  - `src/core/deviceConfig.ts` - Device configuration persistence
  - `src/core/types.ts` - TypeScript type definitions
  - `src/core/retryUtils.ts` - Retry logic with exponential backoff
  - `src/core/persistentStorage.ts` - Storage abstraction

- **Device Adapters**: Abstraction layer for different hardware types
  - `src/adaptor/deviceAdaptor.ts` - Base adapter interfaces
  - `src/adaptor/printerAdapterFactory.ts` - Factory for creating printer adapters
  - `src/adaptor/windowsPrinterAdapter.ts` - Windows-specific printer adapter
  - `src/adaptor/unixPrinterAdapter.ts` - Unix/Linux printer adapter
  - `src/adaptor/barcodeScannerAdaptor.ts` - Barcode scanner adapter
  - `src/adaptor/weightScaleAdaptor.ts` - Weight scale adapter

- **Services**: 
  - `src/services/deviceConfigService.ts` - Device configuration management service

## Development Commands

```bash
# Build native module and TypeScript
npm run build

# Start development with file watching
npm run example

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Clean native build artifacts
npm run clean

# Format and lint code
npm run check

# Rebuild native module (also runs during npm install)
npm install
```

## Platform-Specific Behavior

The library uses conditional compilation in `binding.gyp`:
- **Windows**: Compiles `src/native/printer.cpp` with full Windows Print Spooler integration, WMI USB device detection
- **Non-Windows**: Compiles `src/native/stub.cpp` providing API-compatible stubs that log operations but don't actually print

JavaScript layer automatically detects native module availability and switches to compatibility mode when needed.

## Key Features

### Multi-Device Support
- **Thermal Printers**: ESC/POS printing with native Windows support
- **Barcode Scanners**: Real-time serial communication
- **Weight Scales**: Continuous monitoring and one-time readings
- **Auto-Detection**: Real-time USB device discovery and monitoring

### Device Management
- **Persistent Callbacks**: Work before devices connect, survive disconnections
- **Auto-Reconnection**: Seamless device reconnection handling
- **Multi-Listener**: Multiple callbacks per device
- **Configuration Persistence**: Device settings saved automatically

### Printer Features
- Multi-charset support (ASCII, GBK for Chinese)
- Font selection and text sizing
- Text alignment (left, center, right)
- Image processing from file paths or base64 data
- Barcode support (UPC-A/E, EAN13/8, CODE39, ITF, CODABAR)
- QR code generation with size and error correction options

## Development Notes

### Native Module Development
- Uses N-API for Node.js version compatibility
- Windows implementation requires `wbemuuid.lib`, `advapi32.lib`, `ole32.lib`
- Cross-platform stub maintains API compatibility for development/testing on non-Windows

### Code Style
- Uses Biome for formatting with tab indentation and single quotes
- TypeScript compilation to `dist/` directory
- Strict TypeScript configuration with source maps and declarations

### Testing
- Jest test framework with TypeScript support
- Coverage reporting available
- Watch mode for development

### Dependencies
- Core ESC/POS functionality: `@node-escpos/core`, `@node-escpos/usb-adapter`, `@node-escpos/serialport-adapter`
- Serial communication: `serialport`
- Image processing: `jimp`
- Text encoding: `iconv-lite`
- Native compilation: `node-gyp`
- USB device management: `usb`
- WebSocket support: `ws`
- Persistent storage: `node-global-storage`

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
import { createDeviceManagers } from 'escpos-lib';

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

## Build Configuration

### TypeScript Configuration
- Target: ES2016
- Module: CommonJS
- Strict mode enabled
- Declaration files generated with source maps

### Biome Configuration
- Tab indentation
- Single quotes for JavaScript
- Recommended linting rules

### Node-gyp Configuration
- Conditional compilation based on OS
- N-API support for Node.js compatibility
- Platform-specific library linking

## Entry Points

- **Main**: `dist/index.js` (compiled from `src/index.ts`)
- **Types**: `dist/index.d.ts`
- **Example**: `example.ts` (development example)
- **Factory Function**: `createDeviceManagers()` for easy initialization

## Device Configuration

Device configurations are persisted using the `DeviceConfigService` and include:
- Device type (printer, scanner, scale, unassigned)
- Brand and model information
- Baudrate settings (for serial devices)
- Default device selection
- Auto-start preferences

## Testing Strategy

- Unit tests with Jest
- TypeScript support via ts-jest
- Coverage reporting
- Watch mode for development
- Example file for integration testing

## Complete Device State Management

### Device Connection States & Events

#### Initial Device Discovery
- **Location**: `src/managers/deviceManager.ts:31-44` (start method)
- **Process**: 
  1. Performs initial device scan via `refreshDevices()`
  2. Sets up USB monitoring listeners
  3. Marks system as running

#### USB Device Attachment (`deviceManager.ts:338-344`)
```typescript
usb.on('attach', (device) => {
  const vid = device.deviceDescriptor.idVendor;
  const pid = device.deviceDescriptor.idProduct;
  console.log(`USB device attached: ${vid}:${pid}`);
  this.refreshDeviceByVidPid(vid, pid);
});
```

#### Device Connect Event Processing (`deviceManager.ts:122-141`)
1. **New Device Detection**: Device added to Map, `emitDeviceConnect()` called
2. **Existing Device Update**: Metadata changes trigger reconnect event
3. **Manager Notifications**: All device managers receive connect events

### Device Disconnection Flow

#### USB Device Detachment (`deviceManager.ts:346-353`)
```typescript
usb.on('detach', (device) => {
  const vid = device.deviceDescriptor.idVendor;
  const pid = device.deviceDescriptor.idProduct;
  console.log(`USB device detached: ${vid}:${pid}`);
  this.checkForDisconnectedDevices();
});
```

#### Disconnect Event Processing (`deviceManager.ts:143-151`)
1. **Device Removal**: Device removed from Map
2. **Event Emission**: `emitDeviceDisconnect(deviceId)` called
3. **Cleanup**: Event callbacks cleaned up in `deviceEvents.ts:47-57`

### Device Reconnection Handling

#### Scanner Manager Reconnection (`scannerManager.ts:312-386`)
- **Persistent Callbacks**: Callbacks stored in `persistentCallbacks` Map survive disconnections
- **Auto-Resume**: Devices automatically restart scanning when reconnected if callbacks exist
- **Default Device Handling**: Pending default callbacks moved to device-specific storage

#### Scale Manager Reconnection (`scaleManager.ts:308-390`)
- **Same Pattern**: Identical persistent callback and auto-resume logic as scanners
- **Weight Reading**: Continuous monitoring resumes automatically

### Device Configuration Management

#### Configuration Update Flow (`deviceManager.ts:248-320`)
```typescript
async refreshDeviceConfig(vid: string, pid: string): Promise<void>
```

**Triggers**:
- Config creation: `setDeviceConfig()` → `refreshDeviceConfig()`
- Config updates: `updateDeviceConfig()` → `refreshDeviceConfig()`
- Config deletion: `deleteDeviceConfig()` → `refreshDeviceConfig()`

**Config Deletion Special Handling** (`deviceManager.ts:271-284`):
- Scanner subscriptions cleaned up before device removal
- Devices with deleted configs become 'unassigned'
- `cleanupScannerSubscription()` called for scanner devices

#### Configuration Persistence (`src/core/deviceConfig.ts`)
- **Storage**: Node global storage for cross-session persistence
- **Validation**: Strict validation for deviceType, baudrate, brand, model
- **CRUD Operations**: Complete create, read, update, delete operations

### Device Read Start/Stop Operations

#### Scanner Operations
**Start Scanning** (`scannerManager.ts:124-143`):
1. `ensureScannerAdapter()` creates/reuses SerialPort adapter
2. Device event listener established for data routing
3. Added to `activeScanners` Set
4. Adapter opens serial connection with retry logic

**Stop Scanning** (`scannerManager.ts:75-81`):
1. Removed from `activeScanners` Set  
2. `closeScannerAdapter()` closes SerialPort connection
3. Callbacks preserved for reconnection

#### Scale Operations
**Start Reading** (`scaleManager.ts:124-143`):
- Identical pattern to scanner operations
- Uses `WeightScaleAdapter` with ReadlineParser for \r\n delimited data

**Stop Reading** (`scaleManager.ts:75-81`):
- Same cleanup pattern as scanners
- Preserves callbacks for reconnection

#### Auto-Start Logic (`scannerManager.ts:332-382` & `scaleManager.ts:329-379`)
Devices automatically start reading/scanning when:
1. **Has Callbacks**: Device has persistent callbacks waiting
2. **Default with Pending**: Device is default and has pending callbacks
3. **Global Callbacks**: Global callbacks are registered
4. **Default Device**: Device is marked as default (`setToDefault: true`)

#### Auto-Stop Logic
Devices automatically stop when:
1. **Lost Default Status**: Device was default but `setToDefault` changed to false
2. **Config Deleted**: Device configuration removed
3. **Device Disconnected**: Physical disconnection detected

### Device Configuration Delete Operations

#### Single Device Config Delete (`deviceManager.ts:385-391`)
```typescript
async deleteDeviceConfig(vid: string, pid: string): Promise<boolean> {
  const result = await this.configService.deleteDeviceConfig(vid, pid);
  if (result) {
    await this.refreshDeviceConfig(vid, pid);
  }
  return result;
}
```

#### All Configs Delete (`deviceManager.ts:393-405`)
```typescript
async deleteAllDeviceConfigs(): Promise<boolean> {
  const currentDevices = Array.from(this.devices.values());
  const deviceVidPids = new Set(currentDevices.map(d => `${d.vid}:${d.pid}`));
  for (const vidPidKey of deviceVidPids) {
    const [vid, pid] = vidPidKey.split(':');
    await this.configService.deleteDeviceConfig(vid, pid);
    await this.refreshDeviceConfig(vid, pid);
  }
  return true;
}
```

**Effects of Config Deletion**:
1. Device becomes 'unassigned' type
2. Scanner/scale operations stopped automatically
3. Serial adapters closed and cleaned up
4. Device remains in manager but loses functionality
5. Callbacks preserved in case device is reconfigured

### Event System Architecture

#### DeviceEventEmitter (`src/core/deviceEvents.ts`)
- **Connect Events**: `onDeviceConnect()` / `emitDeviceConnect()`
- **Disconnect Events**: `onDeviceDisconnect()` / `emitDeviceDisconnect()`
- **Data Events**: Device-specific data routing via `onDeviceData()`
- **Error Events**: Error propagation via `onDeviceError()`

#### Callback Isolation
- Individual callback errors don't affect other callbacks
- Error logging for debugging without system interruption
- Memory cleanup on device disconnection

### Key State Transitions

```
[USB Attach] → [Device Detection] → [Config Applied] → [Connect Event] → [Auto-Start Reading]
                                                           ↓
[Callbacks Added] → [Adapter Created] → [Serial Connection] → [Data Flow]
                                                           ↓
[USB Detach] → [Disconnect Event] → [Adapter Closed] → [Callbacks Preserved]
                                                           ↓
[USB Re-attach] → [Connect Event] → [Auto-Resume Reading] → [Data Flow Restored]

[Config Update] → [Device Refresh] → [Connect Event] → [Settings Applied]
[Config Delete] → [Cleanup Operations] → [Device Unassigned] → [Operations Stopped]
```

### Error Handling & Recovery

- **Connection Failures**: Exponential backoff retry for serial connections
- **Adapter Errors**: Automatic cleanup and restart attempts
- **Config Validation**: Strict validation prevents invalid configurations
- **Memory Leaks**: Proper event listener cleanup on disconnection
- **State Consistency**: Device state synchronized across all managers