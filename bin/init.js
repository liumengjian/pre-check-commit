#!/usr/bin/env node

/**
 * 初始化脚本
 * 
 * 用于在全局安装后，在项目中初始化配置
 * 用法: pre-commit-check --init 或 pre-commit-check-init
 */

const path = require('path');
const fs = require('fs');

// 尝试加载安装脚本
const installScriptPath = path.join(__dirname, 'install.js');
if (fs.existsSync(installScriptPath)) {
  require(installScriptPath);
} else {
  console.error('无法找到安装脚本');
  process.exit(1);
}

