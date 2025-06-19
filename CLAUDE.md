# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js native addon for ESC/POS printer communication on Windows systems. It provides both JavaScript bindings and TypeScript definitions for thermal receipt printer operations, supporting mixed Chinese/English text printing with automatic encoding conversion.

## Architecture

The project consists of three main layers:

1. **Native C++ Layer**: 
   - `src/printer.cpp`: Windows-specific printer API bindings with VID/PID detection
   - `src/stub.cpp`: Cross-platform stub implementation for non-Windows systems
2. **JavaScript Interface** (`index.js`): Main ESC/POS printer class with command builders and image processing
3. **TypeScript Definitions** (`index.d.ts`): Complete type definitions for all functionality

The library automatically handles platform compatibility through conditional compilation in binding.gyp.

## Key Components

- **ESCPOSPrinter Class**: Main interface with methods for printing text, images, barcodes, and QR codes
- **Commands Object**: Static ESC/POS command builders for printer control
- **Image Processing**: JIMP-based image conversion for thermal printer bitmap format
- **Encoding Support**: Automatic GBK/ASCII encoding conversion for Chinese text
- **USB Device Detection**: WMI-based VID/PID extraction using Win32_PnPEntity for reliable USB thermal printer identification

## Development Commands

### Build Native Module
```bash
# Windows only - automatically runs during npm install
node-gyp rebuild
```

### Testing
```bash
# Test with a specific printer (Windows only)
node test.js "Printer Name"

# Get available printers with VID/PID information
node -e "console.log(require('./index.js').getPrinterList())"

# List all printers (shows VID/PID for USB printers)
node test.js
```

### Package Management
```bash
npm install    # Handles platform-specific builds automatically
npm publish    # Publishes to @mixgeeker/node-escpos-win
```

## Platform Considerations

- **Windows**: Full native functionality with C++ printer bindings and VID/PID detection
- **Other Platforms**: Compatibility mode using stub implementation - API remains functional for development but no actual printing
- Build process conditionally compiles platform-specific code (printer.cpp vs stub.cpp)
- Install script gracefully handles build failures on unsupported platforms

## Dependencies

- **Runtime**: `bindings`, `iconv-lite`, `jimp`, `node-addon-api`  
- **Build**: `node-gyp`, Windows SDK, Visual Studio Build Tools, WMI libraries (`wbemuuid.lib`, `ole32.lib`)
- **Dev**: `typescript`, `@types/node`

## Important Notes

- Printer names must match exactly with Windows system printer names
- Chinese text requires GBK encoding support on the printer
- Image processing converts to 1-bit bitmap format for thermal printers
- All async image operations return Promises
- TypeScript definitions provide complete API coverage
- VID/PID information is available for USB printers via WMI Win32_PnPEntity queries with intelligent device matching
- `getPrinterList()` now returns objects with detailed printer information including USB device data
- Enhanced name matching algorithm handles various printer driver naming conventions
- Supports both uppercase and lowercase VID/PID formats in device IDs