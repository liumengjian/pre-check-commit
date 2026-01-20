/**
 * 智普AI API 客户端
 * 基于 axios 实现，支持重试和错误处理
 */

const axios = require('axios');

class ZhipuAIClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 60000;
    this.model = options.model;
    this.isBalanceError = false;
    
    // 支持的模型列表
    this.supportedModels = [
      'glm-4.7',
      'glm-4.7-flash',
    ];
    
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 验证模型是否支持
   * @param {string} model - 模型名称
   * @returns {boolean} 是否支持
   */
  validateModel(model) {
    return this.supportedModels.includes(model);
  }

  /**
   * 发送请求到智普AI API
   * @param {Array} messages - 消息数组
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendRequest(messages, options = {}) {
    try {
      // 验证模型
      const model = options.model || this.model;
      if (!this.validateModel(model)) {
        return {
          success: false,
          error: `不支持的模型: ${model}。支持的模型: ${this.supportedModels.join(', ')}`
        };
      }

      const payload = {
        model: model,
        messages: messages,
        temperature: options.temperature !== undefined ? options.temperature : 0,
        max_tokens: options.max_tokens || 4096,
        top_p: options.top_p || 0.8,
        stream: options.stream || false,
        tools: options.tools || null,
        tool_choice: options.tool_choice || null,
        response_format: options.response_format || null
      };

      // 移除null值参数
      Object.keys(payload).forEach(key => {
        if (payload[key] === null) {
          delete payload[key];
        }
      });

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        payload,
        {
          headers: this.headers,
          timeout: options.timeout || this.timeout
        }
      );

      this.isBalanceError = false;
      
      return {
        success: true,
        data: response.data,
        model: model
      };
    } catch (error) {
      // 格式化错误信息
      let errorMessage = error.message || '未知错误';
      let isBalanceError = false;
      
      if (error.response) {
        // 检查余额错误
        if (error.response.status === 429) {
          const errorData = error.response.data?.error;
          const errorMsg = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || JSON.stringify(errorData));
          
          if (errorMsg.includes('余额不足') || errorMsg.includes('无可用资源包')) {
            this.isBalanceError = true;
            isBalanceError = true;
            errorMessage = '账户余额不足或无可用资源包，请检查资源包状态';
          }
        }
        
        // 处理API返回的错误
        if (!isBalanceError) {
          const errorData = error.response.data?.error;
          if (errorData) {
            if (typeof errorData === 'string') {
              errorMessage = errorData;
            } else if (typeof errorData === 'object') {
              // 如果是对象，尝试提取message或code
              errorMessage = errorData.message || errorData.code || JSON.stringify(errorData);
            }
          } else if (error.response.data) {
            // 如果没有error字段，尝试直接使用data
            errorMessage = typeof error.response.data === 'string' 
              ? error.response.data 
              : JSON.stringify(error.response.data);
          }
          
          // 添加状态码信息
          if (error.response.status) {
            errorMessage = `HTTP ${error.response.status}: ${errorMessage}`;
          }
        }
      } else if (error.code) {
        // 处理网络错误
        errorMessage = `${error.code}: ${errorMessage}`;
      }
      
      return {
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        errorCode: error.response?.data?.error?.code || error.code,
        isBalanceError: isBalanceError
      };
    }
  }

  /**
   * 带重试机制的请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendRequestWithRetry(messages, options = {}) {
    // 如果之前检测到余额错误，直接返回
    if (this.isBalanceError) {
      return {
        success: false,
        error: '账户余额不足，请检查资源包状态',
        isBalanceError: true
      };
    }

    let lastError;
    const maxRetries = options.maxRetries || this.maxRetries;

    for (let i = 0; i < maxRetries; i++) {
      const result = await this.sendRequest(messages, options);

      if (result.success) {
        return result;
      }

      // 如果是余额错误，不重试
      if (result.isBalanceError) {
        return result;
      }

      lastError = result.error;
      const errorCode = result.errorCode;

      // 如果是限流错误，等待更长时间（指数退避）
      if (result.statusCode === 429 || (errorCode && errorCode.includes('rate_limit'))) {
        const waitTime = Math.pow(2, i) * 1000; // 指数退避：1s, 2s, 4s
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // 如果是认证错误，不重试
      if (result.statusCode === 401 || result.statusCode === 403) {
        break;
      }

      // 如果是4xx错误（除了限流和认证），不重试
      if (result.statusCode >= 400 && result.statusCode < 500 && result.statusCode !== 429) {
        break;
      }

      // 其他错误，等待后重试
      if (i < maxRetries - 1) {
        const waitTime = Math.min(1000 * (i + 1), 5000); // 最多等待5秒
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // 确保错误信息是字符串
    const errorMsg = typeof lastError === 'string' 
      ? lastError 
      : (lastError?.message || JSON.stringify(lastError) || '未知错误');
    
    return {
      success: false,
      error: `请求失败，已重试 ${maxRetries} 次。最后错误: ${errorMsg}`
    };
  }

  /**
   * 流式发送系统消息和用户消息
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userPrompt - 用户提示词
   * @param {Object} options - 请求选项
   * @param {Function} onChunk - 流式数据回调函数 (chunk) => void
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendChatMessageStream(systemPrompt, userPrompt, options = {}, onChunk = null) {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    messages.push({
      role: 'user',
      content: userPrompt
    });

    return await this.sendStreamRequest(messages, options, onChunk);
  }

  /**
   * 流式请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 请求选项
   * @param {Function} onChunk - 流式数据回调函数 (chunk) => void
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendStreamRequest(messages, options = {}, onChunk = null) {
    try {
      const model = options.model || this.model;
      if (!this.validateModel(model)) {
        return {
          success: false,
          error: `不支持的模型: ${model}。支持的模型: ${this.supportedModels.join(', ')}`
        };
      }

      const payload = {
        model: model,
        messages: messages,
        temperature: 0, // 不进行深度思考
        max_tokens: options.max_tokens || 4096,
        top_p: options.top_p || 0.8,
        stream: true
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || errorData.error?.code || `HTTP error! status: ${response.status}`;
        return {
          success: false,
          error: errorMessage,
          statusCode: response.status,
          errorCode: errorData.error?.code
        };
      }

      // 如果提供了onChunk回调，处理流式数据
      if (onChunk) {
        return await this.handleStreamResponse(response.body, onChunk);
      }

      return {
        success: true,
        stream: response.body
      };
    } catch (error) {
      // 格式化错误信息
      let errorMessage = error.message || '未知错误';
      
      if (error.name === 'AbortError') {
        errorMessage = '请求超时';
      }
      
      return {
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        errorCode: error.response?.data?.error?.code
      };
    }
  }

  /**
   * 处理流式响应
   * @param {ReadableStream} stream - 响应流
   * @param {Function} onChunk - 流式数据回调函数 (chunk) => void
   * @returns {Promise<Object>} 返回完整结果对象
   */
  async handleStreamResponse(stream, onChunk) {
    try {
      let fullContent = '';
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 使用TextDecoder来解码流数据
        buffer += decoder.decode(value, { stream: true });
        
        // 处理SSE数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // 跳过空行
          if (!trimmedLine) continue;
          
          // 处理SSE格式: data: {...} 或 data: [DONE]
          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.slice(6).trim();
            
            // 检查结束标志
            if (dataStr === '[DONE]') {
              break;
            }
            
            try {
              const json = JSON.parse(dataStr);
              
              // 提取内容（支持reasoning_content和content）
              const delta = json.choices?.[0]?.delta || {};
              const content = delta.content || '';
              const reasoning = delta.reasoning_content || '';
              
              // 如果有内容，累加并回调
              if (content || reasoning) {
                if (content) {
                  fullContent += content;
                }
                
                // 调用回调函数，实时输出到控制台
                if (onChunk) {
                  // 优先输出思考过程，然后是内容
                  if (reasoning) {
                    onChunk(reasoning, 'reasoning');
                  }
                  if (content) {
                    onChunk(content, 'content');
                  }
                }
              }
            } catch (e) {
              // JSON解析错误，输出调试信息（仅在开发时启用）
              if (process.env.DEBUG) {
                console.error('JSON parse error:', e.message, 'data:', dataStr);
              }
            }
          }
        }
      }

      // 确保reader被释放
      reader.releaseLock();

      return {
        success: true,
        data: {
          choices: [{
            message: {
              content: fullContent
            }
          }]
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '流式响应错误'
      };
    }
  }
}

module.exports = ZhipuAIClient;
