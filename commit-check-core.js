/**
 * Git Pre-Commit 核心检查逻辑
 * 
 * 使用智普AI API实现5项核心检查规则：
 * 1. 新增按钮接口调用防重复提交检查
 * 2. 新增列表/详情页首次进入 loading 检查
 * 3. 接口操作成功后轻提示检查
 * 4. 非 Table 组件列表空状态自定义检查
 * 5. 表单输入项默认提示检查
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { validateWithAI } = require('./ai-validator');

// 加载配置
let config;

// 尝试从多个位置加载配置文件
const configPaths = [
  path.join(process.cwd(), 'commit-check.config.js'), // 项目根目录
  path.join(__dirname, 'commit-check.config.js'), // 包目录
  path.resolve(__dirname, '../commit-check.config.js') // 包目录（相对路径）
];

let configLoaded = false;
for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    try {
      config = require(configPath);
      configLoaded = true;
      break;
    } catch (e) {
      // 继续尝试下一个路径
    }
  }
}

if (!configLoaded) {
  console.error(chalk.red('❌ 无法加载配置文件 commit-check.config.js'));
  console.error(chalk.yellow('💡 请确保项目根目录存在 commit-check.config.js 配置文件'));
  console.error(chalk.yellow('   或在项目根目录执行: cp node_modules/pre-commit-check/commit-check.config.js .'));
  process.exit(1);
}

/**
 * 获取智普AI API Key
 * 优先级：环境变量 > 配置文件
 */
function getApiKey() {
  // 1. 从环境变量获取
  if (process.env.ZHIPUAI_API_KEY) {
    return process.env.ZHIPUAI_API_KEY;
  }
  
  // 2. 从配置文件获取
  if (config.global && config.global.apiKey) {
    return config.global.apiKey;
  }
  
  return null;
}

/**
 * 获取 Git 暂存区文件变更
 */
function getStagedFiles() {
  try {
    const result = execSync('git diff --cached --name-only --diff-filter=AM', { encoding: 'utf-8' });
    return result.split('\n').filter(Boolean);
  } catch (e) {
    console.error(chalk.red('❌ 无法获取 Git 暂存区文件'));
    return [];
  }
}

/**
 * 获取文件的新增/修改内容（diff）
 */
function getFileDiff(filePath) {
  try {
    const result = execSync(`git diff --cached "${filePath}"`, { encoding: 'utf-8' });
    return result;
  } catch (e) {
    return '';
  }
}

/**
 * 读取文件内容
 */
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
    console.warn(chalk.yellow(`⚠️  无法读取文件 ${filePath}: ${e.message}`));
    return null;
  }
}

/**
 * 检查文件是否应该被忽略
 */
function shouldIgnoreFile(filePath, ignorePatterns) {
  for (const pattern of ignorePatterns) {
    // 简单的模式匹配
    const normalizedPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    const regex = new RegExp(normalizedPattern);
    if (regex.test(filePath) || filePath.includes(pattern.replace('/**', ''))) {
          return true;
        }
      }
  return false;
}

/**
 * 主检查函数
 */
