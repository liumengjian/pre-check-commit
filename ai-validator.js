/**
 * AI 代码校验模块
 * 使用智普AI API进行代码规则校验
 */

const ZhipuAIClient = require('./lib/zhipuai-client');

// 智普AI API配置
const DEFAULT_MODEL = 'glm-4-flashx';

/**
 * 调用智普AI API进行代码校验
 * @param {string} apiKey - 智普AI API Key
 * @param {string} filePath - 文件路径
 * @param {string} fileContent - 文件内容
 * @param {string} diff - Git diff内容
 * @param {Object} config - 配置文件对象
 * @returns {Promise<Array>} 返回错误数组
 */
async function validateWithAI(apiKey, filePath, fileContent, diff, config) {
  if (!apiKey) {
    throw new Error('智普AI API Key未配置，请设置环境变量 ZHIPUAI_API_KEY 或在配置文件中设置');
  }

  const enabledRules = [];
  const rulesDescriptions = [];

  // 构建启用的规则列表
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

  if (enabledRules.length === 0) {
    return [];
  }

  // 构建Prompt
  const systemPrompt = `你是一名资深的前端代码审核专家，专门负责检查代码是否符合团队规范。你需要仔细分析代码，检查是否违反以下规则，并返回JSON格式的结果。`;

  const userPrompt = buildUserPrompt(filePath, fileContent, diff, rulesDescriptions, enabledRules);

  // 调用API
  try {
    // 从配置中获取模型，如果没有则使用默认模型
    const model = config.global?.model || DEFAULT_MODEL;
    
    const client = new ZhipuAIClient(apiKey, {
      model: model,
      timeout: 60000,
      maxRetries: 3
    });
    
    const result = await client.sendChatMessage(systemPrompt, userPrompt, {
      temperature: 0,
      max_tokens: 4096
    });

    if (!result.success) {
      // 构建详细的错误信息
      let errorMsg = result.error || 'API调用失败';
      
      // 添加状态码信息（如果有）
      if (result.statusCode) {
        errorMsg = `HTTP ${result.statusCode}: ${errorMsg}`;
      }
      
      // 添加错误代码信息（如果有）
      if (result.errorCode) {
        errorMsg = `${errorMsg} (错误代码: ${result.errorCode})`;
      }
      
      throw new Error(errorMsg);
    }

    // 提取响应内容
    const responseContent = result.data?.choices?.[0]?.message?.content;
    if (!responseContent) {
      // 输出调试信息
      console.warn('API响应数据:', JSON.stringify(result.data, null, 2));
      throw new Error('API响应格式错误：未找到响应内容');
    }

    return parseAIResponse(responseContent, filePath);
  } catch (error) {
    // 确保错误信息是字符串
    const errorMsg = error.message || String(error);
    console.error(`调用智普AI API失败: ${errorMsg}`);
    throw error;
  }
}

/**
 * 构建规则1的Prompt描述
 */
function buildRule1Prompt(ruleConfig) {
  const whitelist = ruleConfig.whitelist?.keywords || [];
  return `规则1：新增按钮接口调用防重复提交检查
要求：当代码中有新增的按钮（Button、Modal的onOk、Drawer的onOk、Popconfirm的onConfirm、Form的onFinish等）时，如果该按钮的处理函数中包含接口调用（如fetch、axios、http.post、props.xxxAction等），必须实现防重复提交机制。

防重复提交机制包括：
1. 使用loading状态禁用按钮（如设置loading={isSubmitting}或disabled={isSubmitting}）
2. 在函数开始时检查状态锁（如if (isSubmitting) return;）
3. 在接口调用前设置loading为true，调用完成后设置为false

白名单关键词（包含这些关键词的按钮可跳过检查）：${whitelist.join(', ') || '无'}

检查要点：
- 查找所有按钮点击事件处理函数
- 检查函数中是否有接口调用
- 检查是否有防重复提交的保护机制
- 如果缺少保护机制，记录错误信息，包括函数名和行号`;
}

/**
 * 构建规则2的Prompt描述
 */
function buildRule2Prompt(ruleConfig) {
  const loadingMethods = ruleConfig.customKeywords?.loadingMethods || ['showLoading', 'hideLoading', 'loading', 'setLoading'];
  return `规则2：新增列表/详情页首次进入loading检查
要求：当代码中有列表页或详情页，且在useEffect、componentDidMount、created、mounted等生命周期钩子中调用了数据查询接口时，必须实现loading状态展示。

loading实现方式包括：
1. 使用全局loading方法（如showLoading/hideLoading）
2. 使用useState定义loading状态，并在接口调用前后设置
3. 使用declareRequest定义的loading，并在JSX中使用（如<Spin spinning={loading}>或<Table loading={loading}>）

loading方法关键词：${loadingMethods.join(', ')}

检查要点：
- 查找useEffect、componentDidMount、created、mounted等生命周期钩子
- 检查这些钩子中是否有接口调用
- 检查是否有loading状态的设置和使用
- 如果缺少loading，记录错误信息`;
}

/**
 * 构建规则3的Prompt描述
 */
