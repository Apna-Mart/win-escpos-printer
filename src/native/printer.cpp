#include <napi.h>
#include <windows.h>
#include <comdef.h>
#include <Wbemidl.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cctype>

#pragma comment(lib, "wbemuuid.lib")

struct PrinterDeviceInfo {
    std::string vid;
    std::string pid;
    std::string deviceId;
};

class Printer : public Napi::ObjectWrap<Printer> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Printer(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    HANDLE printerHandle;
    std::wstring printerName;
    std::vector<wchar_t> docName;
    std::vector<wchar_t> dataType;

    Napi::Value Print(const Napi::CallbackInfo& info);
    Napi::Value Close(const Napi::CallbackInfo& info);
    static Napi::Value GetPrinterList(const Napi::CallbackInfo& info);

    bool SendDataToPrinter(const std::vector<unsigned char>& data);
    static std::map<std::string, PrinterDeviceInfo> GetUsbPrinterDevices();
    static void ParseVidPid(const std::string& deviceId, std::string& vid, std::string& pid);
    static bool IsUsbPort(const std::string& portName);
    static std::string ToLower(const std::string& str);
};

Napi::FunctionReference Printer::constructor;

Napi::Object Printer::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "Printer", {
        InstanceMethod("print", &Printer::Print),
        InstanceMethod("close", &Printer::Close),
        StaticMethod("getPrinterList", &Printer::GetPrinterList)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("Printer", func);
    return exports;
}

Printer::Printer(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Printer>(info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Printer name expected").ThrowAsJavaScriptException();
        return;
    }

    std::string utf8Name = info[0].As<Napi::String>().Utf8Value();

    // Convert to wide characters
    int wlen = MultiByteToWideChar(CP_UTF8, 0, utf8Name.c_str(), -1, NULL, 0);
    std::vector<wchar_t> wstr(wlen);
    MultiByteToWideChar(CP_UTF8, 0, utf8Name.c_str(), -1, wstr.data(), wlen);
    this->printerName = std::wstring(wstr.data());

    // Initialize document name and data type
    const wchar_t* docNameStr = L"ESC/POS Print Job";
    const wchar_t* dataTypeStr = L"RAW";
    this->docName.assign(docNameStr, docNameStr + wcslen(docNameStr) + 1);
    this->dataType.assign(dataTypeStr, dataTypeStr + wcslen(dataTypeStr) + 1);

    this->printerHandle = NULL;
    PRINTER_DEFAULTSW pd = {0};
    pd.DesiredAccess = PRINTER_ACCESS_USE;

    if (!OpenPrinterW((LPWSTR)this->printerName.c_str(), &this->printerHandle, &pd)) {
        Napi::Error::New(env, "Failed to open printer").ThrowAsJavaScriptException();
        return;
    }
}

std::string Printer::ToLower(const std::string& str) {
    std::string lower = str;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    return lower;
}

bool Printer::IsUsbPort(const std::string& portName) {
    if (portName.empty()) {
        return false;
    }
    
    std::string lowerPort = ToLower(portName);
    
    // Standard USB ports: USB001, USB002, etc.
    if (lowerPort.find("usb") == 0 && lowerPort.length() >= 6) {
        // Check if it follows USBxxx pattern
        bool isNumeric = true;
        for (size_t i = 3; i < lowerPort.length() && i < 6; i++) {
            if (!std::isdigit(lowerPort[i])) {
                isNumeric = false;
                break;
            }
        }
        if (isNumeric) {
            return true;
        }
    }
    
    // Custom USB ports: RongtaUSB PORT:, EpsonUSB001, etc.
    if (lowerPort.find("usb") != std::string::npos && 
        (lowerPort.find("port") != std::string::npos || 
         lowerPort.find("printer") != std::string::npos)) {
        return true;
    }
    
    // Exclude known virtual ports
    std::vector<std::string> virtualPorts = {
        "portprompt:", "nul:", "shrfax:", "ad_port", "file:", "lpt", "com",
        "microsoft.", "onenoteim", "xpsport:", "faxport:", "webprint"
    };
    
    for (const auto& virtualPort : virtualPorts) {
        if (lowerPort.find(virtualPort) != std::string::npos) {
            return false;
        }
    }
    
    // If it contains USB and not in virtual list, likely a USB port
    if (lowerPort.find("usb") != std::string::npos) {
        return true;
    }
    
    return false;
}

void Printer::ParseVidPid(const std::string& deviceId, std::string& vid, std::string& pid) {
    // DeviceID format: "USB\VID_04B8&PID_0005\6&1234ABCD&0&1" or "USB\vid_04b8&pid_0005\6&1234ABCD&0&1"
    
    // Try uppercase first
    size_t vidPos = deviceId.find("VID_");
    size_t pidPos = deviceId.find("PID_");
    
    // If not found, try lowercase
    if (vidPos == std::string::npos) {
        vidPos = deviceId.find("vid_");
    }
    if (pidPos == std::string::npos) {
        pidPos = deviceId.find("pid_");
    }
    
    if (vidPos != std::string::npos && vidPos + 8 <= deviceId.length()) {
        vid = deviceId.substr(vidPos + 4, 4);
    }
    
    if (pidPos != std::string::npos && pidPos + 8 <= deviceId.length()) {
        pid = deviceId.substr(pidPos + 4, 4);
    }
}

