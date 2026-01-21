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
  },

  // 规则2：新增列表/详情页首次进入 loading 检查
  rule2: {
    enabled: true,
  },

  // 规则3：接口操作成功后轻提示检查
  rule3: {
    enabled: true,
  },

  // 规则4：非 Table 组件列表空状态自定义检查
  rule4: {
    enabled: true,
  },

  // 规则5：表单输入项默认提示检查
  rule5: {
    enabled: true,
  },

  // 规则6：PageLayout组件使用规范检查
  rule6: {
    enabled: true,
  },

  // 全局配置
  global: {
    // 智普AI API Key（可选，优先使用环境变量 ZHIPUAI_API_KEY）
    apiKey: '9594b4c3e98c48199b88c0c03313a05e.khRRy27VW6zxo3Dt',
    // 需要检查的文件后缀
    fileExtensions: ['.html', '.js', '.ts', '.vue', '.jsx', '.tsx'],
    // 忽略的文件/目录（支持 glob 模式）
    ignore: ['node_modules/**', 'dist/**', 'build/**', '*.min.js']
  }
};

