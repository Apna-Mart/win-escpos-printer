{
  "targets": [
    {
      "target_name": "escpos_printer",
      "conditions": [
        ["OS=='win'", {
          "sources": [ "src/printer.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
          "libraries": [
            "advapi32.lib",
            "wbemuuid.lib",
            "ole32.lib"
          ]
        }, {
          "sources": [ "src/stub.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
        }]
      ]
    }
  ]
} 