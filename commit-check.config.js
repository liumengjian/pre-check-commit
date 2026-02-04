/**
 * Git Pre-Commit 代码检查配置文件
 * 
 * 配置说明：
 * - name: 规则名称（用于显示）
 * - description: 规则的详细描述（用于AI检查）
 * - enabled: 是否启用该规则检查（true/false）
 * - whitelist: 白名单配置，匹配到的文件/路径/关键词将跳过对应规则检查
 * - customKeywords: 自定义关键词配置，用于识别项目特定的方法名、组件名等
 * 
 * 注意：可以添加自定义规则（如 rule7, rule8 等），只需按照以下格式配置即可生效
 */

module.exports = {
  // 规则1：按钮接口调用防重复提交检查
  rule1: {
    name: '防重复提交缺失',
    description: `规则1：按钮接口调用防重复提交检查

检查条件：只要按钮点击后会触发接口调用时，必须实现防重复提交。

已实现防重复提交的判断标准：
- 按钮点击后调用接口前设置了loading 或 disabled，接口返回后修改了这个状态
- 包含接口调用的方法使用了防抖或者节流

注意：如果按钮没有触发接口调用，则无需检查此规则。`,
    enabled: true,
  },

  // 规则2：页面初始化loading检查
  rule2: {
    name: '首次进入页面缺失 loading 状态',
    description: `规则2：页面初始化loading检查

检查条件：页面初始化时（如useEffect、componentDidMount）调用了数据查询接口，且数据在页面主体中展示。

注意：如果页面初始化时没有调用接口，则无需检查此规则。`,
    enabled: true,
  },

  // 规则3：接口操作成功后轻提示检查
  rule3: {
    name: '接口操作成功后缺失轻提示',
    description: `规则3：接口操作成功后轻提示检查

检查条件：接口调用涉及数据变更操作（编辑、删除、新增、更新、发布、配置、状态变更等），或者其他涉及业务的操作。

已实现轻提示的判断标准：
- 接口成功后调用轻提示方法（如message.success、message.info、notification.success等）

注意：纯查询操作（GET请求）通常不需要成功提示。`,
    enabled: true,
  },

  // 规则4：非Table组件列表空状态自定义检查
  rule4: {
    name: '非 Table 列表缺失自定义空状态',
    description: `规则4：非Table组件列表空状态自定义检查

检查条件：页面主体内容通过循环渲染（如array.map()）生成自定义列表或卡片。

已实现空状态的判断标准：
- 有空状态处理（空状态组件、文本或图片）

注意：使用集成了空状态的的数据项展示组件（如antd的Table组件） 无需检查此规则。`,
    enabled: true,
  },

  // 规则5：表单输入项默认提示检查
  rule5: {
    name: '表单输入项缺失 placeholder 提示',
    description: `规则5：表单输入项默认提示检查

检查条件：代码中存在表单输入组件（Input、Select、DatePicker等）。`,
    enabled: true,
  },

  // 规则6：PageLayout组件使用规范检查
  rule6: {
    name: 'PageLayout组件使用规范不符合',
    description: `规则6：PageLayout组件使用规范检查

检查条件：当检测到PageLayout组件，且组件来源包含"jjb-react-admin-component"时，必须符合以下规范：

1. 必须引入装饰器：
   import { Interpolation } from '@cqsjjb/jjb-common-decorator/namespace';

2. 组件必须使用Interpolation装饰器：
   - 如果是类组件，使用注解形式放在组件最上面：@Interpolation
   - 如果是函数组件，使用高阶组件形式：export default Interpolation(ComponentName);

3. PageLayout的title属性必须首先使用props.insert('DEFAULT_MENU')，其次才是自定义名称：
   title={props.insert('DEFAULT_MENU') || "自定义名称"}

注意：如果代码中没有使用PageLayout组件，或PageLayout组件来源不包含"jjb-react-admin-component"，则无需检查此规则。`,
    enabled: true,
  },


  // 示例：添加自定义规则（取消注释并修改即可启用）
  // rule7: {
  //   name: '自定义规则名称',
  //   description: `规则7：自定义规则描述
  //
  // 检查条件：在这里描述你的检查条件。
  //
  // 判断标准：
  // - 标准1
  // - 标准2
  //
  // 注意：其他说明信息。`,
  //   enabled: false, // 设置为 true 启用此规则
  // },

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

