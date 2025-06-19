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