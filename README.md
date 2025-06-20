# ESC/POS Device Library

A comprehensive TypeScript/Node.js library for managing thermal printers, barcode scanners, and weight scales with native Windows support and cross-platform compatibility. Designed for point-of-sale systems, retail applications, and Electron-based desktop applications.

## 🚀 Features

### **Multi-Device Support**
- 🖨️ **Thermal Printers**: ESC/POS printing with native Windows support
- 📱 **Barcode Scanners**: Real-time serial communication
- ⚖️ **Weight Scales**: Continuous monitoring and one-time readings
- 🔄 **Auto-Detection**: Real-time USB device discovery and monitoring

### **Platform Compatibility**
- **Windows**: Native printer drivers with Windows Print Spooler integration
- **macOS/Linux**: Cross-platform USB/Serial communication
- **Electron**: Full support for desktop applications

### **Advanced Device Management**
- **Persistent Callbacks**: Work before devices connect, survive disconnections
- **Auto-Reconnection**: Seamless device reconnection handling
- **Multi-Listener**: Multiple callbacks per device
- **Configuration Persistence**: Device settings saved automatically

## 📦 Installation

### Prerequisites

**For Native Module Compilation:**
- **Windows**: Visual Studio Build Tools 2019+ or Visual Studio Community
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential` package

**Node.js Requirements:**
- Node.js 16+ (tested with Node.js 18, 20, 22)
- Python 3.7+ (for node-gyp)

### Install the Library

```bash
npm install escpos-lib
# or
yarn add escpos-lib
```

### Development Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd escpos-lib
npm install

# Build native module and TypeScript
npm run build

# Start development
npm start
```

## 🏗️ Architecture

```
┌─ Device Manager ─────────────────────────────────────────────────┐
│  USB Detection │ Configuration │ Event Handling │ Auto-Reconnect  │
├─────────────────┼───────────────┼─────────────────┼─────────────────┤
│     Printer     │    Scanner    │      Scale      │    Adapters     │
│   Manager       │   Manager     │    Manager      │                 │
└─────────────────┴───────────────┴─────────────────┴─────────────────┘

┌─ Platform Layer ─────────────────┐    ┌─ Cross-Platform Layer ─────────┐
│ Windows (Native C++)             │    │ Unix/macOS (JavaScript)       │
│ • Windows Print Spooler         │    │ • @node-escpos libraries      │
│ • WMI USB Detection             │    │ • SerialPort communication    │
│ • Direct Printer Handles        │    │ • USB device management       │
└──────────────────────────────────┘    └────────────────────────────────┘
```

## 🛠️ Quick Start

### Basic Usage

```typescript
import { createDeviceManagers } from 'escpos-lib';

async function main() {
  // Initialize all managers
  const { deviceManager, printerManager, scannerManager, scaleManager } = createDeviceManagers();
  
  // Set up event listeners
  deviceManager.onDeviceConnect(device => {
    console.log(`Device connected: ${device.id} (${device.meta.deviceType})`);
  });
  
  deviceManager.onDeviceDisconnect(device => {
    console.log(`Device disconnected: ${device.id}`);
  });
  
  // Set up persistent callbacks (work before devices connect!)
  scannerManager.onScanData(data => {
    console.log(`Scanned: ${data}`);
    // Print the scanned barcode
    printerManager.printToDefault(`Barcode: ${data}\n\n\n`);
  });
  
  scaleManager.onWeightData(weight => {
    console.log(`Current weight: ${weight}g`);
  });
  
  // Start the device manager
  await deviceManager.start();
  console.log('Device management started!');
}

main().catch(console.error);
```

### Device Configuration

```typescript
// Configure a device (this persists across restarts)
await deviceManager.setDeviceConfig('0x483', '0x5743', {
  deviceType: 'printer',
  setToDefault: true,
  baudrate: 'not-supported', // USB printers don't use serial
  model: 'RP-803',
  brand: 'BalajiPOS'
});

// Configure a barcode scanner
await deviceManager.setDeviceConfig('0x26f1', '0x5650', {
  deviceType: 'scanner', 
  setToDefault: true,
  baudrate: 9600,
  model: 'Table Top PD-310',
  brand: 'BalajiPOS'
});

// Configure a weight scale
await deviceManager.setDeviceConfig('0x67b', '0x23a3', {
  deviceType: 'scale',
  setToDefault: true, 
  baudrate: 9600,
  model: 'DS-252',
  brand: 'Essae'
});
```

## 🖥️ Electron Integration

### Main Process Setup