std::map<std::string, PrinterDeviceInfo> Printer::GetUsbPrinterDevices() {
    std::map<std::string, PrinterDeviceInfo> devices;
    
    HRESULT hres = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hres)) {
        return devices;
    }

    // Initialize COM security - handle already initialized case
    hres = CoInitializeSecurity(
        NULL, -1, NULL, NULL,
        RPC_C_AUTHN_LEVEL_NONE,
        RPC_C_IMP_LEVEL_IMPERSONATE,
        NULL, EOAC_NONE, NULL);
    
    // Ignore RPC_E_TOO_LATE error (COM security already initialized)
    if (FAILED(hres) && hres != RPC_E_TOO_LATE) {
        CoUninitialize();
        return devices;
    }

    IWbemLocator* pLoc = NULL;
    hres = CoCreateInstance(
        CLSID_WbemLocator, 0,
        CLSCTX_INPROC_SERVER,
        IID_IWbemLocator, (LPVOID*)&pLoc);

    if (FAILED(hres)) {
        CoUninitialize();
        return devices;
    }

    IWbemServices* pSvc = NULL;
    hres = pLoc->ConnectServer(
        _bstr_t(L"ROOT\\CIMV2"),
        NULL, NULL, 0, NULL, 0, 0, &pSvc);

    if (FAILED(hres)) {
        pLoc->Release();
        CoUninitialize();
        return devices;
    }

    hres = CoSetProxyBlanket(
        pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL,
        RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
        NULL, EOAC_NONE);

    if (FAILED(hres)) {
        pSvc->Release();
        pLoc->Release();
        CoUninitialize();
        return devices;
    }

    // Enhanced query for USB printer devices - only active and present devices
    IEnumWbemClassObject* pEnumerator = NULL;
    hres = pSvc->ExecQuery(
        bstr_t("WQL"),
        bstr_t("SELECT * FROM Win32_PnPEntity WHERE DeviceID LIKE 'USB%VID_%' AND (Name LIKE '%printer%' OR Name LIKE '%print%' OR Service='usbprint') AND ConfigManagerErrorCode=0 AND Status='OK'"),
        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
        NULL, &pEnumerator);

    if (FAILED(hres)) {
        pSvc->Release();
        pLoc->Release();
        CoUninitialize();
        return devices;
    }

    IWbemClassObject* pclsObj = NULL;
    ULONG uReturn = 0;

    while (pEnumerator) {
        HRESULT hr = pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn);
        if (uReturn == 0 || !pclsObj) break;

        VARIANT vtName, vtDeviceId, vtPresent;
        VariantInit(&vtName);
        VariantInit(&vtDeviceId);
        VariantInit(&vtPresent);

        // Get device name, ID, and presence status
        hr = pclsObj->Get(L"Name", 0, &vtName, 0, 0);
        hr = pclsObj->Get(L"DeviceID", 0, &vtDeviceId, 0, 0);
        hr = pclsObj->Get(L"Present", 0, &vtPresent, 0, 0);

        // Only process devices that are present and have valid name/ID
        bool isPresent = (vtPresent.vt == VT_BOOL && vtPresent.boolVal == VARIANT_TRUE) || 
                        (vtPresent.vt == VT_I4 && vtPresent.intVal != 0) ||
                        (vtPresent.vt == VT_EMPTY); // Some devices may not have Present field
        
        if (vtName.vt == VT_BSTR && vtDeviceId.vt == VT_BSTR && isPresent) {
            // Convert to string
            _bstr_t bstrName(vtName.bstrVal, false);
            _bstr_t bstrDeviceId(vtDeviceId.bstrVal, false);
            
            std::string deviceName = (char*)bstrName;
            std::string deviceId = (char*)bstrDeviceId;

            PrinterDeviceInfo info;
            ParseVidPid(deviceId, info.vid, info.pid);
            info.deviceId = deviceId;

            if (!info.vid.empty() && !info.pid.empty()) {
                devices[deviceName] = info;
            }
        }

        VariantClear(&vtName);
        VariantClear(&vtDeviceId);
        VariantClear(&vtPresent);
        pclsObj->Release();
        pclsObj = NULL;
    }

    if (pEnumerator) pEnumerator->Release();
    pSvc->Release();
    pLoc->Release();
    CoUninitialize();

    return devices;
}

bool Printer::SendDataToPrinter(const std::vector<unsigned char>& data) {
    if (!this->printerHandle) return false;

    DOC_INFO_1W docInfo = {0};
    docInfo.pDocName = this->docName.data();
    docInfo.pOutputFile = NULL;
    docInfo.pDatatype = this->dataType.data();

    if (StartDocPrinterW(this->printerHandle, 1, (LPBYTE)&docInfo)) {
        DWORD dwWritten = 0;
        if (StartPagePrinter(this->printerHandle)) {
            WritePrinter(this->printerHandle, (LPVOID)data.data(), (DWORD)data.size(), &dwWritten);
            EndPagePrinter(this->printerHandle);
        }
        EndDocPrinter(this->printerHandle);
        return dwWritten == data.size();
    }
    return false;
}

