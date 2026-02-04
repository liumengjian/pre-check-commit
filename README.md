# Git Pre-Commit 代码检查工具

前端 Git 提交阶段（pre-commit 钩子）的代码自动检查工具，基于 husky + 智普AI API 实现，自动检测代码是否符合业务规范。

## 📋 功能特性

- ✅ **规则1**：按钮接口调用防重复提交检查
- ✅ **规则2**：页面初始化 loading 检查
- ✅ **规则3**：接口操作成功后轻提示检查
- ✅ **规则4**：非 Table 组件列表空状态自定义检查
- ✅ **规则5**：表单输入项默认提示检查
- ✅ **规则6**：PageLayout组件使用规范检查
- ✅ **动态规则支持**：支持添加自定义规则（rule7, rule8 等）
- ✅ **AI 智能分析**：使用智普AI API 进行代码智能检查，显示完整的分析过程

## 🚀 快速开始

### 方式一：作为 npm 包安装（推荐）

#### 1. 安装包

```bash
npm install prina-pre-commit-check --save-dev
# 或
yarn add prina-pre-commit-check -D
```

#### 2. 自动配置

安装完成后，`prepare` 脚本会自动执行，完成以下操作：
- 安装 husky
- 配置 pre-commit hook
- 创建默认配置文件（如果不存在）

如果自动配置失败，可以手动执行：

```bash
npm run prepare
# 或
npx pre-commit-check --init
```

### 方式二：全局安装

#### 1. 全局安装包

```bash
npm install -g prina-pre-commit-check
```

#### 2. 在项目中初始化

进入项目目录，执行初始化命令：

**Windows (PowerShell/CMD):**
```powershell
npx pre-commit-check --init
```

**Linux/Mac:**
```bash
pre-commit-check --init
# 或
pre-commit-check-init
```

**注意**：Windows 上建议使用 `npx` 命令运行全局安装的包。

**注意**：全局安装后，husky 仍需在项目中本地安装：

```bash
npm install husky --save-dev
npx husky install
```

详细说明请参考 [GLOBAL_INSTALL.md](./GLOBAL_INSTALL.md)

#### 3. 配置 API Key

设置智普AI API Key（二选一）：

**方式一：环境变量（推荐）**
```bash
# Windows (PowerShell)
$env:ZHIPUAI_API_KEY="your_api_key_here"

# Linux/Mac
export ZHIPUAI_API_KEY="your_api_key_here"
```

**方式二：配置文件**
编辑项目根目录下的 `commit-check.config.js` 文件，在 `global.apiKey` 中设置。

#### 4. 配置检查规则

编辑项目根目录下的 `commit-check.config.js` 文件，根据项目需求配置：
- 启用/禁用指定检查规则
- 自定义规则名称和描述
- 添加自定义规则（rule7, rule8 等）

#### 5. 测试

执行 Git 提交时，会自动触发检查：

```bash
git add .
git commit -m "test: 测试提交"
```

校验过程中会实时显示 AI 的分析过程，帮助理解检查逻辑。

### 方式二：本地开发模式

如果你想在本地开发或修改此工具：

#### 1. 克隆或下载项目

```bash
git clone <repository-url>
cd pre-check-commit
```

#### 2. 安装依赖

```bash
npm install
# 或
yarn install
```

#### 3. 初始化 Git 钩子

```bash
npm run prepare
# 或
yarn prepare
```

这将自动安装 husky 并配置 pre-commit 钩子。


## ⚙️ 配置说明

### 配置文件：`commit-check.config.js`

```javascript
module.exports = {
  // 规则1：按钮接口调用防重复提交检查
  rule1: {
    name: '防重复提交缺失',  // 规则名称（用于显示）
    description: `规则1：按钮接口调用防重复提交检查

检查条件：只要按钮点击后会触发接口调用时，必须实现防重复提交。

已实现防重复提交的判断标准：
- 按钮点击后调用接口前设置了loading 或 disabled，接口返回后修改了这个状态
- 包含接口调用的方法使用了防抖或者节流

注意：如果按钮没有触发接口调用，则无需检查此规则。`,
    enabled: true,  // 是否启用
  },

  // 规则2：页面初始化loading检查
  rule2: {
    name: '首次进入页面缺失 loading 状态',
    description: `规则2：页面初始化loading检查

检查条件：页面初始化时（如useEffect、componentDidMount）调用了数据查询接口，且数据在页面主体中展示。

注意：如果页面初始化时没有调用接口，则无需检查此规则。`,
    enabled: true,
  },

  // ... 其他规则配置

  // 全局配置
  global: {
    // 智普AI API Key（可选，优先使用环境变量 ZHIPUAI_API_KEY）
    apiKey: 'your_api_key_here',
    // 需要检查的文件后缀
    fileExtensions: ['.html', '.js', '.ts', '.vue', '.jsx', '.tsx'],
    // 忽略的文件/目录（支持 glob 模式）
    ignore: ['node_modules/**', 'dist/**', 'build/**', '*.min.js']
  }
};
```

