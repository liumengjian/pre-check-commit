#!/usr/bin/env node

/**
 * 诊断脚本
 * 用于检查 pre-commit-check 是否正确配置
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

const PROJECT_ROOT = process.cwd();

console.log(chalk.blue('\n🔍 正在诊断 pre-commit-check 配置...\n'));

let hasError = false;

// 1. 检查是否是 Git 仓库
console.log(chalk.blue('1. 检查 Git 仓库...'));
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: PROJECT_ROOT });
  console.log(chalk.green('   ✓ 是 Git 仓库'));
} catch (e) {
  console.log(chalk.red('   ✗ 不是 Git 仓库'));
  console.log(chalk.yellow('   💡 请先执行: git init'));
  hasError = true;
}

// 2. 检查 husky 是否安装
console.log(chalk.blue('\n2. 检查 husky...'));
const huskyDir = path.join(PROJECT_ROOT, '.husky');
if (fs.existsSync(huskyDir)) {
  console.log(chalk.green('   ✓ .husky 目录存在'));
} else {
  console.log(chalk.red('   ✗ .husky 目录不存在'));
  console.log(chalk.yellow('   💡 请执行: npx husky install'));
  hasError = true;
}

// 3. 检查 pre-commit hook 是否存在
console.log(chalk.blue('\n3. 检查 pre-commit hook...'));
const preCommitHook = path.join(huskyDir, 'pre-commit');
if (fs.existsSync(preCommitHook)) {
  console.log(chalk.green('   ✓ pre-commit hook 文件存在'));
  const hookContent = fs.readFileSync(preCommitHook, 'utf-8');
  if (hookContent.includes('pre-commit-check')) {
    console.log(chalk.green('   ✓ hook 中包含 pre-commit-check 命令'));
  } else {
    console.log(chalk.red('   ✗ hook 中不包含 pre-commit-check 命令'));
    console.log(chalk.yellow('   💡 请执行: npm run prepare'));
    hasError = true;
  }
} else {
  console.log(chalk.red('   ✗ pre-commit hook 文件不存在'));
  console.log(chalk.yellow('   💡 请执行: npm run prepare'));
  hasError = true;
}

// 4. 检查配置文件
console.log(chalk.blue('\n4. 检查配置文件...'));
const configPath = path.join(PROJECT_ROOT, 'commit-check.config.js');
if (fs.existsSync(configPath)) {
  console.log(chalk.green('   ✓ commit-check.config.js 存在'));
} else {
  console.log(chalk.yellow('   ⚠  commit-check.config.js 不存在'));
  console.log(chalk.yellow('   💡 将使用默认配置，或执行: npm run prepare'));
}

// 5. 检查包是否安装
console.log(chalk.blue('\n5. 检查包安装...'));
const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  if (allDeps['prina-pre-commit-check']) {
    console.log(chalk.green(`   ✓ prina-pre-commit-check 已安装 (${allDeps['prina-pre-commit-check']})`));
  } else {
    console.log(chalk.red('   ✗ prina-pre-commit-check 未安装'));
    console.log(chalk.yellow('   💡 请执行: npm install prina-pre-commit-check --save-dev'));
    hasError = true;
  }
  
  if (allDeps['husky']) {
    console.log(chalk.green(`   ✓ husky 已安装 (${allDeps['husky']})`));
  } else {
    console.log(chalk.yellow('   ⚠  husky 未在 package.json 中，但可能已全局安装'));
  }
} else {
  console.log(chalk.red('   ✗ package.json 不存在'));
  hasError = true;
}

// 6. 测试命令是否可用
console.log(chalk.blue('\n6. 测试命令可用性...'));
try {
  execSync('npx pre-commit-check --version 2>&1', { stdio: 'pipe', cwd: PROJECT_ROOT });
  console.log(chalk.green('   ✓ pre-commit-check 命令可用'));
} catch (e) {
  try {
    const output = e.output.toString();
    if (output.includes('pre-commit-check')) {
      console.log(chalk.green('   ✓ pre-commit-check 命令可用'));
    } else {
      throw e;
    }
  } catch (e2) {
    console.log(chalk.yellow('   ⚠  无法测试命令，但可能正常'));
  }
}

// 总结
console.log(chalk.blue('\n' + '='.repeat(50)));
if (hasError) {
  console.log(chalk.red('\n❌ 发现问题，请根据上述提示修复'));
  console.log(chalk.yellow('\n💡 快速修复命令：'));
  console.log(chalk.white('   npm run prepare'));
  console.log(chalk.white('   或'));
  console.log(chalk.white('   npx husky install'));
  console.log(chalk.white('   node node_modules/prina-pre-commit-check/bin/install.js'));
} else {
  console.log(chalk.green('\n✅ 配置正常！'));
  console.log(chalk.blue('\n💡 如果 commit 时仍未触发检查，请尝试：'));
  console.log(chalk.white('   1. 确保文件已添加到暂存区: git add .'));
  console.log(chalk.white('   2. 查看 .husky/pre-commit 文件内容'));
  console.log(chalk.white('   3. 手动执行: npx pre-commit-check'));
}
console.log('');

