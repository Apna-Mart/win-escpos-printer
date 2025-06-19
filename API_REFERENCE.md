# Device Manager API Reference

This document outlines all public methods available to client projects using the Device Manager system.

## Getting Started

```typescript
import { createDeviceManagers } from './src/index_clean';

const { deviceManager, printerManager, scannerManager, scaleManager } = createDeviceManagers();
```

## DeviceManager

Core device discovery, USB monitoring, and configuration management.

### Device Management
- `async start(): Promise<void>` - Start device manager and USB monitoring
- `async stop(): Promise<void>` - Stop device manager and cleanup resources
- `async refreshDevices(): Promise<void>` - Manually refresh device list

### Device Access
- `getDevices(): TerminalDevice[]` - Get all connected devices
- `getDevice(deviceId: string): TerminalDevice | undefined` - Get specific device by ID
- `getDefaultDevice(deviceType: DeviceType): TerminalDevice | undefined` - Get default device for type
- `getDefaultDeviceId(deviceType: DeviceType): string | null` - Get default device ID for type
- `getDevicesByType(deviceType: DeviceType): TerminalDevice[]` - Get all devices of specific type

### Event Handling
- `onDeviceConnect(callback: (device: TerminalDevice) => void): void` - Listen for device connections
- `onDeviceDisconnect(callback: (deviceId: string) => void): void` - Listen for device disconnections

### Configuration Management
- `async setDeviceConfig(vid: string, pid: string, config: DeviceConfig): Promise<boolean>` - Create/set device config
- `async updateDeviceConfig(vid: string, pid: string, config: Partial<DeviceConfig>): Promise<DeviceConfig | null>` - Update existing config
- `async deleteDeviceConfig(vid: string, pid: string): Promise<boolean>` - Delete specific device config
- `async deleteAllDeviceConfigs(): Promise<boolean>` - Delete all device configurations
- `getDeviceConfig(vid: string, pid: string): DeviceConfig | null` - Get device configuration
- `getAllDeviceConfigs(): Record<string, DeviceConfig>` - Get all device configurations
- `hasDeviceConfig(vid: string, pid: string): boolean` - Check if device has config
- `getConfiguredDeviceCount(): number` - Get count of configured devices

### Default Device Management
- `async setDeviceAsDefault(deviceId: string): Promise<boolean>` - Set device as default for its type
- `async unsetDeviceAsDefault(deviceId: string): Promise<boolean>` - Unset device as default

## PrinterManager

Thermal printer operations using existing ThermalPrinterAdapter.

### Printing Operations
- `async printToDefault(data: string, isImage?: boolean): Promise<boolean>` - Print to default printer
- `async printToDevice(deviceId: string, data: string, isImage?: boolean): Promise<boolean>` - Print to specific printer

### Device Management
- `getPrinterDevices(): TerminalDevice[]` - Get all printer devices
- `getDefaultPrinter(): TerminalDevice | undefined` - Get default printer
- `async ensurePrinterAdapter(device: TerminalDevice): Promise<void>` - Ensure printer adapter is created
- `async closePrinterAdapter(deviceId: string): Promise<void>` - Close specific printer adapter
- `async closeAllPrinterAdapters(): Promise<void>` - Close all printer adapters

## ScannerManager

Barcode scanner operations with persistent callbacks and auto-reconnection.

### Scanning Operations
- `async scanFromDevice(deviceId: string, callback: (data: string) => void): Promise<void>` - Scan from specific device
- `async scanFromDefault(callback: (data: string) => void): Promise<void>` - Scan from default scanner
- `onScanData(callback: (data: string) => void): void` - Global scan callback for any scanner

### Scanner Control
- `async stopScanning(deviceId: string): Promise<void>` - Stop scanning from specific device
- `async stopScanningFromDefault(): Promise<void>` - Stop scanning from default scanner
- `async stopAllScanning(): Promise<void>` - Stop all scanning operations

### Callback Management
- `removeCallback(deviceId: string, callback: (data: string) => void): void` - Remove device-specific callback
- `removeDefaultCallback(callback: (data: string) => void): void` - Remove default scanner callback

### Device Information
- `getScannerDevices(): TerminalDevice[]` - Get all scanner devices
- `getDefaultScanner(): TerminalDevice | undefined` - Get default scanner
- `isScanning(deviceId: string): boolean` - Check if device is actively scanning
- `getActiveScanners(): string[]` - Get list of actively scanning device IDs

### Adapter Management
- `async ensureScannerAdapter(device: TerminalDevice, baudRate?: BaudRate): Promise<void>` - Ensure scanner adapter
- `async closeScannerAdapter(deviceId: string): Promise<void>` - Close specific scanner adapter
- `async closeAllScannerAdapters(): Promise<void>` - Close all scanner adapters

## ScaleManager

Weight scale operations with persistent callbacks, auto-reconnection, and one-time readings.