### 规则配置项说明

每个规则包含以下配置项：

- **`name`** (必需): 规则名称，用于错误信息显示
- **`description`** (必需): 规则的详细描述，用于 AI 检查时的提示
- **`enabled`** (必需): 是否启用该规则检查（`true`/`false`）

### 添加自定义规则

你可以在配置文件中添加自定义规则（如 rule7, rule8 等）：

```javascript
// 示例：添加自定义规则
rule7: {
  name: '自定义规则名称',
  description: `规则7：自定义规则描述

检查条件：在这里描述你的检查条件。

判断标准：
- 标准1
- 标准2

注意：其他说明信息。`,
  enabled: true, // 设置为 true 启用此规则
},
```

系统会自动识别并应用所有启用的规则（包括自定义规则）。

## 📝 检查规则详情

### 规则1：按钮接口调用防重复提交检查

**检查条件**：只要按钮点击后会触发接口调用时，必须实现防重复提交。

**已实现防重复提交的判断标准**：
- 按钮点击后调用接口前设置了 loading 或 disabled，接口返回后修改了这个状态
- 包含接口调用的方法使用了防抖或者节流

**注意**：如果按钮没有触发接口调用，则无需检查此规则。

### 规则2：页面初始化 loading 检查

**检查条件**：页面初始化时（如 useEffect、componentDidMount）调用了数据查询接口，且数据在页面主体中展示。

**注意**：如果页面初始化时没有调用接口，则无需检查此规则。

### 规则3：接口操作成功后轻提示检查

**检查条件**：接口调用涉及数据变更操作（编辑、删除、新增、更新、发布、配置、状态变更等），或者其他涉及业务的操作。

**已实现轻提示的判断标准**：
- 接口成功后调用轻提示方法（如 message.success、message.info、notification.success 等）

**注意**：纯查询操作（GET 请求）通常不需要成功提示。

### 规则4：非 Table 组件列表空状态自定义检查

**检查条件**：页面主体内容通过循环渲染（如 array.map()）生成自定义列表或卡片。

**已实现空状态的判断标准**：
- 有空状态处理（空状态组件、文本或图片）

**注意**：使用集成了空状态的数据项展示组件（如 antd 的 Table 组件）无需检查此规则。

### 规则5：表单输入项默认提示检查

**检查条件**：代码中存在表单输入组件（Input、Select、DatePicker 等）。

### 规则6：PageLayout组件使用规范检查

**检查条件**：当检测到 PageLayout 组件，且组件来源包含 "jjb-react-admin-component" 时，必须符合以下规范：

1. **必须引入装饰器**：
   ```javascript
   import { Interpolation } from '@cqsjjb/jjb-common-decorator/namespace';
   ```

2. **组件必须使用 Interpolation 装饰器**：
   - 如果是类组件，使用注解形式放在组件最上面：`@Interpolation`
   - 如果是函数组件，使用高阶组件形式：`export default Interpolation(ComponentName);`

3. **PageLayout 的 title 属性必须首先使用 props.insert('DEFAULT_MENU')，其次才是自定义名称**：
   ```javascript
   title={props.insert('DEFAULT_MENU') || "自定义名称"}
   ```

**注意**：如果代码中没有使用 PageLayout 组件，或 PageLayout 组件来源不包含 "jjb-react-admin-component"，则无需检查此规则。

## 🔧 常见问题

### Q: 如何跳过单次检查？

**A**: 在紧急情况下，可以使用 `--no-verify` 参数跳过检查：

```bash
git commit --no-verify -m "紧急修复"
```

⚠️ **注意**：仅在特殊紧急场景下使用，不建议常规使用。

### Q: 检查误报怎么办？

**A**: 可以通过以下方式解决：

1. **配置白名单**：在 `commit-check.config.js` 中添加对应的白名单配置
2. **禁用规则**：将对应规则的 `enabled` 设置为 `false`
3. **自定义关键词**：在 `customKeywords` 中添加项目特定的方法名、组件名

### Q: 如何兼容旧项目？

**A**: 
1. 检查工具仅检查本次提交的新增/修改代码，不会影响已有代码
2. 可以通过配置文件逐步启用规则，先启用部分规则测试
3. 对于历史遗留问题，可以通过白名单配置跳过检查

### Q: 检查耗时过长怎么办？

**A**: 
- 工具仅检查暂存区文件，不会全量检查
- 使用 AI 进行智能检查，会显示完整的分析过程
- 如果仍然耗时过长，可以检查配置文件中的 `ignore` 设置，确保排除了不必要的文件

### Q: 如何添加自定义规则？

