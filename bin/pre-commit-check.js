#!/usr/bin/env node

/**
 * Pre-commit Check CLI 入口文件
 *
 * 此文件作为 npm 包的 bin 入口，可以直接执行检查逻辑
 */

const path = require('path');
const fs = require('fs');

// 检查命令参数
const args = process.argv.slice(2);

// 显示帮助信息
if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
  const chalk = require('chalk');
  console.log(chalk.blue('\n📖 Pre-Commit Check 使用说明\n'));
  console.log(chalk.yellow('可用命令（npm/yarn scripts）：'));
  console.log(chalk.white('  npm run check          执行代码检查'));
  console.log(chalk.white('  npm run init           初始化 Git Hook'));
  console.log(chalk.white('  npm run set-api-key    设置 AI API 配置（交互式）'));
  console.log(chalk.white('  npm run get-api-key    查看当前配置的 API 信息'));
  console.log(chalk.white('  npm run diagnose       诊断工具'));
  console.log(chalk.yellow('\n或使用 node 直接运行：'));
  console.log(chalk.white('  node bin/pre-commit-check.js'));
  console.log(chalk.white('  node bin/set-api-key.js [apiKey] [url] [model]'));
  console.log(chalk.white('  node bin/get-api-key.js'));
  console.log(chalk.yellow('\n环境变量配置（优先级高于配置文件）：'));
  console.log(chalk.white('  AI_API_KEY     API Key'));
  console.log(chalk.white('  AI_API_URL     API 接口地址'));
  console.log(chalk.white('  AI_MODEL       模型名称'));
  console.log(chalk.yellow('\n配置文件（commit-check.config.js global 字段）：'));
  console.log(chalk.white('  url             API 接口地址'));
  console.log(chalk.white('  model           模型名称'));
  console.log(chalk.white('  apiKey          API Key'));
  console.log(chalk.yellow('\n示例：'));
  console.log(chalk.gray('  # 设置API配置'));
  console.log(chalk.gray('  npm run set-api-key'));
  console.log(chalk.gray('  # 或 node bin/set-api-key.js your_api_key https://api.example.com/v1 your-model'));
  console.log(chalk.gray('  # 查看API配置'));
  console.log(chalk.gray('  npm run get-api-key'));
  console.log(chalk.gray('  # 执行检查'));
  console.log(chalk.gray('  npm run check\n'));
  process.exit(0);
}

if (args.includes('--init') || args.includes('init')) {
  // 执行初始化
  const installScriptPath = path.join(__dirname, 'install.js');
  if (fs.existsSync(installScriptPath)) {
    require(installScriptPath);
    process.exit(0);
  } else {
    console.error('❌ 无法找到安装脚本');
    process.exit(1);
  }
} else if (args.includes('--set-api-key') || args.includes('set-api-key')) {
  // 设置API配置
  const setApiKeyPath = path.join(__dirname, 'set-api-key.js');
  if (fs.existsSync(setApiKeyPath)) {
    require(setApiKeyPath);
  } else {
    console.error('❌ 无法找到设置API配置脚本');
    process.exit(1);
  }
} else if (args.includes('--get-api-key') || args.includes('get-api-key')) {
  // 查看API配置
  const getApiKeyPath = path.join(__dirname, 'get-api-key.js');
  if (fs.existsSync(getApiKeyPath)) {
    require(getApiKeyPath);
  } else {
    console.error('❌ 无法找到查看API配置脚本');
    process.exit(1);
  }
} else {
  // 执行检查
  const { runChecks } = require('../commit-check-core.js');
  runChecks()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(`❌ 执行检查时发生错误: ${error.message}`);
      process.exit(1);
    });
}