async function runChecks() {
  // 检查API Key
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(chalk.red('❌ 智普AI API Key未配置'));
    console.error(chalk.yellow('💡 请设置环境变量 ZHIPUAI_API_KEY 或在配置文件中设置 global.apiKey'));
    console.error(chalk.yellow('   例如：export ZHIPUAI_API_KEY=your_api_key'));
    process.exit(1);
  }

  const stagedFiles = getStagedFiles();
  const allErrors = [];

  // 过滤需要检查的文件
  const fileExtensions = config.global?.fileExtensions || ['.html', '.js', '.ts', '.vue', '.jsx', '.tsx'];
  const ignorePatterns = config.global?.ignore || ['node_modules/**', 'dist/**', 'build/**', '*.min.js'];

  const filesToCheck = stagedFiles.filter(file => {
    const ext = path.extname(file);
    if (!fileExtensions.includes(ext)) {
      return false;
    }

    // 检查忽略模式
    if (shouldIgnoreFile(file, ignorePatterns)) {
        return false;
    }

    return true;
  });

  if (filesToCheck.length === 0) {
    console.log(chalk.green('✓ 暂存区没有需要检查的文件'));
    return true;
  }

  console.log(chalk.blue(`\n🔍 开始使用智普AI检查 ${filesToCheck.length} 个文件...\n`));

  // 逐个文件检查
  for (let i = 0; i < filesToCheck.length; i++) {
    const file = filesToCheck[i];
    
    if (!fs.existsSync(file)) {
      console.warn(chalk.yellow(`⚠️  文件不存在: ${file}`));
      continue;
    }

    try {
      console.log(chalk.gray(`[${i + 1}/${filesToCheck.length}] 检查文件: ${file}`));
      
      const fileContent = readFileContent(file);
      if (!fileContent) {
        continue;
      }

      const diff = getFileDiff(file);

      // 使用AI进行校验
      try {
        const errors = await validateWithAI(apiKey, file, fileContent, diff, config);
        
        if (errors && errors.length > 0) {
          allErrors.push(...errors);
          console.log(chalk.red(`  ❌ 发现 ${errors.length} 个问题`));
        } else {
          console.log(chalk.green(`  ✓ 通过`));
        }
      } catch (aiError) {
        // 格式化错误信息
        const errorMsg = aiError.message || String(aiError);
        console.error(chalk.red(`  ❌ AI校验失败: ${errorMsg}`));
        
        // 如果AI校验失败，可以选择：
        // 1. 阻止提交（更严格）
        // 2. 继续检查其他文件（更宽松）
        // 这里选择继续检查其他文件，但记录错误
        allErrors.push({
          rule: 0,
          file: file,
          line: 0,
          message: `AI校验失败: ${errorMsg}`,
          suggestion: '请检查网络连接和API Key配置，或查看详细错误信息'
        });
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  检查文件 ${file} 时出错: ${error.message}`));
    }
  }

  // 输出错误信息
  if (allErrors.length > 0) {
    console.log(chalk.red('\n❌ 代码检查未通过，发现以下问题：\n'));

    allErrors.forEach((error, index) => {
      if (error.rule === 0) {
        console.log(chalk.red(`【校验错误】`));
      } else {
      console.log(chalk.red(`【规则 ${error.rule} 不通过】- ${getRuleName(error.rule)}`));
      }
      console.log(chalk.white(`文件：${error.file}`));
      if (error.line > 0) {
      console.log(chalk.white(`行号：${error.line}`));
      }
      console.log(chalk.yellow(`问题：${error.message}`));
      if (error.suggestion) {
      console.log(chalk.cyan(`修复建议：${error.suggestion}`));
      }
      if (index < allErrors.length - 1) {
        console.log('');
      }
    });

    console.log(chalk.red('\n请修复上述问题后重新提交。'));
    console.log(chalk.gray('提示：如需跳过检查（紧急情况），可使用 git commit --no-verify\n'));
    return false;
  }

  console.log(chalk.green('\n✓ 所有检查通过！\n'));
  return true;
}

/**
 * 获取规则名称
 */
function getRuleName(ruleNum) {
  const names = {
    1: '防重复提交缺失',
    2: '首次进入页面缺失 loading 状态',
    3: '接口操作成功后缺失轻提示',
    4: '非 Table 列表缺失自定义空状态',
    5: '表单输入项缺失 placeholder 提示'
  };
  return names[ruleNum] || '未知规则';
}

// 如果直接运行此文件，执行检查
if (require.main === module) {
  runChecks()
    .then(success => {
  process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red(`\n❌ 执行检查时发生错误: ${error.message}`));
      process.exit(1);
    });
}

module.exports = { runChecks };
