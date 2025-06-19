#include <napi.h>
#include <string>
#include <vector>

class Printer : public Napi::ObjectWrap<Printer> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Printer(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    std::string printerName;

    Napi::Value Print(const Napi::CallbackInfo& info);
    Napi::Value Close(const Napi::CallbackInfo& info);
    static Napi::Value GetPrinterList(const Napi::CallbackInfo& info);
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

    this->printerName = info[0].As<Napi::String>().Utf8Value();
    // No actual printer initialization on non-Windows platforms
}

Napi::Value Printer::Print(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Stub implementation - always return true but don't actually print
    return Napi::Boolean::New(env, true);
}

Napi::Value Printer::Close(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    // Stub implementation - no actual cleanup needed
    return env.Undefined();
}

Napi::Value Printer::GetPrinterList(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Return empty array on non-Windows platforms
    // But maintain the same structure as Windows version for compatibility
    return Napi::Array::New(env);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return Printer::Init(env, exports);
}

NODE_API_MODULE(escpos_printer, Init)