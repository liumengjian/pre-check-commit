#!/usr/bin/env node

/**
 * 设置 AI API 配置（API Key、URL、模型名称）
 *
 * 用法：
 *   pre-commit-check-set-api-key <apiKey>
 *   或
 *   pre-commit-check-set-api-key
 *   (交互式输入)
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');

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
 * 读取配置文件内容
 */
function readConfig(configPath) {
  try {
    return fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    throw new Error(`无法读取配置文件: ${error.message}`);
  }
}

/**
 * 更新配置文件中的字符串字段
 */
function updateConfigField(configPath, fieldName, value) {
  const content = readConfig(configPath);
  const escapedValue = value.replace(/'/g, "\\'").replace(/\\/g, '\\\\');

  let newContent = content;

  // 1. 先移除注释掉的对应行（如果存在）
  newContent = newContent.replace(
    new RegExp(`\\s*\\/\\/\\s*${fieldName}\\s*:\\s*['"\`][^'"\`]+['"\`]`, 'g'),
    ''
  );

  // 2. 检查是否已经有未注释的配置
  const hasField = new RegExp(`${fieldName}\\s*:\\s*['"\`][^'"\`]+['"\`]`).test(newContent);

  if (hasField) {
    // 替换现有的值（支持单引号、双引号、反引号）
    newContent = newContent.replace(
      new RegExp(`${fieldName}\\s*:\\s*['"\`][^'"\`]+['"\`]`),
      `${fieldName}: '${escapedValue}'`
    );
  } else {
    // 在 global 对象中添加
    const globalMatch = newContent.match(/(global\s*:\s*\{)/);
    if (globalMatch) {
      const insertPos = globalMatch.index + globalMatch[0].length;

      // 查找第一个配置项的位置（用于确定缩进）
      const afterGlobal = newContent.substring(insertPos);
      const firstLineMatch = afterGlobal.match(/^\s*\n(\s+)/);
      const indent = firstLineMatch ? firstLineMatch[1] : '    ';

      newContent =
        newContent.substring(0, insertPos) +
        `\n${indent}${fieldName}: '${escapedValue}',` +
        newContent.substring(insertPos);
    } else {
      throw new Error('无法找到 global 配置对象');
    }
  }

  return newContent;
}

/**
 * 更新配置文件中的 API Key（保持向后兼容）
 */
function updateConfigApiKey(configPath, apiKey) {
  return updateConfigField(configPath, 'apiKey', apiKey);
}

/**
 * 交互式输入
 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 验证输入（简单验证）
 */
function validateInput(value, fieldName) {
  if (!value || value.trim().length === 0) {
    return { valid: false, message: `${fieldName} 不能为空` };
  }
  return { valid: true };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  console.log(chalk.blue('🔧 配置 AI API 参数\n'));

  // 交互式输入
  let apiKey = args[0];
  let url = args[1];
  let model = args[2];

  if (!apiKey) {
    apiKey = await prompt(chalk.blue('请输入 AI API Key（留空跳过）: '));
  }

  if (!url) {
    const currentUrl = getCurrentConfigValue('url') || 'https://open.bigmodel.cn/api/paas/v4';
    url = await prompt(chalk.blue(`请输入 API URL（留空使用: ${currentUrl}）: `));
  }

  if (!model) {
    const currentModel = getCurrentConfigValue('model') || 'glm-4.7';
    model = await prompt(chalk.blue(`请输入模型名称（留空使用: ${currentModel}）: `));
  }

  // 查找配置文件
  const configPath = findConfigPath();
  if (!configPath) {
    console.error(chalk.red('❌ 无法找到配置文件 commit-check.config.js'));
    console.error(chalk.yellow('💡 请确保在项目根目录执行此命令'));
    process.exit(1);
  }

  try {
    // 备份原配置文件
    const backupPath = configPath + '.backup';
    fs.copyFileSync(configPath, backupPath);
    console.log(chalk.gray(`📋 已备份配置文件到: ${backupPath}`));

    let currentContent = readConfig(configPath);

    // 更新 API Key
    if (apiKey) {
      const validation = validateInput(apiKey, 'API Key');
      if (!validation.valid) {
        console.error(chalk.red(`❌ ${validation.message}`));
        process.exit(1);
      }
      currentContent = updateConfigField(configPath, 'apiKey', apiKey);
      // 将更新后的内容写入，以便后续更新可以基于最新内容
      fs.writeFileSync(configPath, currentContent, 'utf-8');
      console.log(chalk.green('✓ API Key 已更新'));
    }

    // 更新 URL
    if (url) {
      currentContent = updateConfigField(configPath, 'url', url);
      fs.writeFileSync(configPath, currentContent, 'utf-8');
      console.log(chalk.green('✓ API URL 已更新'));
    }

    // 更新模型
    if (model) {
      currentContent = updateConfigField(configPath, 'model', model);
      fs.writeFileSync(configPath, currentContent, 'utf-8');
      console.log(chalk.green('✓ 模型名称已更新'));
    }

    console.log(chalk.blue(`\n📝 配置文件: ${configPath}`));
    console.log(chalk.yellow('\n💡 提示：'));
    console.log(chalk.yellow('   - 配置已保存到配置文件中'));
    console.log(chalk.yellow('   - 环境变量的优先级更高'));
    console.log(chalk.yellow('   - AI_API_URL: 设置 API 接口地址'));
    console.log(chalk.yellow('   - AI_MODEL: 设置模型名称'));
    console.log(chalk.yellow('   - AI_API_KEY: 设置 API Key'));

    process.exit(0);
  } catch (error) {
    console.error(chalk.red(`❌ 设置失败: ${error.message}`));

    // 如果备份文件存在，尝试恢复
    const backupPath = configPath + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, configPath);
        console.log(chalk.yellow('已恢复配置文件'));
      } catch (restoreError) {
        console.error(chalk.red(`恢复配置文件失败: ${restoreError.message}`));
      }
    }

    process.exit(1);
  }
}

/**
 * 获取当前配置文件中某个字段的值（用于显示默认值）
 */
function getCurrentConfigValue(fieldName) {
  try {
    const configPath = findConfigPath();
    if (!configPath) return null;
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(new RegExp(fieldName + "\\s*:\\s*['\"]([^'\"]+)['\"]"));
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`❌ 发生错误: ${error.message}`));
    process.exit(1);
  });
}

module.exports = { updateConfigApiKey, updateConfigField, findConfigPath };