**A**: 
1. 在 `commit-check.config.js` 中添加新的规则配置（如 `rule7`）
2. 设置 `name`（规则名称）、`description`（规则详细描述）和 `enabled`（是否启用）
3. 系统会自动识别并应用该规则

示例：
```javascript
rule7: {
  name: '自定义规则名称',
  description: `规则7：自定义规则描述

检查条件：在这里描述你的检查条件。`,
  enabled: true,
}
```

### Q: API Key 如何配置？

**A**: 
推荐使用环境变量配置（优先级更高）：
```bash
export ZHIPUAI_API_KEY="your_api_key_here"
```

也可以在配置文件的 `global.apiKey` 中设置（不推荐，可能泄露到代码仓库）。

## 📊 验收步骤

### 1. 功能验收

```bash
# 1. 创建测试文件（包含违规代码）
# 2. 添加到暂存区
git add test/test-files/rule1-violation.vue

# 3. 尝试提交（应该被拦截）
git commit -m "test: 测试规则1"

# 4. 修复代码后重新提交（应该通过）
git add test/test-files/rule1-pass.vue
git commit -m "test: 测试规则1通过"
```

### 2. 配置验收

```bash
# 1. 修改配置文件，禁用某个规则
# 2. 添加违规代码并提交
# 3. 验证该规则不再检查
```

### 3. 性能验收

```bash
# 1. 添加多个文件到暂存区
# 2. 执行提交，观察耗时
# 3. 验证单文件检查耗时 ≤ 1s，10 个文件总耗时 ≤ 5s
```

## 🧪 测试用例

测试用例位于 `test/test-files/` 目录，包含：

- `rule1-violation.vue` / `rule1-pass.vue` - 规则1测试用例
- `rule2-violation.tsx` / `rule2-pass.tsx` - 规则2测试用例
- `rule3-violation.js` / `rule3-pass.js` - 规则3测试用例
- `rule4-violation.vue` / `rule4-pass.vue` - 规则4测试用例
- `rule1-rule3-test.vue` - 规则1和规则3组合测试用例

## 📦 在其他项目中使用

### 安装步骤

1. **安装 npm 包**

```bash
npm install prina-pre-commit-check --save-dev
# 或
yarn add prina-pre-commit-check -D
```

2. **自动配置**

安装后会自动执行 `prepare` 脚本，完成 husky 和 git hook 的配置。如果自动配置失败，可以手动执行：

```bash
npm run prepare
```

3. **配置文件**

工具会在项目根目录创建 `commit-check.config.js` 配置文件（如果不存在）。你可以根据项目需求修改配置。

4. **开始使用**

配置完成后，每次执行 `git commit` 时会自动触发代码检查。

### 手动配置（可选）

如果自动配置失败，可以手动配置：

1. **安装 husky**

```bash
npx husky install
```

2. **创建 pre-commit hook**

```bash
# Windows (PowerShell)
echo "npx pre-commit-check" > .husky/pre-commit

# Linux/Mac
echo "npx pre-commit-check" > .husky/pre-commit
chmod +x .husky/pre-commit
```

3. **复制配置文件**

```bash
# Windows (PowerShell)
Copy-Item node_modules/prina-pre-commit-check/commit-check.config.js .

# Linux/Mac
cp node_modules/prina-pre-commit-check/commit-check.config.js .
```

### 卸载

如果需要卸载此工具：

```bash
# 1. 卸载 npm 包
npm uninstall prina-pre-commit-check
# 或
yarn remove prina-pre-commit-check

# 2. 删除配置文件（可选）
# Windows
del commit-check.config.js
# Linux/Mac
rm commit-check.config.js

# 3. 删除或修改 .husky/pre-commit hook（可选）
# 编辑 .husky/pre-commit，删除或注释掉 "npx pre-commit-check" 这一行
```

## 📦 依赖说明

### 核心依赖

- `chalk`: 终端颜色输出
- 智普AI API: 用于智能代码检查和分析

### 开发依赖（仅开发此工具时需要）

- `husky`: Git 钩子管理

### API 配置

本工具使用智普AI API 进行代码智能检查，需要配置 API Key：

1. **获取 API Key**：访问 [智普AI官网](https://open.bigmodel.cn/) 注册并获取 API Key
2. **配置 API Key**：通过环境变量或配置文件设置（见配置说明）

## 🔄 工作流程

1. 用户执行 `git commit -m "xxx"`
2. 触发 pre-commit 钩子
3. 筛选暂存区中符合后缀的文件（UI组件文件）
4. 调用智普AI API 对文件进行智能检查
5. 实时显示 AI 分析过程（流式输出）
6. 解析检查结果，按规则分组显示
7. 若所有检查通过，放行 Git 提交流程
8. 若任意一项检查不通过，终止提交流程，打印详细错误信息（包含文件路径、行号、错误原因和修复建议）

## 📄 许可证

MIT

## 🤝 贡献

刘梦俭 liumengjianguge@gmail.com

