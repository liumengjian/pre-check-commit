#!/usr/bin/env node

/**
 * 安装脚本
 * 
 * 在 npm install 后自动执行，用于：
 * 1. 安装 husky
 * 2. 配置 pre-commit hook
 * 3. 复制配置文件到项目根目录（如果不存在）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

const PROJECT_ROOT = process.cwd();
// 获取包根目录：优先从 node_modules 中查找，否则使用当前目录
let PACKAGE_ROOT = __dirname.replace(/[\\/]bin$/, '');
// 如果当前不在 node_modules 中，尝试查找 node_modules/prina-pre-commit-check
if (!PACKAGE_ROOT.includes('node_modules')) {
  const possiblePath = path.join(PROJECT_ROOT, 'node_modules', 'prina-pre-commit-check');
  if (fs.existsSync(possiblePath)) {
    PACKAGE_ROOT = possiblePath;
  }
}

/**
 * 检查是否是 Git 仓库
 */
function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: PROJECT_ROOT });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 安装 husky
 */
function installHusky() {
  try {
    console.log(chalk.blue('📦 正在安装 husky...'));
    execSync('npx husky install', { stdio: 'inherit', cwd: PROJECT_ROOT });
    console.log(chalk.green('✓ Husky 安装成功'));
  } catch (e) {
    console.warn(chalk.yellow('⚠️  Husky 安装失败，请手动执行: npx husky install'));
  }
}

/**
 * 创建 pre-commit hook
 */
function createPreCommitHook() {
  const huskyDir = path.join(PROJECT_ROOT, '.husky');
  const preCommitHook = path.join(huskyDir, 'pre-commit');

  // 确保 .husky 目录存在
  if (!fs.existsSync(huskyDir)) {
    fs.mkdirSync(huskyDir, { recursive: true });
  }

  // 检查是否已存在 pre-commit hook
  let hookContent = '';
  if (fs.existsSync(preCommitHook)) {
    hookContent = fs.readFileSync(preCommitHook, 'utf-8');
  }

  // 检查是否已经包含我们的检查命令
  const checkCommand = 'npx pre-commit-check';
  if (hookContent.includes(checkCommand)) {
    console.log(chalk.green('✓ Pre-commit hook 已配置'));
    return;
  }

  // 添加检查命令
  const newHookContent = hookContent
    ? `${hookContent}\n${checkCommand}`
    : `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n${checkCommand}\n`;

  fs.writeFileSync(preCommitHook, newHookContent);
  
  // 设置执行权限（Unix 系统）
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(preCommitHook, '755');
    } catch (e) {
      // 忽略权限设置错误
    }
  }

  console.log(chalk.green('✓ Pre-commit hook 配置成功'));
}

/**
 * 复制配置文件（如果不存在）
 */
function copyConfigFile() {
  const configPath = path.join(PROJECT_ROOT, 'commit-check.config.js');
  const defaultConfigPath = path.join(PACKAGE_ROOT, 'commit-check.config.js');

  if (!fs.existsSync(configPath) && fs.existsSync(defaultConfigPath)) {
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log(chalk.green('✓ 已创建默认配置文件 commit-check.config.js'));
    console.log(chalk.yellow('💡 请根据项目需求修改配置文件'));
  } else if (fs.existsSync(configPath)) {
    console.log(chalk.blue('ℹ  配置文件已存在，跳过复制'));
  }
}

/**
 * 主安装流程
 */
function main() {
  console.log(chalk.blue('\n🚀 正在配置 pre-commit-check...\n'));

  // 检查是否是 Git 仓库
  if (!isGitRepo()) {
    console.warn(chalk.yellow('⚠️  当前目录不是 Git 仓库，跳过 Git hook 配置'));
    console.log(chalk.blue('💡 请先执行 git init 初始化仓库'));
    return;
  }

  // 安装 husky
  installHusky();

  // 创建 pre-commit hook
  createPreCommitHook();

  // 复制配置文件
  copyConfigFile();

  console.log(chalk.green('\n✅ Pre-commit-check 配置完成！\n'));
  console.log(chalk.blue('📝 下一步：'));
  console.log(chalk.white('   1. 根据需要修改 commit-check.config.js 配置文件'));
  console.log(chalk.white('   2. 执行 git commit 时会自动触发代码检查\n'));
}

// 执行安装
main();

