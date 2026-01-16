/**
 * Git Pre-Commit 代码检查配置文件
 * 
 * 配置说明：
 * - enabled: 是否启用该规则检查（true/false）
 * - whitelist: 白名单配置，匹配到的文件/路径/关键词将跳过对应规则检查
 * - customKeywords: 自定义关键词配置，用于识别项目特定的方法名、组件名等
 */

module.exports = {
  // 规则1：新增按钮接口调用防重复提交检查
  rule1: {
    enabled: true,
    // 无需防重复提交的按钮关键词（按钮文本或函数名包含这些关键词时跳过检查）
    whitelist: {
      keywords: ['查看', '查看详情', '取消', '返回', '关闭', '详情', 'view', 'cancel', 'close', 'detail']
    },
    // 自定义请求方法名（用于识别接口调用）
    // 支持多种接口调用方式：
    // 1. declareRequest + Connect: props.xxxAction()
    // 2. http.Post/Get: http.Post(), http.Get()
    // 3. axios: axios.post(), axios.get(), axios({})
    // 4. XMLHttpRequest: new XMLHttpRequest(), xhr.open(), xhr.send()
    // 5. props.dispatch: props.dispatch({ type: '...' })
    // 6. fetchDataApi: fetchDataApi(params)
    // 7. fetch: fetch()
    // 8. $http: this.$http.post()
    // 9. ajax: $.ajax()
    customKeywords: {
      requestMethods: ['fetch', 'axios', 'request', 'http', 'api', 'action', 'dispatch', 'xhr', 'ajax', 'fetchdataapi']
    }
  },

  // 规则2：新增列表/详情页首次进入 loading 检查
  rule2: {
    enabled: true,
    // 无需 loading 的页面路径（支持 glob 模式）
    whitelist: {
      paths: []
    },
    // 自定义 loading 方法名
    customKeywords: {
      loadingMethods: ['showLoading', 'hideLoading', 'loading', 'setLoading']
    }
  },

  // 规则3：接口操作成功后轻提示检查
  rule3: {
    enabled: true,
    // 无需轻提示的接口路径/操作关键词
    whitelist: {
      paths: [],
      keywords: ['batch', '批量'] // 批量操作超过10条时通常有专门结果弹窗
    },
    // 自定义轻提示方法名
    customKeywords: {
      successMethods: ['message.success', '$message.success', 'showSuccessTip', 'ElMessage.success', 'Message.success']
    }
  },

  // 规则4：非 Table 组件列表空状态自定义检查
  rule4: {
    enabled: true,
    // 无需空状态的列表关键词
    whitelist: {
      keywords: []
    },
    // 自定义空状态组件名
    customKeywords: {
      emptyComponents: ['Empty', 'NoData', 'EmptyTip']
    }
  },

  // 规则5：表单输入项默认提示检查
  rule5: {
    enabled: true,
    // 无需提示的表单输入项关键词
    whitelist: {
      keywords: []
    },
    // 自定义表单输入组件名（需要检查 placeholder 的组件）
    customKeywords: {
      inputComponents: [
        // Ant Design
        'Input', 'Input.TextArea', 'Input.Password', 'Input.Search', 'Input.Group',
        'Select', 'DatePicker', 'RangePicker', 'TimePicker', 'InputNumber',
        'AutoComplete', 'Cascader', 'TreeSelect', 'Transfer', 'Upload', 'Rate',
        // Element UI
        'el-input', 'el-select', 'el-date-picker', 'el-time-picker',
        'el-input-number', 'el-autocomplete', 'el-cascader', 'el-tree-select',
        'el-transfer', 'el-upload', 'el-rate',
        // 原生 HTML
        'input', 'select', 'textarea'
      ],
      // 提示属性名（不同 UI 库可能不同）
      placeholderAttributes: ['placeholder', 'placeholderText']
    }
  },

  // 全局配置
  global: {
    // 智普AI API Key（可选，优先使用环境变量 ZHIPUAI_API_KEY）
    apiKey: '9594b4c3e98c48199b88c0c03313a05e.khRRy27VW6zxo3Dt',
    
    // 智普AI 模型配置（可选，默认使用 glm-4-flashx）
    // 支持的模型：glm-4-flashx, glm-4-flashx-250414, glm-4v-flash, glm-4-air
    // model: 'glm-4-flashx',
    
    // 需要检查的文件后缀
    fileExtensions: ['.html', '.js', '.ts', '.vue', '.jsx', '.tsx'],
    // 忽略的文件/目录（支持 glob 模式）
    ignore: ['node_modules/**', 'dist/**', 'build/**', '*.min.js']
  }
};