```typescript
// main.ts (Electron main process)
import { app, BrowserWindow } from 'electron';
import { createDeviceManagers } from 'escpos-lib';

let mainWindow: BrowserWindow;
let deviceManagers: ReturnType<typeof createDeviceManagers>;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Initialize device managers in main process
  deviceManagers = createDeviceManagers();
  
  // Set up device event forwarding to renderer
  deviceManagers.deviceManager.onDeviceConnect(device => {
    mainWindow.webContents.send('device-connected', device);
  });
  
  deviceManagers.scannerManager.onScanData(data => {
    mainWindow.webContents.send('barcode-scanned', data);
  });
  
  deviceManagers.scaleManager.onWeightData(weight => {
    mainWindow.webContents.send('weight-data', weight);
  });
  
  await deviceManagers.deviceManager.start();
}

app.whenReady().then(createWindow);

// IPC handlers for renderer communication
import { ipcMain } from 'electron';

ipcMain.handle('print-receipt', async (event, content: string) => {
  try {
    await deviceManagers.printerManager.printToDefault(content);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-current-weight', async (event, timeout: number = 5000) => {
  try {
    const weight = await deviceManagers.scaleManager.getCurrentWeight(timeout);
    return { success: true, weight };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### Preload Script

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('deviceAPI', {
  // Printing
  printReceipt: (content: string) => ipcRenderer.invoke('print-receipt', content),
  
  // Weight scale
  getCurrentWeight: (timeout?: number) => ipcRenderer.invoke('get-current-weight', timeout),
  
  // Event listeners
  onDeviceConnected: (callback: (device: any) => void) => {
    ipcRenderer.on('device-connected', (event, device) => callback(device));
  },
  
  onBarcodeScanned: (callback: (data: string) => void) => {
    ipcRenderer.on('barcode-scanned', (event, data) => callback(data));
  },
  
  onWeightData: (callback: (weight: number) => void) => {
    ipcRenderer.on('weight-data', (event, weight) => callback(weight));
  }
});
```

### Renderer Process Usage

```typescript
// renderer.ts (React/Vue/vanilla JS)
declare global {
  interface Window {
    deviceAPI: {
      printReceipt: (content: string) => Promise<{success: boolean; error?: string}>;
      getCurrentWeight: (timeout?: number) => Promise<{success: boolean; weight?: number; error?: string}>;
      onDeviceConnected: (callback: (device: any) => void) => void;
      onBarcodeScanned: (callback: (data: string) => void) => void;
      onWeightData: (callback: (weight: number) => void) => void;
    };
  }
}

// Set up event listeners
window.deviceAPI.onBarcodeScanned((data: string) => {
  console.log('Barcode scanned:', data);
  // Update UI with scanned barcode
  document.getElementById('barcode-display')!.textContent = data;
});

window.deviceAPI.onWeightData((weight: number) => {
  console.log('Weight:', weight);
  // Update UI with current weight
  document.getElementById('weight-display')!.textContent = `${weight}g`;
});

// Print receipt
async function printReceipt() {
  const content = `
Receipt
=======
Item 1: $10.00
Item 2: $15.00
-------
Total: $25.00

Thank you!


`;
  
  const result = await window.deviceAPI.printReceipt(content);
  if (!result.success) {
    console.error('Print failed:', result.error);
  }
}

// Get current weight
async function weighItem() {
  const result = await window.deviceAPI.getCurrentWeight(3000);
  if (result.success) {
    console.log(`Current weight: ${result.weight}g`);
  } else {
    console.error('Failed to get weight:', result.error);
  }
}
```

## 📱 Advanced Usage

### Individual Manager Usage

```typescript
import { DeviceManager, PrinterManager, ScannerManager, ScaleManager } from 'escpos-lib';

// Initialize manually for more control
const deviceManager = new DeviceManager();
const printerManager = new PrinterManager(deviceManager);
const scannerManager = new ScannerManager(deviceManager);
const scaleManager = new ScaleManager(deviceManager);

await deviceManager.start();
```

### Printer Operations

```typescript
// Print to default printer
await printerManager.printToDefault('Hello World!\n\n\n');

// Print to specific printer
await printerManager.printToDevice('device_0x483_0x5743', 'Specific printer output\n\n\n');

// Get all connected printers
const printers = await printerManager.getAllPrinters();
console.log('Available printers:', printers);
```

### Scanner Operations

```typescript
// Global scanner callback (any scanner)
scannerManager.onScanData(data => {
  console.log(`Any scanner: ${data}`);
});

// Default scanner callback
await scannerManager.scanFromDefault(data => {
  console.log(`Default scanner: ${data}`);
});

// Multiple listeners on same device
await scannerManager.scanFromDefault(data => console.log(`Listener A: ${data}`));
await scannerManager.scanFromDefault(data => console.log(`Listener B: ${data}`));

// Scan from specific device
await scannerManager.scanFromDevice('device_0x26f1_0x5650', data => {
  console.log(`Specific scanner: ${data}`);
});
```

### Scale Operations

```typescript
// Continuous weight monitoring
await scaleManager.readFromDefault(weight => {
  console.log(`Continuous: ${weight}g`);
});

// One-time weight reading with timeout
try {
  const weight = await scaleManager.getCurrentWeight(5000); // 5 second timeout
  console.log(`One-time reading: ${weight}g`);
} catch (error) {
  console.log('Weight reading timeout');
}

// Global weight callback
scaleManager.onWeightData(weight => {
  console.log(`Any scale: ${weight}g`);
});
```

### Device Events