### Weight Reading Operations
- `async readFromDevice(deviceId: string, callback: (weight: string) => void): Promise<void>` - Read from a specific device
- `async readFromDefault(callback: (weight: string) => void): Promise<void>` - Read from a default scale
- `onWeightData(callback: (weight: string) => void): void` - Global weight callback for any scale

### One-Time Readings
- `async getCurrentWeight(timeoutMs?: number): Promise<string>` - Get current weight from a default scale (with timeout)
- `async getCurrentWeightFromDevice(deviceId: string, timeoutMs?: number): Promise<string>` - Get weight from a specific scale

### Scale Control
- `async stopReading(deviceId: string): Promise<void>` - Stop reading from a specific device
- `async stopReadingFromDefault(): Promise<void>` - Stop reading from a default scale
- `async stopAllReading(): Promise<void>` - Stop all reading operations

### Callback Management
- `removeCallback(deviceId: string, callback: (weight: string) => void): void` - Remove device-specific callback
- `removeDefaultCallback(callback: (weight: string) => void): void` - Remove default scale callback

### Device Information
- `getScaleDevices(): TerminalDevice[]` - Get all scale devices
- `getDefaultScale(): TerminalDevice | undefined` - Get default scale
- `isReading(deviceId: string): boolean` - Check if a device is actively reading
- `getActiveScales(): string[]` - Get a list of actively reading device IDs

### Adapter Management
- `async ensureScaleAdapter(device: TerminalDevice, baudRate?: BaudRate): Promise<void>` - Ensure scale adapter
- `async closeScaleAdapter(deviceId: string): Promise<void>` - Close specific scale adapter
- `async closeAllScaleAdapters(): Promise<void>` - Close all scale adapters

## Types

### TerminalDevice
```typescript
interface TerminalDevice {
  id: string;
  vid: string;
  pid: string;
  path: string;
  meta: DeviceConfig;
}
```

### DeviceConfig
```typescript
interface DeviceConfig {
  deviceType: DeviceType;
  brand: string;
  model: string;
  baudrate: BaudRate;
  setToDefault: boolean;
}
```

### DeviceType
```typescript
type DeviceType = 'printer' | 'scanner' | 'scale' | 'unassigned';
```

### BaudRate
```typescript
type BaudRate = 'not-supported' | 110 | 300 | 600 | 1200 | 2400 | 4800 | 9600 | 14400 | 19200 | 38400 | 57600 | 115200 | 128000 | 256000;
```

## Key Features

### Persistent Callbacks
- ✅ Callbacks work before devices are connected (queued until connection)
- ✅ Multiple listeners can be attached to the same device
- ✅ Callbacks survive device disconnections and automatically resume on reconnection
- ✅ Global callbacks work with any device of the same type

### Auto-Reconnection
- ✅ Devices automatically reconnect when plugged back in
- ✅ All callbacks and reading states are preserved across disconnections
- ✅ Smart auto-start logic based on device metadata and callback presence

### Performance Optimization
- ✅ Targeted refresh logic prevents over-refreshing devices
- ✅ USB attach events trigger targeted refresh only for the specific attached device
- ✅ USB detach events trigger targeted removal only for disconnected devices
- ✅ Configuration changes trigger targeted refresh only for the modified device
- ✅ Concurrent refresh protection prevents race conditions
- ✅ Full refresh only on start() and explicit refreshDevices() calls
- ✅ Active device operations continue uninterrupted during targeted updates

### Error Handling
- ✅ Graceful handling of device disconnections
- ✅ Callback error isolation (one callback error doesn't affect others)
- ✅ Timeout support for one-time operations
- ✅ Proper resource cleanup on shutdown

## Usage Examples

### Basic Setup
```typescript
const { deviceManager, printerManager, scannerManager, scaleManager } = createDeviceManagers();

// Start device manager
await deviceManager.start();

// Set up device events
deviceManager.onDeviceConnect(device => {
  console.log(`Device connected: ${device.id} (${device.meta.deviceType})`);
});
```

### Scanner Operations
```typescript
// Global callback for any scanner
scannerManager.onScanData(data => {
  console.log(`Scanned: ${data}`);
});

// Multiple callbacks on default scanner
await scannerManager.scanFromDefault(data => console.log(`Scanner A: ${data}`));
await scannerManager.scanFromDefault(data => console.log(`Scanner B: ${data}`));
```

### Scale Operations
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

### Configuration Management
```typescript
// Set device configuration
const success = await deviceManager.setDeviceConfig('1234', '5678', {
  deviceType: 'scanner',
  brand: 'Honeywell',
  model: 'MS7980g',
  baudrate: 9600,
  setToDefault: true
});

// Update existing configuration
const updated = await deviceManager.updateDeviceConfig('1234', '5678', {
  setToDefault: false
});

// Delete configuration
const deleted = await deviceManager.deleteDeviceConfig('1234', '5678');
```