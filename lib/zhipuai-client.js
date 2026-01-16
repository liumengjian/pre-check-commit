/**
 * 智普AI API 客户端
 * 基于 axios 实现，支持重试和错误处理
 * 支持模型：glm-4-flashx, glm-4-flashx-250414, glm-4v-flash, glm-4-air
 */

const axios = require('axios');

class ZhipuAIClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 60000;
    this.model = options.model || 'glm-4-flashx';
    this.isBalanceError = false;
    
    // 支持的模型列表
    this.supportedModels = [
      'glm-4-flashx',           // 最新FlashX模型
      'glm-4-flashx-250414',    // 特定版本的FlashX模型
      'glm-4v-flash',           // 原有的多模态模型
      'glm-4-air'               // 其他可用模型
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
        // FlashX模型特定参数
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
   * 发送文本消息
   * @param {string} content - 文本内容
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendTextMessage(content, options = {}) {
    const messages = [
      {
        role: 'user',
        content: content
      }
    ];

    return await this.sendRequestWithRetry(messages, options);
  }

  /**
   * 发送系统消息和用户消息
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userPrompt - 用户提示词
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendChatMessage(systemPrompt, userPrompt, options = {}) {
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

    return await this.sendRequestWithRetry(messages, options);
  }

  /**
   * 图片分析（仅支持多模态模型）
   * @param {string} textContent - 文本内容
   * @param {string} imageUrl - 图片URL
   * @param {string} model - 模型名称，默认为 'glm-4v-flash'
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendImageMessage(textContent, imageUrl, model = 'glm-4v-flash', options = {}) {
    if (!['glm-4v-flash'].includes(model)) {
      return {
        success: false,
        error: `模型 ${model} 不支持图片分析，请使用 glm-4v-flash`
      };
    }

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: textContent
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ];

    return await this.sendRequestWithRetry(messages, { ...options, model });
  }

  /**
   * 多模态消息（文本+多图片）
   * @param {string} textContent - 文本内容
   * @param {Array<string>} imageUrls - 图片URL数组
   * @param {string} model - 模型名称，默认为 'glm-4v-flash'
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendMultiModalMessage(textContent, imageUrls, model = 'glm-4v-flash', options = {}) {
    if (!['glm-4v-flash'].includes(model)) {
      return {
        success: false,
        error: `模型 ${model} 不支持多图片分析，请使用 glm-4v-flash`
      };
    }

    const content = [
      {
        type: 'text',
        text: textContent
      },
      ...imageUrls.map(url => ({
        type: 'image_url',
        image_url: {
          url: url
        }
      }))
    ];

    const messages = [
      {
        role: 'user',
        content: content
      }
    ];

    return await this.sendRequestWithRetry(messages, { ...options, model });
  }

  /**
   * 工具调用
   * @param {string} content - 用户消息内容
   * @param {Array} tools - 工具定义数组
   * @param {string} model - 模型名称，默认为 'glm-4-flashx'
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回结果对象
   */
  async sendToolCallMessage(content, tools, model = 'glm-4-flashx', options = {}) {
    const messages = [
      {
        role: 'user',
        content: content
      }
    ];

    return await this.sendRequestWithRetry(messages, {
      ...options,
      model: model,
      tools: tools,
      tool_choice: options.tool_choice || 'auto'
    });
  }

  /**
   * 流式请求（暂未实现，如需可扩展）
   * @param {Array} messages - 消息数组
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 返回流对象
   */
  async sendStreamRequest(messages, options = {}) {
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
        temperature: options.temperature !== undefined ? options.temperature : 0,
        max_tokens: options.max_tokens || 4096,
        top_p: options.top_p || 0.8,
        stream: true
      };

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        payload,
        {
          headers: this.headers,
          responseType: 'stream',
          timeout: options.timeout || this.timeout
        }
      );

      return {
        success: true,
        stream: response.data
      };
    } catch (error) {
      // 格式化错误信息
      let errorMessage = error.message || '未知错误';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || errorData.code || JSON.stringify(errorData);
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 获取支持的模型列表
   * @returns {Array<string>} 支持的模型列表
   */
  getSupportedModels() {
    return this.supportedModels;
  }

  /**
   * 检查账户余额和使用情况
   * @returns {Promise<Object>} 返回余额信息
   */
  async checkBalance() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/usage`,
        {
          headers: this.headers,
          timeout: this.timeout
        }
      );

      return {
        success: true,
        balance: response.data.balance,
        usage: response.data.usage
      };
    } catch (error) {
      // 格式化错误信息
      let errorMessage = error.message || '未知错误';
      
      if (error.response?.data?.error) {
        const errorData = error.response.data.error;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object') {
          errorMessage = errorData.message || errorData.code || JSON.stringify(errorData);
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}

module.exports = ZhipuAIClient;
