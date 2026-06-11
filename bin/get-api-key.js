#!/usr/bin/env node

/**
 * 查看当前配置的 AI API 配置
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
 * 从配置文件中读取指定字段的值
 */
function getConfigValue(configPath, fieldName) {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(new RegExp(fieldName + '\\s*:\\s*[\'"`]([^\'"`]+)[\'"`]'));
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
  console.log(chalk.blue('🔍 检查 AI API 配置...\n'));

  // 1. 检查环境变量
  const envApiKey = process.env.AI_API_KEY || process.env.ZHIPUAI_API_KEY;
  const envUrl = process.env.AI_API_URL;
  const envModel = process.env.AI_MODEL;

  let hasEnvConfig = false;

  if (envApiKey) {
    hasEnvConfig = true;
    const maskedKey = envApiKey.length > 8
      ? envApiKey.substring(0, 4) + '...' + envApiKey.substring(envApiKey.length - 4)
      : '***';
    console.log(chalk.green('✓ 环境变量 AI_API_KEY 已设置'));
    console.log(chalk.gray(`  值: ${maskedKey}`));
  }

  if (envUrl) {
    hasEnvConfig = true;
    console.log(chalk.green('✓ 环境变量 AI_API_URL 已设置'));
    console.log(chalk.gray(`  值: ${envUrl}`));
  }

  if (envModel) {
    hasEnvConfig = true;
    console.log(chalk.green('✓ 环境变量 AI_MODEL 已设置'));
    console.log(chalk.gray(`  值: ${envModel}`));
  }

  if (hasEnvConfig) {
    console.log(chalk.yellow('\n💡 提示：环境变量的优先级高于配置文件'));
  }

  // 2. 检查配置文件
  const configPath = findConfigPath();
  if (!configPath) {
    if (!hasEnvConfig) {
      console.error(chalk.red('❌ 无法找到配置文件 commit-check.config.js'));
      console.error(chalk.yellow('💡 请确保在项目根目录执行此命令'));
      process.exit(1);
    }
    return;
  }

  console.log(chalk.blue(`\n📝 配置文件: ${configPath}`));

  const configApiKey = getConfigValue(configPath, 'apiKey');
  const configUrl = getConfigValue(configPath, 'url');
  const configModel = getConfigValue(configPath, 'model');

  if (configUrl) {
    console.log(chalk.green('✓ 配置文件中的 API URL:'));
    console.log(chalk.gray(`  ${configUrl}`));
  } else {
    console.log(chalk.gray('  API URL: 未配置（将使用默认值）'));
  }

  if (configModel) {
    console.log(chalk.green('✓ 配置文件中的模型名称:'));
    console.log(chalk.gray(`  ${configModel}`));
  } else {
    console.log(chalk.gray('  模型名称: 未配置（将使用默认值）'));
  }

  if (configApiKey) {
    const maskedKey = configApiKey.length > 8
      ? configApiKey.substring(0, 4) + '...' + configApiKey.substring(configApiKey.length - 4)
      : '***';
    console.log(chalk.green('✓ 配置文件中的 API Key:'));
    console.log(chalk.gray(`  ${maskedKey}`));
  } else {
    console.log(chalk.yellow('⚠️  配置文件中未找到 API Key'));
  }

  if (!hasEnvConfig && !configApiKey) {
    console.log(chalk.yellow('\n💡 提示：'));
    console.log(chalk.yellow('   Windows PowerShell:'));
    console.log(chalk.yellow('     $env:AI_API_KEY="your_key"'));
    console.log(chalk.yellow('   或 npm run set-api-key'));
    console.log(chalk.yellow('   Linux/Mac:'));
    console.log(chalk.yellow('     export AI_API_KEY=your_key'));
    console.log(chalk.yellow('   或 npm run set-api-key'));
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { findConfigPath, getConfigValue };
