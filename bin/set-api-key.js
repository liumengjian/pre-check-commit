#!/usr/bin/env node

/**
 * 设置智普AI API Key
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
 * 更新配置文件中的API Key
 */
function updateConfigApiKey(configPath, apiKey) {
  const content = readConfig(configPath);
  const escapedApiKey = apiKey.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  
  let newContent = content;
  
  // 1. 先移除注释掉的 apiKey 行（如果存在）
  newContent = newContent.replace(
    /\s*\/\/\s*apiKey\s*:\s*['"`][^'"`]+['"`]/g,
    ''
  );
  
  // 2. 检查是否已经有未注释的 apiKey 配置
  const hasApiKey = /apiKey\s*:\s*['"`][^'"`]+['"`]/.test(newContent);
  
  if (hasApiKey) {
    // 替换现有的 apiKey（支持单引号、双引号、反引号）
    newContent = newContent.replace(
      /apiKey\s*:\s*['"`][^'"`]+['"`]/,
      `apiKey: '${escapedApiKey}'`
    );
  } else {
    // 在 global 对象中添加 apiKey
    // 查找 global: { 的位置，考虑可能的注释
    const globalMatch = newContent.match(/(global\s*:\s*\{)/);
    if (globalMatch) {
      const insertPos = globalMatch.index + globalMatch[0].length;
      
      // 查找第一个配置项的位置（用于确定缩进）
      const afterGlobal = newContent.substring(insertPos);
      const firstLineMatch = afterGlobal.match(/^\s*\n(\s+)/);
      const indent = firstLineMatch ? firstLineMatch[1] : '    ';
      
      // 检查是否已经有其他配置项
      const hasOtherConfig = /^\s*[a-zA-Z]/.test(afterGlobal.trim());
      
      if (hasOtherConfig) {
        // 在其他配置项之前插入
        newContent = 
          newContent.substring(0, insertPos) +
          `\n${indent}apiKey: '${escapedApiKey}',` +
          newContent.substring(insertPos);
      } else {
        // 作为第一个配置项
        newContent = 
          newContent.substring(0, insertPos) +
          `\n${indent}apiKey: '${escapedApiKey}',` +
          newContent.substring(insertPos);
      }
    } else {
      throw new Error('无法找到 global 配置对象');
    }
  }
  
  return newContent;
}

/**
 * 交互式输入API Key
 */
function promptApiKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(chalk.blue('请输入智普AI API Key: '), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 验证API Key格式（简单验证）
 */
function validateApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, message: 'API Key不能为空' };
  }
  
  if (apiKey.length < 10) {
    return { valid: false, message: 'API Key格式不正确（长度过短）' };
  }
  
  return { valid: true };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  let apiKey = args[0];

  // 如果没有提供参数，交互式输入
  if (!apiKey) {
    apiKey = await promptApiKey();
  }

  // 验证API Key
  const validation = validateApiKey(apiKey);
  if (!validation.valid) {
    console.error(chalk.red(`❌ ${validation.message}`));
    process.exit(1);
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

    // 更新配置
    const newContent = updateConfigApiKey(configPath, apiKey);
    fs.writeFileSync(configPath, newContent, 'utf-8');

    console.log(chalk.green('✓ API Key 已成功设置'));
    console.log(chalk.blue(`📝 配置文件: ${configPath}`));
    console.log(chalk.yellow('\n💡 提示：'));
    console.log(chalk.yellow('   - API Key已保存到配置文件中'));
    console.log(chalk.yellow('   - 环境变量 ZHIPUAI_API_KEY 的优先级更高'));
    console.log(chalk.yellow('   - Windows PowerShell: $env:ZHIPUAI_API_KEY="your_key"'));
    console.log(chalk.yellow('   - Linux/Mac: export ZHIPUAI_API_KEY=your_key'));
    
    // 显示当前设置的API Key（部分隐藏）
    const maskedKey = apiKey.length > 8 
      ? apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4)
      : '***';
    console.log(chalk.gray(`\n当前设置的API Key: ${maskedKey}`));
    
    process.exit(0);
  } catch (error) {
    console.error(chalk.red(`❌ 设置API Key失败: ${error.message}`));
    
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

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`❌ 发生错误: ${error.message}`));
    process.exit(1);
  });
}

module.exports = { updateConfigApiKey, findConfigPath };

