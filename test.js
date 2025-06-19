const ESCPOSPrinter = require('./index.js');

// 获取命令行参数中的打印机名称
const printerName = process.argv[2];

if (!printerName) {
    console.error('请提供打印机名称作为参数');
    console.error('使用方法: node test.js "打印机名称"');
    console.error('');
    console.error('可用的打印机列表:');
    try {
        const printers = ESCPOSPrinter.getPrinterList();
        printers.forEach((printer, index) => {
            console.error(`${index + 1}. ${printer.name}`);
            if (printer.isUsb) {
                console.error(`   USB设备 - VID: ${printer.vid}, PID: ${printer.pid}`);
                console.error(`   端口: ${printer.portName}`);
            } else {
                console.error(`   非USB设备 - 端口: ${printer.portName}`);
            }
            console.error('');
        });
    } catch (error) {
        console.error('获取打印机列表失败:', error.message);
    }
    process.exit(1);
}

try {
    // 创建打印机实例
    const printer = new ESCPOSPrinter(printerName);

    // 准备打印数据
    const printData = Buffer.concat([
        ESCPOSPrinter.commands.INIT,
        ESCPOSPrinter.commands.ALIGN_CENTER,
        
        // 英文模式
        ESCPOSPrinter.commands.ASCII_MODE,
        ESCPOSPrinter.commands.BOLD_ON,
        Buffer.from('=== Test Page ===\n'),
        ESCPOSPrinter.commands.BOLD_OFF,
        Buffer.from('English Mode Test\n'),
        
        // 中文模式
        ESCPOSPrinter.commands.CHINESE_MODE,
        ESCPOSPrinter.commands.BOLD_ON,
        printer.textToBuffer('=== 测试页面 ===\n', 'GBK'),
        ESCPOSPrinter.commands.BOLD_OFF,
        printer.textToBuffer('中文模式测试\n', 'GBK'),
        
        // 混合模式测试
        ESCPOSPrinter.commands.TEXT_DOUBLE_HEIGHT,
        printer.textToBuffer('大字体测试 Big Font Test\n', 'GBK'),
        ESCPOSPrinter.commands.TEXT_NORMAL,
        
        ESCPOSPrinter.commands.ALIGN_LEFT,
        printer.textToBuffer('1. 中文项目 Chinese Item\n', 'GBK'),
        printer.textToBuffer('2. 测试内容 Test Content\n', 'GBK'),
        printer.textToBuffer('打印时间 Print Time: ' + new Date().toLocaleString() + '\n', 'GBK'),
        
        ESCPOSPrinter.commands.ALIGN_CENTER,
        printer.textToBuffer('------------------------\n', 'GBK'),
        ESCPOSPrinter.commands.CUT
    ]);

    // 发送数据到打印机
    const success = printer.print(printData);
    
    if (success) {
        console.log('打印成功！');
    } else {
        console.error('打印失败！');
    }

    // 关闭打印机连接
    printer.close();

} catch (error) {
    console.error('打印过程中发生错误：', error);
} 