function buildRule3Prompt(ruleConfig) {
  const successMethods = ruleConfig.customKeywords?.successMethods || ['message.success', '$message.success', 'showSuccessTip', 'ElMessage.success', 'Message.success'];
  const whitelist = ruleConfig.whitelist?.keywords || [];
  return `规则3：接口操作成功后轻提示检查
要求：当代码中有POST、PUT、DELETE类型的接口调用（或包含add、create、update、edit、delete、submit、save等操作关键词的接口调用）时，在接口调用成功后必须显示成功提示。

成功提示方法：${successMethods.join(', ')}

白名单关键词（包含这些关键词的操作可跳过检查）：${whitelist.join(', ') || '无'}

检查要点：
- 查找POST、PUT、DELETE类型的接口调用
- 查找包含操作关键词的接口调用（如addAction、createAction、updateAction等）
- 检查接口调用后的成功回调（.then()回调或async/await后的代码）中是否有成功提示
- 如果缺少成功提示，记录错误信息，包括接口调用位置和行号`;
}

/**
 * 构建规则4的Prompt描述
 */
function buildRule4Prompt(ruleConfig) {
  const emptyComponents = ruleConfig.customKeywords?.emptyComponents || ['Empty', 'NoData', 'EmptyTip'];
  return `规则4：非Table组件列表空状态自定义检查
要求：当代码中有列表渲染（使用.map()、v-for、forEach等），但未使用Table组件时，必须实现列表为空时的空状态展示。

空状态实现方式：
1. 使用空状态组件：${emptyComponents.join(', ')}
2. 条件渲染空状态文本（如"暂无数据"、"暂无"）
3. 使用条件判断（如list.length === 0时显示空状态）

检查要点：
- 检查是否有列表渲染逻辑
- 检查是否使用了Table组件（如果使用了Table组件，则跳过此规则）
- 检查是否有空状态处理
- 如果缺少空状态，记录错误信息`;
}

/**
 * 构建规则5的Prompt描述
 */
function buildRule5Prompt(ruleConfig) {
  const inputComponents = ruleConfig.customKeywords?.inputComponents || [
    'Input', 'Select', 'DatePicker', 'InputNumber', 'TextArea'
  ];
  return `规则5：表单输入项默认提示检查
要求：当代码中有新增的表单输入组件（${inputComponents.join(', ')}等）时，必须为这些组件设置placeholder属性，提供用户输入提示。

检查要点：
- 查找所有表单输入组件
- 检查是否有placeholder属性
- 如果缺少placeholder，记录错误信息，包括组件位置和行号
- 注意：某些子组件（如Select.Option、Input.Group等）不需要placeholder，应排除`;
}

/**
 * 构建用户Prompt
 */
function buildUserPrompt(filePath, fileContent, diff, rulesDescriptions, enabledRules) {
  const fileExtension = filePath.split('.').pop();
  const isNewFile = !diff || !diff.includes('---') || (diff && diff.split('\n').some(line => line.startsWith('+++') && !line.includes('---')));
  
  // 限制文件内容长度，避免超过API token限制
  const MAX_CONTENT_LENGTH = 20000; // 大约5000-10000 tokens
  let truncatedContent = fileContent;
  let isTruncated = false;
  
  if (fileContent.length > MAX_CONTENT_LENGTH) {
    truncatedContent = fileContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n... (文件内容已截断，仅显示前' + MAX_CONTENT_LENGTH + '个字符)';
    isTruncated = true;
  }
  
  // 限制diff长度
  let truncatedDiff = diff;
  if (diff && diff.length > MAX_CONTENT_LENGTH) {
    truncatedDiff = diff.substring(0, MAX_CONTENT_LENGTH) + '\n\n... (diff内容已截断)';
  }
  
  let prompt = `请检查以下代码文件是否符合规范：

文件路径：${filePath}
文件类型：${fileExtension}
${isNewFile ? '文件状态：新增文件' : '文件状态：修改文件'}
${isTruncated ? '⚠️ 注意：文件内容较长，已截断显示' : ''}

${truncatedDiff ? `\nGit Diff内容（仅显示变更部分）：\n\`\`\`\n${truncatedDiff}\n\`\`\`\n` : ''}

文件完整内容：\n\`\`\`\n${truncatedContent}\n\`\`\`

需要检查的规则：\n`;

  rulesDescriptions.forEach((desc, index) => {
    prompt += `\n${desc}\n`;
  });

  prompt += `\n请仔细分析代码，检查是否违反上述规则。返回JSON格式的结果，格式如下：
{
  "passed": true/false,
  "violations": [
    {
      "rule": 规则编号（1-5）,
      "line": 行号,
      "message": "错误描述",
      "suggestion": "修复建议"
    }
  ]
}

如果所有规则都通过，返回：
{
  "passed": true,
  "violations": []
}

重要提示：
1. 只检查实际违反规则的情况，不要误报
2. 行号请尽量准确
3. 如果文件被截断，请基于可见内容进行判断
4. 必须返回有效的JSON格式，不要包含其他文字说明`;

  return prompt;
}


/**
 * 解析AI返回的JSON响应
 */
function parseAIResponse(responseContent, filePath) {
  const errors = [];

  try {
    // 尝试提取JSON（AI可能返回markdown格式的代码块）
    let jsonStr = responseContent.trim();
    
    // 移除markdown代码块标记
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }
    
    // 尝试提取JSON对象（可能包含其他文本）
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const result = JSON.parse(jsonStr);

    // 检查passed字段，如果为false或violations数组有内容，则记录错误
    if (result.passed === false || (result.violations && Array.isArray(result.violations) && result.violations.length > 0)) {
      if (result.violations && Array.isArray(result.violations)) {
        result.violations.forEach(violation => {
          // 验证violation格式
          if (violation && typeof violation === 'object') {
            errors.push({
              rule: violation.rule || 0,
              file: filePath,
              line: violation.line || 0,
              message: violation.message || '违反规则',
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

