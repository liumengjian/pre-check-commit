#!/usr/bin/env node

/**
 * 查看当前配置的智普AI API Key
 * 
 * 用法：
 *   pre-commit-check-get-api-key
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * 查找配置文件路径
 */
function findConfigPath() {
  const configPaths = [
    path.join(process.cwd(), 'commit-check.config.js'), // 项目根目录
    path.join(__dirname, '..', 'commit-check.config.js'), // 包目录
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * 从配置文件中读取API Key
 */
function getApiKeyFromConfig(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/apiKey\s*:\s*['"`]([^'"`]+)['"`]/);
    if (match) {
      return match[1];
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 主函数
 */
function main() {
  console.log(chalk.blue('🔍 检查API Key配置...\n'));

  // 1. 检查环境变量
  const envApiKey = process.env.ZHIPUAI_API_KEY;
  if (envApiKey) {
    const maskedKey = envApiKey.length > 8 
      ? envApiKey.substring(0, 4) + '...' + envApiKey.substring(envApiKey.length - 4)
      : '***';
    console.log(chalk.green('✓ 环境变量 ZHIPUAI_API_KEY 已设置'));
    console.log(chalk.gray(`  值: ${maskedKey}`));
    console.log(chalk.yellow('\n💡 提示：环境变量的优先级高于配置文件'));
    return;
  }

  // 2. 检查配置文件
  const configPath = findConfigPath();
  if (!configPath) {
    console.error(chalk.red('❌ 无法找到配置文件 commit-check.config.js'));
    console.error(chalk.yellow('💡 请确保在项目根目录执行此命令'));
    process.exit(1);
  }

  const configApiKey = getApiKeyFromConfig(configPath);
  if (configApiKey) {
    const maskedKey = configApiKey.length > 8 
      ? configApiKey.substring(0, 4) + '...' + configApiKey.substring(configApiKey.length - 4)
      : '***';
    console.log(chalk.green('✓ 配置文件中的 API Key 已设置'));
    console.log(chalk.gray(`  配置文件: ${configPath}`));
    console.log(chalk.gray(`  值: ${maskedKey}`));
  } else {
    console.log(chalk.yellow('⚠️  未找到API Key配置'));
    console.log(chalk.gray(`  配置文件: ${configPath}`));
    console.log(chalk.yellow('\n💡 提示：'));
    console.log(chalk.yellow('   Windows PowerShell:'));
    console.log(chalk.yellow('     $env:ZHIPUAI_API_KEY="your_key"'));
    console.log(chalk.yellow('   或 npm run set-api-key'));
    console.log(chalk.yellow('   Linux/Mac:'));
    console.log(chalk.yellow('     export ZHIPUAI_API_KEY=your_key'));
    console.log(chalk.yellow('   或 npm run set-api-key'));
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { getApiKeyFromConfig, findConfigPath };