Napi::Value Printer::Print(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Buffer<unsigned char> buffer = info[0].As<Napi::Buffer<unsigned char>>();
    std::vector<unsigned char> data(buffer.Data(), buffer.Data() + buffer.Length());

    bool success = SendDataToPrinter(data);
    return Napi::Boolean::New(env, success);
}

Napi::Value Printer::Close(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (this->printerHandle) {
        ClosePrinter(this->printerHandle);
        this->printerHandle = NULL;
    }

    return env.Undefined();
}

Napi::Value Printer::GetPrinterList(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Get USB printer device info first
    std::map<std::string, PrinterDeviceInfo> usbDevices = GetUsbPrinterDevices();

    DWORD needed = 0, returned = 0;
    EnumPrintersW(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, NULL, 2, NULL, 0, &needed, &returned);

    if (needed == 0) {
        return Napi::Array::New(env);
    }

    std::vector<BYTE> buffer(needed);
    PRINTER_INFO_2W* printerInfo = reinterpret_cast<PRINTER_INFO_2W*>(buffer.data());

    if (!EnumPrintersW(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, NULL, 2, buffer.data(), needed, &needed, &returned)) {
        Napi::Error::New(env, "Failed to enumerate printers").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array printerList = Napi::Array::New(env, returned);

    for (DWORD i = 0; i < returned; i++) {
        Napi::Object printer = Napi::Object::New(env);

        // Convert printer name to UTF8
        int utf8Length = WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pPrinterName, -1, NULL, 0, NULL, NULL);
        std::vector<char> utf8Name(utf8Length);
        WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pPrinterName, -1, utf8Name.data(), utf8Length, NULL, NULL);

        // Convert printer description to UTF8
        utf8Length = WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pComment ? printerInfo[i].pComment : L"", -1, NULL, 0, NULL, NULL);
        std::vector<char> utf8Comment(utf8Length);
        WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pComment ? printerInfo[i].pComment : L"", -1, utf8Comment.data(), utf8Length, NULL, NULL);

        // Convert port name to UTF8
        std::string portName = "";
        if (printerInfo[i].pPortName) {
            int portUtf8Length = WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pPortName, -1, NULL, 0, NULL, NULL);
            std::vector<char> utf8Port(portUtf8Length);
            WideCharToMultiByte(CP_UTF8, 0, printerInfo[i].pPortName, -1, utf8Port.data(), portUtf8Length, NULL, NULL);
            portName = utf8Port.data();
        }

        printer.Set("name", utf8Name.data());
        printer.Set("description", utf8Comment.data());
        printer.Set("isDefault", (printerInfo[i].Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0);
        printer.Set("portName", portName);

        // Add VID/PID information based on port type
        bool foundUsbInfo = false;
        
        // Only assign USB info to printers with USB ports
        if (IsUsbPort(portName)) {
            if (usbDevices.size() == 1) {
                // Single USB device found - assign it to this USB port
                auto device = usbDevices.begin();
                printer.Set("vid", device->second.vid);
                printer.Set("pid", device->second.pid);
                printer.Set("deviceId", device->second.deviceId);
                printer.Set("isUsb", true);
                foundUsbInfo = true;
            } else if (usbDevices.size() > 1) {
                // Multiple USB devices - try to match by name as fallback
                std::string printerName = utf8Name.data();
                std::string lowerPrinter = ToLower(printerName);
                
                for (const auto& device : usbDevices) {
                    std::string lowerDevice = ToLower(device.first);
                    
                    // Simple matching for multiple device case
                    if (lowerDevice.find(lowerPrinter) != std::string::npos || 
                        lowerPrinter.find(lowerDevice) != std::string::npos) {
                        printer.Set("vid", device.second.vid);
                        printer.Set("pid", device.second.pid);
                        printer.Set("deviceId", device.second.deviceId);
                        printer.Set("isUsb", true);
                        foundUsbInfo = true;
                        break;
                    }
                }
                
                // If no name match found, assign the first device as fallback
                if (!foundUsbInfo && !usbDevices.empty()) {
                    auto device = usbDevices.begin();
                    printer.Set("vid", device->second.vid);
                    printer.Set("pid", device->second.pid);
                    printer.Set("deviceId", device->second.deviceId);
                    printer.Set("isUsb", true);
                    foundUsbInfo = true;
                }
            }
        }

        if (!foundUsbInfo) {
            printer.Set("vid", "");
            printer.Set("pid", "");
            printer.Set("deviceId", "");
            printer.Set("isUsb", false);
        }

        printerList[i] = printer;
    }

    return printerList;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return Printer::Init(env, exports);
}

NODE_API_MODULE(escpos_printer, Init)