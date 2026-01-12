#!/usr/bin/env node

/**
 * 测试运行器
 * 
 * 简单的测试脚本，用于验证核心功能是否正常
 */

const { runChecks } = require('../commit-check-core.js');
const chalk = require('chalk');

console.log(chalk.blue('🧪 运行测试...\n'));

// 由于测试需要 Git 暂存区，这里只做基本的功能测试
// 实际测试应该通过 git commit 触发

try {
  // 测试配置文件加载
  const config = require('../commit-check.config.js');
  
  if (!config || !config.rule1) {
    console.error(chalk.red('❌ 配置文件加载失败'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ 配置文件加载成功'));
  console.log(chalk.green('✓ 核心模块加载成功'));
  console.log(chalk.blue('\n💡 提示：完整测试需要通过 git commit 触发\n'));
  
  console.log(chalk.green('✅ 基本测试通过\n'));
  process.exit(0);
} catch (error) {
  console.error(chalk.red('❌ 测试失败:'), error.message);
  process.exit(1);
}

