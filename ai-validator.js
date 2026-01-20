/**
 * AI 代码校验模块
 * 使用智普AI API进行代码规则校验
 */

const ZhipuAIClient = require('./lib/zhipuai-client');

// 智普AI API配置
const DEFAULT_MODEL = 'glm-4.7';

/**
 * 调用智普AI API进行代码校验（批量检查多个文件）
 * @param {string} apiKey - 智普AI API Key
 * @param {Array<Object>} files - 文件数组，每个对象包含 {path, content, diff}
 * @param {Object} config - 配置文件对象
 * @returns {Promise<Array>} 返回错误数组
 */
async function validateWithAI(apiKey, files, config) {
  if (!apiKey) {
    throw new Error('智普AI API Key未配置，请设置环境变量 ZHIPUAI_API_KEY 或在配置文件中设置');
  }

  // 如果files是单个文件（向后兼容），转换为数组
  if (typeof files === 'string') {
    // 旧版本调用方式，保持兼容
    return await validateSingleFileWithAI(apiKey, files, arguments[2], arguments[3], config);
  }

  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  // 收集所有需要检查的文件（UI组件文件）
  const filesToCheck = [];
  for (const file of files) {
    const isUIFile = isUIComponentFile(file.path, file.content);
    if (isUIFile) {
      filesToCheck.push(file);
    }
  }

  if (filesToCheck.length === 0) {
    return [];
  }

  // 构建所有文件的prompt
  const allFilesPrompt = buildMultiFilesPrompt(filesToCheck, config);
  
  // 调用API
  try {
    const model = config.global?.model || DEFAULT_MODEL;
    const client = new ZhipuAIClient(apiKey, {
      model: model,
      timeout: 120000, // 增加超时时间，因为要检查多个文件
      maxRetries: 3
    });

    // 使用流式输出
    process.stdout.write('🤖 正在分析代码...\n\n');
    
    let streamBuffer = '';
    let hasStartedRuleCheck = false;
    let hasReachedJSON = false; // 是否到达JSON部分
    let totalOutputLength = 0;
    let savedCursorPos = false;
    const isTTY = process.stdout.isTTY;
    
    // 需要跳过的元信息模式
    const skipPatterns = [
      /^\s*\*\s*\*\*分析请求：\*\*/i,
      /^\s*\*\s*\*\*角色：\*\*/i,
      /^\s*\*\s*\*\*任务：\*\*/i,
      /^\s*分析请求/i,
      /^\s*角色：/i,
      /^\s*任务：/i
    ];
    
    // 需要跳过的"生成输出"相关模式
    const skipOutputPatterns = [
      /生成输出/i,
      /最终输出/i,
      /输出生成/i,
      /构建.*输出/i,
      /最终JSON/i,
      /生成JSON/i,
      /构建JSON/i,
      /最终结果/i,
      /格式化输出/i,
      /^\s*\d+\.\s*\*\*格式化输出/i,
      /构建JSON/i,
      /最终审查/i,
      /^\s*\d+\.\s*\*\*构建JSON/i,
      /^\s*\d+\.\s*\*\*最终审查/i
    ];
    
    // 从"对照规则评估"或"对照规则检查"开始显示
    const ruleEvaluationPattern = /对照规则评估|对照规则检查|对照规则|规则评估/i;
    
    // 需要跳过的代码片段模式（如"{loading}`（已注释）"等）
    const skipCodeSnippetPatterns = [
      /\{[^}]*\}\s*[（(]已注释/i,
      /\{[^}]*\}\s*[（(]已注释掉/i,
      /第\d+行：.*[（(]已注释/i
    ];

    const result = await client.sendChatMessageStream(
      buildSystemPrompt(config),
      allFilesPrompt,
      {
        temperature: 0,
        max_tokens: 8000 // 增加token限制，因为要处理多个文件
      },
      (chunk, type) => {
        if (chunk) {
          streamBuffer += chunk;
          
          // 检查是否包含需要跳过的代码片段
          const shouldSkipCodeSnippet = skipCodeSnippetPatterns.some(pattern => pattern.test(streamBuffer));
          if (shouldSkipCodeSnippet) {
            streamBuffer = '';
            return;
          }
          
          // 检查是否包含"生成输出"、"构建JSON"、"最终审查"、"格式化输出"等需要跳过的内容
          const shouldSkipOutput = skipOutputPatterns.some(pattern => pattern.test(streamBuffer));
          
          // 检测是否到达JSON部分（开始输出JSON时，清除之前的思考过程）
          // 只匹配行首的{，避免匹配代码中的{
          if (!hasReachedJSON && streamBuffer.match(/^\s*\{/)) {
            hasReachedJSON = true;
            // 清除之前显示的所有思考过程
            if (isTTY && savedCursorPos && totalOutputLength > 0) {
              // 计算需要清除的行数（粗略估算，每80字符一行）
              const linesToClear = Math.ceil(totalOutputLength / 80) + 5;
              for (let i = 0; i < linesToClear; i++) {
                process.stdout.write('\x1b[1A'); // 上移一行
                process.stdout.write('\x1b[2K'); // 清除整行
              }
              totalOutputLength = 0;
              savedCursorPos = false;
            }
            streamBuffer = '';
            return;
          }
          
          // 如果已经到达JSON部分，不输出任何内容（JSON会被解析后格式化显示）
          if (hasReachedJSON) {
            streamBuffer = '';
            return;
          }
          
          // 还未到达JSON部分
          if (shouldSkipOutput) {
            // 如果检测到"生成输出"、"构建JSON"、"最终审查"、"格式化输出"等关键词，跳过这部分，等待JSON
            if (streamBuffer.match(/^\s*\{/)) {
              hasReachedJSON = true;
              // 清除之前的思考过程
              if (isTTY && savedCursorPos && totalOutputLength > 0) {
                const linesToClear = Math.ceil(totalOutputLength / 80) + 5;
                for (let i = 0; i < linesToClear; i++) {
                  process.stdout.write('\x1b[1A');
                  process.stdout.write('\x1b[2K');
                }
                totalOutputLength = 0;
                savedCursorPos = false;
              }
              streamBuffer = '';
              return;
            } else {
              // 还没到JSON，跳过这部分内容
              streamBuffer = '';
              return;
            }
          } else if (!hasStartedRuleCheck) {
            // 检测是否到达"对照规则评估"或"对照规则检查"部分
            if (ruleEvaluationPattern.test(streamBuffer)) {
              hasStartedRuleCheck = true;
              // 找到"对照规则评估"的位置
              const match = streamBuffer.match(ruleEvaluationPattern);
              if (match) {
                const startIndex = match.index;
                const ruleEvalContent = streamBuffer.substring(startIndex);
                if (ruleEvalContent) {
                  if (!savedCursorPos && isTTY) {
                    process.stdout.write('\x1b[s'); // 保存光标位置
                    savedCursorPos = true;
                  }
                  // 重新编号：将序号从3开始改为从1开始
                  let contentToShow = ruleEvalContent;
                  // 替换序号：将"3."改为"1."，"4."改为"2."等
                  contentToShow = contentToShow.replace(/^(\s*)(\d+)\./gm, (match, indent, num) => {
                    const numInt = parseInt(num);
                    if (numInt >= 3) {
                      const newNum = numInt - 2; // 3->1, 4->2, 5->3, 6->4
                      return `${indent}${newNum}.`;
                    }
                    return match;
                  });
                  process.stdout.write(contentToShow);
                  totalOutputLength += contentToShow.length;
                  streamBuffer = '';
                }
              }
            } else {
              const shouldSkip = skipPatterns.some(pattern => pattern.test(streamBuffer));
              if (shouldSkip) {
                streamBuffer = '';
                return;
              }
            }
          } else {
            // 已经开始了规则评估，正常显示思考过程，但需要重新编号和跳过不需要的部分
            // 检查是否到达"构建JSON"、"最终审查"、"格式化输出"等部分，如果到达则停止显示
            if (shouldSkipOutput) {
              streamBuffer = '';
              return;
            }
            
            if (!savedCursorPos && isTTY) {
              process.stdout.write('\x1b[s');
              savedCursorPos = true;
            }
            // 重新编号：将序号从3开始改为从1开始
            let contentToShow = chunk;
            // 替换序号：将"3."改为"1."，"4."改为"2."等
            contentToShow = contentToShow.replace(/^(\s*)(\d+)\./gm, (match, indent, num) => {
              const numInt = parseInt(num);
              if (numInt >= 3) {
                const newNum = numInt - 2; // 3->1, 4->2, 5->3, 6->4
                return `${indent}${newNum}.`;
              }
              return match;
            });
            process.stdout.write(contentToShow);
            totalOutputLength += contentToShow.length;
            streamBuffer = '';
          }
          
          if (isTTY && typeof process.stdout.flush === 'function') {
            process.stdout.flush();
          }
        }
      }
    );

    // 处理剩余的缓冲区内容
    if (hasReachedJSON && streamBuffer) {
      // 只输出JSON部分
      const jsonStartIndex = streamBuffer.indexOf('{');
      if (jsonStartIndex >= 0) {
        streamBuffer = streamBuffer.substring(jsonStartIndex);
        process.stdout.write(streamBuffer);
        totalOutputLength += streamBuffer.length;
      }
    } else if (hasStartedRuleCheck && !hasReachedJSON && streamBuffer) {
      // 检查是否包含"生成输出"
      const shouldSkipOutput = skipOutputPatterns.some(pattern => pattern.test(streamBuffer));
      if (!shouldSkipOutput && !streamBuffer.includes('{')) {
        process.stdout.write(streamBuffer);
        totalOutputLength += streamBuffer.length;
      }
    }

    // 思考完成后，清除之前显示的所有思考过程
    if (isTTY && totalOutputLength > 0 && savedCursorPos && hasReachedJSON) {
      // 清除JSON输出之前的所有思考过程
      const linesToClear = Math.ceil(totalOutputLength / 80) + 2;
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\x1b[1A'); // 上移一行
        process.stdout.write('\x1b[2K'); // 清除整行
      }
    } else if (!isTTY) {
      process.stdout.write('\n\n');
    }

    if (!result.success) {
      let errorMsg = result.error || 'API调用失败';
      if (result.statusCode) {
        errorMsg = `HTTP ${result.statusCode}: ${errorMsg}`;
      }
      if (result.errorCode) {
        errorMsg = `${errorMsg} (错误代码: ${result.errorCode})`;
      }
      throw new Error(errorMsg);
    }

    const responseContent = result.data?.choices?.[0]?.message?.content;
    if (!responseContent) {
      console.warn('API响应数据:', JSON.stringify(result.data, null, 2));
      throw new Error('API响应格式错误：未找到响应内容');
    }

    // 解析多文件响应
    const errors = parseMultiFilesResponse(responseContent, filesToCheck);
    
    // 显示格式化的检测结果
    displayCheckResults(filesToCheck, errors, config);
    
    return errors;
  } catch (error) {
    const errorMsg = error.message || String(error);
    console.error(`调用智普AI API失败: ${errorMsg}`);
    throw error;
  }
}

/**
 * 单个文件校验（向后兼容）
 */
async function validateSingleFileWithAI(apiKey, filePath, fileContent, diff, config) {
  return await validateWithAI(apiKey, [{ path: filePath, content: fileContent, diff: diff }], config);
}

/**
 * 构建系统Prompt
 */
function buildSystemPrompt(config) {
  return `你是前端代码审核专家，快速检查代码是否符合规范。

⚠️⚠️⚠️ 核心要求（非常重要）：
1. 快速检查！不要深度思考！快速扫描代码，立即判断！
2. 直接返回JSON结果，不要展示"生成输出"、"最终输出"等模块
3. 可以展示思考过程和分析步骤，但不要展示"生成输出"相关的内容
4. 只返回纯JSON格式的结果，格式：{"files": [{"file": "文件路径", "passed": true/false, "violations": [...]}]}
5. 快速检查！快速检查！快速检查！很重要！

重要原则：
1. 只检查实际违反规则的情况，不要误报
2. 如果代码中没有相关场景，返回passed: true
3. 行号必须准确，使用文件内容中标注的行号
4. 理解代码逻辑和语义，不要简单关键字匹配`;
}

/**
 * 构建多文件Prompt
 */
function buildMultiFilesPrompt(files, config) {
  const enabledRules = [];
  const rulesDescriptions = [];
  
  // 检查哪些规则启用
  if (config.rule1?.enabled) {
    enabledRules.push(1);
    rulesDescriptions.push(buildRule1Prompt(config.rule1));
  }
  if (config.rule2?.enabled) {
    enabledRules.push(2);
    rulesDescriptions.push(buildRule2Prompt(config.rule2));
  }
  if (config.rule3?.enabled) {
    enabledRules.push(3);
    rulesDescriptions.push(buildRule3Prompt(config.rule3));
  }
  if (config.rule4?.enabled) {
    enabledRules.push(4);
    rulesDescriptions.push(buildRule4Prompt(config.rule4));
  }
  if (config.rule5?.enabled) {
    enabledRules.push(5);
    rulesDescriptions.push(buildRule5Prompt(config.rule5));
  }

  let prompt = `请检查以下 ${files.length} 个代码文件是否符合规范：\n\n`;

  files.forEach((file, index) => {
    const fileExtension = file.path.split('.').pop();
    const isNewFile = !file.diff || !file.diff.includes('---');
    const lines = file.content.split('\n');
    const numberedContent = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
    
    prompt += `文件 ${index + 1}：${file.path}\n`;
    prompt += `文件扩展名：${fileExtension}\n`;
    prompt += `${isNewFile ? '文件状态：新增文件' : '文件状态：修改文件'}\n`;
    prompt += `文件内容（带行号）：\n\`\`\`\n${numberedContent}\n\`\`\`\n\n`;
  });

  prompt += `需要检查的规则：\n`;
  rulesDescriptions.forEach((desc) => {
    prompt += `\n${desc}\n`;
  });

  prompt += `\n⚠️ 请快速检查所有文件，直接返回JSON结果（不要展示思考过程，不要解释，只返回JSON）：

{
  "files": [
    {
      "file": "文件路径",
      "passed": true/false,
      "violations": [
        {
          "rule": 规则编号（1-5）,
          "line": 行号（使用文件内容中标注的行号）,
          "message": "错误描述",
          "suggestion": "修复建议"
        }
      ]
    }
  ]
}

如果所有文件的所有规则都通过，返回：{"files": [{"file": "文件路径", "passed": true, "violations": []}]}

⚠️ 重要：只返回JSON格式结果，不要包含任何其他文字说明！`;

  return prompt;
}

/**
 * 解析多文件响应
 */
function parseMultiFilesResponse(responseContent, files) {
  const allErrors = [];
  
  try {
    let jsonStr = responseContent.trim();
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');
    
    let jsonStart = jsonStr.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('未找到JSON对象开始标记');
    }

    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = jsonStart; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      throw new Error('未找到JSON对象结束标记');
    }

    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    
    // 修复JSON格式问题
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    
    const result = JSON.parse(jsonStr);
    
    // 处理多文件响应
    if (result.files && Array.isArray(result.files)) {
      result.files.forEach(fileResult => {
        const filePath = fileResult.file;
        if (fileResult.violations && Array.isArray(fileResult.violations)) {
          fileResult.violations.forEach(violation => {
            allErrors.push({
              rule: violation.rule || 0,
              file: filePath,
              line: violation.line || 0,
              message: violation.message || '',
              suggestion: violation.suggestion || '请检查代码'
            });
          });
        }
      });
    }
  } catch (error) {
    console.warn(`⚠️  解析AI响应失败: ${error.message}`);
    console.warn(`响应内容预览: ${responseContent.substring(0, 200)}...`);
  }

  return allErrors;
}

/**
 * 显示检查结果
 */
function displayCheckResults(files, errors, config) {
  // 按文件分组错误
  const errorsByFile = {};
  errors.forEach(error => {
    if (!errorsByFile[error.file]) {
      errorsByFile[error.file] = [];
    }
    errorsByFile[error.file].push(error);
  });

  // 获取启用的规则
  const enabledRules = [];
  if (config.rule1?.enabled) enabledRules.push(1);
  if (config.rule2?.enabled) enabledRules.push(2);
  if (config.rule3?.enabled) enabledRules.push(3);
  if (config.rule4?.enabled) enabledRules.push(4);
  if (config.rule5?.enabled) enabledRules.push(5);

  // 输出每个文件的检查结果
  files.forEach(file => {
    const fileErrors = errorsByFile[file.path] || [];
    const fileErrorsByRule = {};
    fileErrors.forEach(error => {
      const ruleNum = error.rule;
      if (!fileErrorsByRule[ruleNum]) {
        fileErrorsByRule[ruleNum] = [];
      }
      fileErrorsByRule[ruleNum].push(error);
    });

    enabledRules.forEach(ruleNum => {
      const ruleErrors = fileErrorsByRule[ruleNum] || [];
      if (ruleErrors.length === 0) {
        process.stdout.write(`规则【${ruleNum}】：检查通过\n`);
      } else {
        process.stdout.write(`规则【${ruleNum}】：不通过\n`);
        ruleErrors.forEach((error, index) => {
          if (error.line > 0) {
            process.stdout.write(`  行号：${error.line}\n`);
          }
          if (error.message) {
            process.stdout.write(`  原因：${error.message}\n`);
          }
          if (error.suggestion) {
            process.stdout.write(`  建议：${error.suggestion}\n`);
          }
          if (index < ruleErrors.length - 1) {
            process.stdout.write('\n');
          }
        });
      }
    });
  });
}

/**
 * 判断文件是否为UI组件文件
 * @param {string} filePath - 文件路径
 * @param {string} fileContent - 文件内容
 * @returns {boolean} 是否为UI组件文件
 */
function isUIComponentFile(filePath, fileContent) {
  // 工具类文件路径特征
  const toolFilePatterns = [
    /validator/i,
    /util/i,
    /helper/i,
    /tool/i,
    /lib\//i,
    /bin\//i,
    /utils\//i,
    /helpers\//i,
    /config\.js$/i,
    /\.config\.js$/i,
    /-core\.js$/i,
    /-check\.js$/i
  ];

  // 检查文件路径
  for (const pattern of toolFilePatterns) {
    if (pattern.test(filePath)) {
      return false; // 是工具类文件，不是UI组件
    }
  }

  // 检查文件内容特征
  // 如果文件中有JSX/TSX语法（如<Button>、<Input>等），则可能是UI组件
  const hasJSX = /<[A-Z][a-zA-Z]*|return\s*\(|jsx|tsx/i.test(fileContent);

  // 如果文件中有React组件特征（如export default、function Component等）
  const hasReactComponent = /export\s+(default\s+)?(function|const|class)\s+[A-Z]|React\.(Component|FC|memo)/i.test(fileContent);

  // 如果文件中有UI库导入（如antd、element-ui等）
  const hasUILibrary = /from\s+['"]antd|from\s+['"]@ant-design|from\s+['"]element-ui|from\s+['"]element-plus/i.test(fileContent);

  // 如果文件中有JSX返回语句
  const hasJSXReturn = /return\s*\(\s*</.test(fileContent);

  // 综合判断：有JSX/React组件特征或UI库导入，且不是工具类文件路径
  return hasJSX || hasReactComponent || hasUILibrary || hasJSXReturn;
}


/**
 * 构建规则1的Prompt描述
 */
function buildRule1Prompt(ruleConfig) {
  return `规则1：按钮接口调用防重复提交检查

检查条件：只要按钮点击后会触发接口调用时，必须实现防重复提交。

已实现防重复提交的判断标准：
- 按钮点击后调用接口前设置了loading 或 disabled，接口返回后修改了这个状态
- 包含接口调用的方法使用了防抖或者节流

注意：如果按钮没有触发接口调用，则无需检查此规则。`;
}

/**
 * 构建规则2的Prompt描述
 */
function buildRule2Prompt(ruleConfig) {
  return `规则2：页面初始化loading检查

检查条件：页面初始化时（如useEffect、componentDidMount）调用了数据查询接口，且数据在页面主体中展示。

注意：如果页面初始化时没有调用接口，则无需检查此规则。`;
}

/**
 * 构建规则3的Prompt描述
 */
function buildRule3Prompt(ruleConfig) {
  return `规则3：接口操作成功后轻提示检查

检查条件：接口调用涉及数据变更操作（编辑、删除、新增、更新、发布、配置、状态变更等），或者其他涉及业务的操作。

已实现轻提示的判断标准：
- 接口成功后调用轻提示方法（如message.success、message.info、notification.success等）

注意：纯查询操作（GET请求）通常不需要成功提示。`;
}

/**
 * 构建规则4的Prompt描述
 */
function buildRule4Prompt(ruleConfig) {
  return `规则4：非Table组件列表空状态自定义检查

检查条件：页面主体内容通过循环渲染（如array.map()）生成自定义列表或卡片。

已实现空状态的判断标准：
- 有空状态处理（空状态组件、文本或图片）

注意：使用集成了空状态的的数据项展示组件（如antd的Table组件） 无需检查此规则。`;
}

/**
 * 构建规则5的Prompt描述
 */
function buildRule5Prompt(ruleConfig) {
  return `规则5：表单输入项默认提示检查

检查条件：代码中存在表单输入组件（Input、Select、DatePicker等）。`
}

/**
 * 构建用户Prompt
 */
function buildUserPrompt(filePath, fileContent, diff, rulesDescriptions, enabledRules, isUIFile = true) {
  const fileExtension = filePath.split('.').pop();
  const isNewFile = !diff || !diff.includes('---') || (diff && diff.split('\n').some(line => line.startsWith('+++') && !line.includes('---')));

  // 限制文件内容长度，避免超过API token限制
  const MAX_CONTENT_LENGTH = 20000; // 大约5000-10000 tokens
  let truncatedContent = fileContent;
  let isTruncated = false;

  // 为每行添加行号，方便AI准确定位
  const lines = fileContent.split('\n');
  const numberedContent = lines.map((line, index) => `${index + 1}: ${line}`).join('\n');

  if (numberedContent.length > MAX_CONTENT_LENGTH) {
    const truncatedLines = lines.slice(0, Math.floor(MAX_CONTENT_LENGTH / 100)); // 估算行数
    truncatedContent = truncatedLines.map((line, index) => `${index + 1}: ${line}`).join('\n') + '\n\n... (文件内容已截断)';
    isTruncated = true;
  } else {
    truncatedContent = numberedContent;
  }

  // 限制diff长度
  let truncatedDiff = diff;
  if (diff && diff.length > MAX_CONTENT_LENGTH) {
    truncatedDiff = diff.substring(0, MAX_CONTENT_LENGTH) + '\n\n... (diff内容已截断)';
  }

  // 判断文件类型提示
  const fileTypeHint = isUIFile
    ? '文件类型：UI组件文件（需要检查UI相关规则）'
    : '文件类型：工具类/配置文件（可能不需要检查UI相关规则，请仔细判断）';

  let prompt = `请检查以下代码文件是否符合规范：

文件路径：${filePath}
${fileTypeHint}
文件扩展名：${fileExtension}
${isNewFile ? '文件状态：新增文件' : '文件状态：修改文件'}
${isTruncated ? '⚠️ 注意：文件内容较长，已截断显示' : ''}
⚠️ 重要：文件内容已添加行号前缀（格式：行号: 代码），请使用准确的行号！

${truncatedDiff ? `\nGit Diff内容（仅显示变更部分）：\n\`\`\`\n${truncatedDiff}\n\`\`\`\n` : ''}

文件完整内容（带行号）：\n\`\`\`\n${truncatedContent}\n\`\`\`

需要检查的规则：\n`;

  rulesDescriptions.forEach((desc, index) => {
    prompt += `\n${desc}\n`;
  });

  prompt += `\n⚠️ 请快速检查代码，直接返回JSON结果（不要展示思考过程，不要解释，不要输出分析步骤，只返回JSON）：

{
  "passed": true/false,
  "violations": [
    {
      "rule": 规则编号（1-5）,
      "line": 行号（使用文件内容中标注的行号）,
      "message": "错误描述",
      "suggestion": "修复建议"
    }
  ]
}

如果所有规则都通过，返回：{"passed": true, "violations": []}

⚠️ 重要：只返回JSON格式结果，不要包含任何其他文字说明、思考过程、分析步骤或解释！`;

  return prompt;
}


/**
 * 查找组件在文件中的行号
 */
function findComponentLine(fileContent, componentName) {
  const lines = fileContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 查找组件使用的位置（如 <Button, <Select等）
    // 优先匹配JSX标签开始的位置
    if (line.includes(`<${componentName}`)) {
      // 检查是否是完整的JSX标签开始（不是注释或字符串中）
      const beforeTag = line.substring(0, line.indexOf(`<${componentName}`));
      // 如果前面没有引号或注释，说明是真正的JSX标签
      if (!beforeTag.match(/['"`]|^\/\//)) {
        return i + 1; // 返回1-based行号
      }
    }
    // 也匹配其他形式（但排除字符串中的）
    if (line.includes(`${componentName}>`) && !line.match(/['"`]/)) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * 解析AI返回的JSON响应
 */
function parseAIResponse(responseContent, filePath, fileContent) {
  const errors = [];

  try {
    // 尝试提取JSON（AI可能返回markdown格式的代码块）
    let jsonStr = responseContent.trim();

    // 移除markdown代码块标记（支持多行）
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');

    // 尝试提取JSON对象（可能包含其他文本，如markdown代码块前后的说明文字）
    // 首先尝试找到完整的JSON对象（从第一个{到最后一个}）
    // 使用更精确的匹配：找到第一个{，然后找到匹配的}
    let jsonStart = jsonStr.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('未找到JSON对象开始标记');
    }

    // 从第一个{开始，找到匹配的闭合}
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = jsonStart; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }

    let jsonMatch = null;
    if (jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      jsonMatch = [jsonStr];
    } else {
      // 如果没有找到匹配的}，尝试使用正则匹配
      jsonMatch = jsonStr.match(/\{[\s\S]*?\}(?=\s*(?:\n|$|```|根据|以下|分析|代码|文件|规则|提供))/);
      if (!jsonMatch) {
        jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      }
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    // 如果找到了JSON，验证它是否完整
    if (jsonMatch) {
      jsonStr = jsonMatch[0];

      // 检查JSON是否完整（检查是否有未闭合的括号）
      let openBraces = (jsonStr.match(/\{/g) || []).length;
      let closeBraces = (jsonStr.match(/\}/g) || []).length;
      let openBrackets = (jsonStr.match(/\[/g) || []).length;
      let closeBrackets = (jsonStr.match(/\]/g) || []).length;

      // 如果括号不匹配，尝试修复
      if (openBraces > closeBraces) {
        // 缺少闭合括号，尝试补全
        jsonStr += '}'.repeat(openBraces - closeBraces);
      }
      if (openBrackets > closeBrackets) {
        // 缺少闭合方括号，尝试补全
        jsonStr += ']'.repeat(openBrackets - closeBrackets);
      }

      // 如果violations数组不完整，尝试修复
      // 找到violations数组的开始和结束位置
      const violationsStart = jsonStr.indexOf('"violations"');
      if (violationsStart !== -1) {
        const afterViolations = jsonStr.substring(violationsStart);
        const arrayStart = afterViolations.indexOf('[');
        if (arrayStart !== -1) {
          // 找到数组开始位置
          const arrayStartPos = violationsStart + arrayStart + 1;
          // 从数组开始位置向后查找，找到所有完整的violation对象
          let depth = 0;
          let inString = false;
          let escapeNext = false;
          let currentObject = '';
          let completeObjects = [];
          let braceCount = 0;

          for (let i = arrayStartPos; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
              currentObject += char;
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              currentObject += char;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              currentObject += char;
              continue;
            }

            if (inString) {
              currentObject += char;
              continue;
            }

            if (char === '{') {
              braceCount++;
              currentObject += char;
            } else if (char === '}') {
              braceCount--;
              currentObject += char;
              // 如果braceCount为0，说明找到了一个完整的对象
              if (braceCount === 0 && currentObject.trim()) {
                // 检查对象是否包含必需的字段
                if (currentObject.includes('"rule"') && currentObject.includes('"line"')) {
                  completeObjects.push(currentObject.trim());
                }
                currentObject = '';
              }
            } else if (char === ']') {
              // 遇到数组结束，停止查找
              break;
            } else {
              if (braceCount > 0) {
                currentObject += char;
              }
            }
          }

          // 如果找到了完整的对象，重建violations数组
          if (completeObjects.length > 0) {
            const newViolations = `"violations": [${completeObjects.join(',')}]`;
            // 替换原来的violations数组（使用更精确的匹配，包括可能的不完整内容）
            // 先找到violations数组的开始位置
            const violationsStart = jsonStr.indexOf('"violations"');
            if (violationsStart !== -1) {
              const beforeViolations = jsonStr.substring(0, violationsStart);
              const afterViolations = jsonStr.substring(violationsStart);
              // 找到数组的结束位置（可能是]或者被截断）
              // 查找第一个]或者到字符串结束
              let arrayEndPos = -1;
              let braceDepth = 0;
              let inString = false;
              let escapeNext = false;

              for (let i = afterViolations.indexOf('[') + 1; i < afterViolations.length; i++) {
                const char = afterViolations[i];

                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }

                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }

                if (char === '"') {
                  inString = !inString;
                  continue;
                }

                if (inString) continue;

                if (char === '{') braceDepth++;
                else if (char === '}') braceDepth--;
                else if (char === ']' && braceDepth === 0) {
                  arrayEndPos = i;
                  break;
                }
              }

              if (arrayEndPos !== -1) {
                const afterArray = afterViolations.substring(arrayEndPos + 1);
                // 重建JSON
                jsonStr = beforeViolations + newViolations + afterArray;
              } else {
                // 如果没有找到]，说明数组被截断了，需要补全
                // 检查JSON是否还需要闭合
                const openBraces = (jsonStr.match(/\{/g) || []).length;
                const closeBraces = (jsonStr.match(/\}/g) || []).length;
                let closing = '';
                if (openBraces > closeBraces) {
                  closing = '}'.repeat(openBraces - closeBraces);
                }
                jsonStr = beforeViolations + newViolations + closing;
              }
            } else {
              // 如果找不到violations，直接替换
              jsonStr = jsonStr.replace(/"violations"\s*:\s*\[[\s\S]*/, newViolations);
            }
          } else {
            // 如果没有找到完整的对象，尝试移除violations数组（设置为空数组）
            jsonStr = jsonStr.replace(/"violations"\s*:\s*\[[\s\S]*/, '"violations": []');
          }
        }
      }
    }

    // 清理可能的尾随字符
    jsonStr = jsonStr.trim();

    // 尝试解析JSON，如果失败则尝试修复
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // 如果解析失败，尝试修复常见的JSON格式问题
      let fixedJson = jsonStr;
      let lastError = parseError;

      // 尝试多次修复，直到成功或无法修复
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          // 方法1: 移除尾随逗号：匹配逗号后面跟着空白字符和}或]
          fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');

          // 方法2: 移除对象最后一个属性后的逗号（更精确）
          // 匹配 } 后面跟着逗号和 } 或 ]
          fixedJson = fixedJson.replace(/(\})\s*,(\s*[}\]])/g, '$1$2');

          // 方法3: 移除数组最后一个元素后的逗号（更精确）
          // 匹配 ] 后面跟着逗号和 } 或 ]
          fixedJson = fixedJson.replace(/(\])\s*,(\s*[}\]])/g, '$1$2');

          // 方法4: 移除字符串值后的尾随逗号（更精确）
          fixedJson = fixedJson.replace(/("(?:[^"\\]|\\.)*")\s*,(\s*[}\]])/g, '$1$2');

          // 方法5: 移除数字值后的尾随逗号
          fixedJson = fixedJson.replace(/(\d+)\s*,(\s*[}\]])/g, '$1$2');

          // 方法6: 移除布尔值或null后的尾随逗号
          fixedJson = fixedJson.replace(/(true|false|null)\s*,(\s*[}\]])/g, '$1$2');

          // 方法7: 移除多个连续的尾随逗号
          fixedJson = fixedJson.replace(/,+(\s*[}\]])/g, '$1');

          // 方法8: 移除对象或数组最后一个元素后的逗号（通用匹配）
          // 匹配任何非逗号字符后跟着逗号和 } 或 ]
          fixedJson = fixedJson.replace(/([^,{}\[\]]+)\s*,(\s*[}\]])/g, '$1$2');

          result = JSON.parse(fixedJson);
          break; // 解析成功，退出循环
        } catch (e) {
          lastError = e;
          // 如果修复后仍然失败，尝试更激进的修复
          if (attempt >= 5) {
            // 尝试移除所有可能的尾随逗号（更激进的方法）
            fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
            // 尝试移除对象最后一个属性后的逗号
            fixedJson = fixedJson.replace(/([^,{])\s*,(\s*[}])/g, '$1$2');
            // 尝试移除数组最后一个元素后的逗号
            fixedJson = fixedJson.replace(/([^,\[])\s*,(\s*[\]])/g, '$1$2');
          }
        }
      }

      // 如果所有修复尝试都失败，尝试从原始响应重新提取JSON
      if (!result) {
        // 从原始响应重新提取JSON
        const originalJsonStr = responseContent.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');
        const firstBrace = originalJsonStr.indexOf('{');
        if (firstBrace !== -1) {
          let braceCount4 = 0;
          let inString4 = false;
          let escapeNext4 = false;
          let jsonEnd4 = -1;

          for (let i = firstBrace; i < originalJsonStr.length; i++) {
            const char = originalJsonStr[i];

            if (escapeNext4) {
              escapeNext4 = false;
              continue;
            }

            if (char === '\\') {
              escapeNext4 = true;
              continue;
            }

            if (char === '"') {
              inString4 = !inString4;
              continue;
            }

            if (inString4) continue;

            if (char === '{') {
              braceCount4++;
            } else if (char === '}') {
              braceCount4--;
              if (braceCount4 === 0) {
                jsonEnd4 = i;
                break;
              }
            }
          }

          if (jsonEnd4 !== -1) {
            const cleanJson = originalJsonStr.substring(firstBrace, jsonEnd4 + 1);
            try {
              result = JSON.parse(cleanJson);
            } catch (e) {
              // 输出调试信息
              console.warn('JSON解析失败，原始内容:', jsonStr.substring(0, 200));
              console.warn('修复后的内容:', fixedJson.substring(0, 200));
              throw lastError;
            }
          } else {
            // 输出调试信息
            console.warn('JSON解析失败，原始内容:', jsonStr.substring(0, 200));
            console.warn('修复后的内容:', fixedJson.substring(0, 200));
            throw lastError;
          }
        } else {
          // 输出调试信息
          console.warn('JSON解析失败，原始内容:', jsonStr.substring(0, 200));
          console.warn('修复后的内容:', fixedJson.substring(0, 200));
          throw lastError;
        }
      }
    }

    // 检查passed字段，如果为false或violations数组有内容，则记录错误
    if (result.passed === false || (result.violations && Array.isArray(result.violations) && result.violations.length > 0)) {
      if (result.violations && Array.isArray(result.violations)) {
        result.violations.forEach(violation => {
          // 验证violation格式
          if (violation && typeof violation === 'object') {
            // 提取行号，尝试从message中提取更准确的行号
            let lineNumber = violation.line || 0;
            const message = violation.message || '';

            // 如果行号为0或无效，尝试从message中提取
            if (!lineNumber || lineNumber === 0) {
              const lineMatch = message.match(/第?\s*(\d+)\s*行|行\s*(\d+)|line\s*(\d+)/i);
              if (lineMatch) {
                lineNumber = parseInt(lineMatch[1] || lineMatch[2] || lineMatch[3], 10);
              }
            }

            // 验证行号是否在合理范围内，或尝试从错误描述中推断
            const fileLines = fileContent.split('\n').length;

            // 如果行号无效或超出范围，尝试根据组件名查找
            if (!lineNumber || lineNumber === 0 || lineNumber > fileLines) {
              if (message.includes('Button') || message.includes('button')) {
                const buttonLine = findComponentLine(fileContent, 'Button');
                if (buttonLine > 0) lineNumber = buttonLine;
              } else if (message.includes('Select') || message.includes('select')) {
                const selectLine = findComponentLine(fileContent, 'Select');
                if (selectLine > 0) lineNumber = selectLine;
              } else if (message.includes('Input') || message.includes('input')) {
                const inputLine = findComponentLine(fileContent, 'Input');
                if (inputLine > 0) lineNumber = inputLine;
              }
            }

            // 如果行号仍然无效，设为0
            if (!lineNumber || lineNumber > fileLines) {
              lineNumber = 0;
            }

            errors.push({
              rule: violation.rule || 0,
              file: filePath,
              line: lineNumber,
              message: message,
              suggestion: violation.suggestion || '请检查代码'
            });
          }
        });
      }
    }
  } catch (error) {
    // 如果解析失败，尝试从文本中提取信息
    console.warn(`⚠️  解析AI响应失败: ${error.message}`);
    console.warn(`响应内容预览: ${responseContent.substring(0, 200)}...`);

    // 简单的文本解析fallback
    const hasViolationKeywords = /违反|不符合|缺少|错误|问题|未实现|缺失/.test(responseContent);
    const hasPassKeywords = /通过|符合|正确|无问题/.test(responseContent);

    if (hasViolationKeywords && !hasPassKeywords) {
      errors.push({
        rule: 0,
        file: filePath,
        line: 0,
        message: 'AI检测到代码问题，但无法解析具体错误信息',
        suggestion: '请查看AI返回的完整响应或手动检查代码'
      });
    }
  }

  return errors;
}


module.exports = {
  validateWithAI
};

