# Git Pre-Commit 代码检查工具

前端 Git 提交阶段（pre-commit 钩子）的代码自动检查工具，基于 husky + lint-staged 实现，自动检测代码是否符合 4 项核心业务规范。

## 📋 功能特性

- ✅ **规则1**：新增按钮接口调用防重复提交检查
- ✅ **规则2**：新增列表/详情页首次进入 loading 检查
- ✅ **规则3**：接口操作成功后轻提示检查
- ✅ **规则4**：非 Table 组件列表空状态自定义检查

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
# 或
yarn install
```

### 2. 初始化 Git 钩子

```bash
npm run prepare
# 或
yarn prepare
```

这将自动安装 husky 并配置 pre-commit 钩子。

### 3. 配置检查规则

编辑 `commit-check.config.js` 文件，根据项目需求配置：

- 启用/禁用指定检查规则
- 配置白名单文件/目录
- 自定义关键词（方法名、组件名等）

### 4. 测试

执行 Git 提交时，会自动触发检查：

```bash
git add .
git commit -m "test: 测试提交"
```

## ⚙️ 配置说明

### 配置文件：`commit-check.config.js`

```javascript
module.exports = {
  // 规则1：新增按钮接口调用防重复提交检查
  rule1: {
    enabled: true,  // 是否启用
    whitelist: {
      keywords: ['查看', '取消', '返回']  // 无需防重复提交的按钮关键词
    },
    customKeywords: {
      requestMethods: ['fetch', 'axios', 'request']  // 自定义请求方法名
    }
  },
  
  // ... 其他规则配置
};
```

### 规则配置项

#### 规则1：防重复提交检查
- `whitelist.keywords`: 无需防重复提交的按钮关键词列表
- `customKeywords.requestMethods`: 自定义请求方法名列表

#### 规则2：Loading 检查
- `whitelist.paths`: 无需 loading 的页面路径（支持 glob 模式）
- `customKeywords.loadingMethods`: 自定义 loading 方法名列表

#### 规则3：轻提示检查
- `whitelist.paths`: 无需轻提示的接口路径
- `whitelist.keywords`: 无需轻提示的操作关键词（如批量操作）
- `customKeywords.successMethods`: 自定义成功提示方法名列表

#### 规则4：空状态检查
- `whitelist.keywords`: 无需空状态的列表关键词
- `customKeywords.emptyComponents`: 自定义空状态组件名列表

## 📝 检查规则详情

### 规则1：新增按钮接口调用防重复提交检查

**检查目标**：本次提交中新增的按钮对应的点击事件处理函数

**检查逻辑**：
1. 识别新增按钮及关联的点击事件
2. 判断点击事件是否调用接口
3. 判断接口调用是否实现防重复提交（按钮禁用/防抖节流/状态锁）

**有效实现方式**：
- 按钮级：点击后禁用按钮，接口完成后解除禁用
- 函数级：使用防抖/节流函数包装（延迟≥500ms）
- 状态级：通过布尔状态锁控制

### 规则2：新增列表/详情页首次进入 loading 检查

**检查目标**：本次提交中新增的列表页、详情页

**检查逻辑**：
1. 识别新增列表/详情页
2. 判断首次进入页面是否存在 loading 状态
3. 验证 loading 逻辑的完整性（覆盖请求全生命周期）

**有效实现方式**：
- 全局 loading：调用项目封装的全局 loading 方法
- 页面级 loading：页面内 loading 组件，通过布尔状态控制
- 组件级 loading：列表/详情容器组件自带 loading 配置

### 规则3：接口操作成功后轻提示检查

**检查目标**：本次提交中新增/修改的 POST/PUT 类型接口操作逻辑

**检查逻辑**：
1. 识别目标接口操作（POST/PUT 类型）
2. 判断成功后是否存在有效轻提示
3. 验证轻提示与接口成功的关联性

**有效实现方式**：
- 调用项目通用轻提示方法（如 `message.success()`）
- 调用框架内置轻提示组件（如 `ElMessage`、`Antd Message`）
- 自定义轻提示组件，包含明确的成功提示文案

### 规则4：非 Table 组件列表空状态自定义检查

**检查目标**：本次提交中新增的列表逻辑，且未使用 Table 组件

**检查逻辑**：
1. 识别非 Table 组件的列表
2. 判断是否实现自定义空状态
3. 验证空状态的有效性

**有效实现方式**：
- 条件渲染空状态提示（如 `v-if="!list.length"`）
- 调用项目封装的通用空状态组件（如 `Empty`、`NoData`）
- 为列表容器设置默认空状态占位

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
- 工具使用 `lint-staged` 仅检查暂存区文件，不会全量检查
- 单文件检查耗时通常 ≤ 1s
- 如果仍然耗时过长，可以检查配置文件中的 `ignore` 设置，确保排除了不必要的文件

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

## 📦 依赖说明

### 核心依赖

- `@babel/parser`: JavaScript/TypeScript/JSX 代码解析
- `@babel/traverse`: AST 遍历
- `@babel/types`: AST 节点类型判断
- `chalk`: 终端颜色输出
- `glob`: 文件匹配

### 开发依赖

- `husky`: Git 钩子管理
- `lint-staged`: 仅检查暂存区文件

## 🔄 工作流程

1. 用户执行 `git commit -m "xxx"`
2. 触发 pre-commit 钩子
3. `lint-staged` 筛选暂存区中符合后缀的文件
4. 对筛选后的文件依次执行 4 项核心检查规则
5. 若所有检查通过，放行 Git 提交流程
6. 若任意一项检查不通过，终止提交流程，打印详细错误信息

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