```typescript
// Device connection events
deviceManager.onDeviceConnect(device => {
  console.log(`Connected: ${device.name} (${device.meta.deviceType})`);
  console.log(`VID: ${device.vid}, PID: ${device.pid}`);
  console.log(`Path: ${device.path}`);
});

deviceManager.onDeviceDisconnect(device => {
  console.log(`Disconnected: ${device.name}`);
});

// Error handling
deviceManager.onDeviceError((deviceId, error) => {
  console.error(`Device ${deviceId} error:`, error);
});
```

## 🔧 Configuration

### Device Configuration Schema

```typescript
interface DeviceConfig {
  deviceType: 'printer' | 'scanner' | 'scale' | 'unassigned';
  brand: string;           // e.g., "BalajiPOS", "Essae"
  model: string;           // e.g., "RP-803", "DS-252"
  baudrate: number | 'not-supported';  // Serial baud rate or 'not-supported' for USB
  setToDefault: boolean;   // Make this the default device for its type
}
```

### Configuration Management

```typescript
// Save device configuration
await deviceManager.setDeviceConfig(vid, pid, config);

// Get device configuration
const config = await deviceManager.getDeviceConfig(vid, pid);

// Get all configured devices
const allConfigs = await deviceManager.getAllDeviceConfigs();

// Delete device configuration
await deviceManager.deleteDeviceConfig(vid, pid);
```

## 🛠️ Build Configuration

### Package.json Scripts

- `npm run build`: Build native module and TypeScript
- `npm start`: Development with file watching
- `npm run clean`: Clean native build artifacts
- `npm run check`: Format and lint code
- `npm install`: Auto-rebuilds native module

### Native Module Details

The library includes a native C++ module for Windows printer support:

- **Windows**: Compiles `src/native/printer.cpp` with Windows Print Spooler integration
- **Non-Windows**: Compiles `src/native/stub.cpp` for API compatibility

### binding.gyp Configuration

```json
{
  "targets": [{
    "target_name": "win_printer",
    "sources": [
      "<(OS)=='win' and 'src/native/printer.cpp' or 'src/native/stub.cpp'"
    ],
    "conditions": [
      ["OS=='win'", {
        "libraries": ["-lwbemuuid", "-ladvapi32", "-lole32"]
      }]
    ]
  }]
}
```

## 🐛 Troubleshooting

### Common Issues

#### **Native Module Build Fails**

**Windows:**
```bash
# Install Visual Studio Build Tools
npm install --global windows-build-tools

# Or install Visual Studio Community with C++ workload
# Ensure Python 3.7+ is installed
```

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# If still failing, install full Xcode from App Store
```

**Linux:**
```bash
# Install build essentials
sudo apt-get install build-essential

# For CentOS/RHEL
sudo yum groupinstall "Development Tools"
```

#### **Device Not Detected**

1. **Check USB connection** and device power
2. **Verify device configuration** matches actual VID/PID:
   ```bash
   # macOS/Linux
   lsusb
   
   # Windows
   # Use Device Manager to check VID/PID
   ```
3. **Check permissions** for USB device access
4. **Restart the device manager**:
   ```typescript
   await deviceManager.stop();
   await deviceManager.start();
   ```

#### **Printing Issues**

1. **Windows**: Ensure printer is installed in Windows and visible in Control Panel
2. **Check printer status**: Out of paper, cover open, etc.
3. **Verify ESC/POS compatibility** of your thermal printer
4. **Test with simple text** before trying images/formatting

#### **Serial Communication Issues**

1. **Check baud rate** matches device specification
2. **Verify COM port** is not in use by another application
3. **Check cable and connections**
4. **Try different USB ports**

#### **Electron-Specific Issues**

1. **Node integration**: Ensure native modules work in Electron's Node.js environment
2. **Electron rebuild**: May need to rebuild native modules for Electron:
   ```bash
   npm install --save-dev electron-rebuild
   npx electron-rebuild
   ```
3. **Permissions**: Electron apps may need additional permissions for USB/Serial access

### Debugging

Enable debug logging:

```typescript
// Set environment variable
process.env.DEBUG = 'escpos-lib:*';

// Or use console logging
deviceManager.setDebugMode(true);
```

### Performance Optimization

```typescript
// Reduce USB scan frequency for better performance
deviceManager.setRefreshInterval(5000); // 5 seconds instead of default 1 second

// Limit device types to scan for
deviceManager.setDeviceFilters(['printer', 'scanner']); // Skip scales
```

## 📄 API Reference

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Submit a pull request

## 📋 Requirements Summary

- **Node.js**: 16+ (tested with 18, 20, 22)
- **Python**: 3.7+ (for node-gyp)
- **Windows**: Visual Studio Build Tools 2019+
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential package

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🏷️ Version History

- **1.0.0**: Initial release with multi-device support
- **1.0.1**: Electron integration improvements
- **1.0.2**: Enhanced error handling and reconnection

---

**Need help?** Open an issue on GitHub or check the [API Reference](./API_REFERENCE.md) for detailed documentation.