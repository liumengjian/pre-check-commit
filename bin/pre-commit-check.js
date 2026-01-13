#!/usr/bin/env node

/**
 * Pre-commit Check CLI 入口文件
 * 
 * 此文件作为 npm 包的 bin 入口，可以直接执行检查逻辑
 */

const path = require('path');
const fs = require('fs');

// 检查是否是初始化命令
const args = process.argv.slice(2);
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
} else {
  // 执行检查
  const { runChecks } = require('../commit-check-core.js');
  const success = runChecks();
  process.exit(success ? 0 : 1);
}

