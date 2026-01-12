# 使用说明

## 项目结构

```
pre-commit/
├── commit-check.config.js    # 配置文件
├── commit-check-core.js      # 核心检查逻辑
├── package.json              # 项目依赖
├── lint-staged.config.js     # lint-staged 配置（保留用于扩展）
├── .husky/
│   └── pre-commit           # Git pre-commit 钩子
├── test/
│   └── test-files/          # 测试用例文件
└── README.md                # 项目文档
```

## 安装步骤

1. **安装依赖**
   ```bash
   npm install
   ```

2. **初始化 Git 仓库**（如果还没有）
   ```bash
   git init
   ```

3. **安装 Git 钩子**
   ```bash
   npm run prepare
   ```

## 使用方法

### 正常提交

执行 `git commit` 时，会自动触发检查：

```bash
git add .
git commit -m "feat: 新增功能"
```

如果代码不符合规范，提交会被拦截并显示详细的错误信息。

### 跳过检查（紧急情况）

在特殊紧急情况下，可以使用 `--no-verify` 跳过检查：

```bash
git commit --no-verify -m "紧急修复"
```

⚠️ **注意**：不建议常规使用，仅在特殊紧急场景下使用。

## 配置说明

### 启用/禁用规则

在 `commit-check.config.js` 中修改 `enabled` 字段：

```javascript
rule1: {
  enabled: true,  // true: 启用, false: 禁用
  // ...
}
```

### 配置白名单

#### 规则1：防重复提交检查

```javascript
rule1: {
  whitelist: {
    keywords: ['查看', '取消', '返回']  // 按钮文本或函数名包含这些关键词时跳过检查
  }
}
```

#### 规则2：Loading 检查

```javascript
rule2: {
  whitelist: {
    paths: ['src/utils/', 'src/components/']  // 这些路径下的文件跳过检查
  }
}
```

#### 规则3：轻提示检查

```javascript
rule3: {
  whitelist: {
    paths: [],
    keywords: ['batch', '批量']  // 批量操作关键词，跳过检查
  }
}
```

#### 规则4：空状态检查

```javascript
rule4: {
  whitelist: {
    keywords: []  // 列表关键词，跳过检查
  }
}
```

### 自定义关键词

如果项目使用了自定义的方法名、组件名，需要在配置文件中添加：

```javascript
rule1: {
  customKeywords: {
    requestMethods: ['fetch', 'axios', 'request', 'myCustomRequest']  // 自定义请求方法
  }
}

rule2: {
  customKeywords: {
    loadingMethods: ['showLoading', 'hideLoading', 'myLoading']  // 自定义 loading 方法
  }
}

rule3: {
  customKeywords: {
    successMethods: ['message.success', '$message.success', 'mySuccessTip']  // 自定义成功提示方法
  }
}

rule4: {
  customKeywords: {
    emptyComponents: ['Empty', 'NoData', 'MyEmpty']  // 自定义空状态组件
  }
}
```

## 检查规则说明

### 规则1：新增按钮接口调用防重复提交检查

**检查内容**：
- 新增的按钮（button、ElButton、Button 等）
- 点击事件中是否调用了接口
- 是否实现了防重复提交保护

**有效实现方式**：
1. 按钮禁用：`:disabled="isSubmitting"` 或 `disabled={isSubmitting}`
2. 防抖/节流：使用 `debounce` 或 `throttle` 包装（延迟≥500ms）
3. 状态锁：函数开始处检查 `if (isSubmitting) return;`，并在接口调用前后设置状态

### 规则2：新增列表/详情页首次进入 loading 检查

**检查内容**：
- 新增的列表页或详情页
- 首次进入时是否调用了数据查询接口
- 是否实现了 loading 状态

**有效实现方式**：
1. 全局 loading：`showLoading()` / `hideLoading()`
2. 页面级 loading：`<Spin spinning={loading}>` 或 `<ElLoading>`
3. 组件级 loading：`<Table loading={loading}>`

### 规则3：接口操作成功后轻提示检查

**检查内容**：
- POST/PUT 类型的接口操作
- 操作成功后是否触发了成功轻提示

**有效实现方式**：
1. `message.success('操作成功')`
2. `$message.success('操作成功')`
3. `ElMessage.success('操作成功')`
4. 其他项目封装的成功提示方法

### 规则4：非 Table 组件列表空状态自定义检查

**检查内容**：
- 未使用 Table 组件的列表
- 列表数据为空时是否展示了空状态

**有效实现方式**：
1. 条件渲染：`v-if="list.length === 0"` 或 `{list.length === 0 && <Empty />}`
2. 空状态组件：`<Empty />` 或 `<NoData />`
3. 空状态文案：显示「暂无数据」等提示

## 常见问题

### Q: 检查误报怎么办？

**A**: 可以通过以下方式解决：

1. **配置白名单**：在 `commit-check.config.js` 中添加对应的白名单配置
2. **禁用规则**：将对应规则的 `enabled` 设置为 `false`
3. **自定义关键词**：在 `customKeywords` 中添加项目特定的方法名、组件名

### Q: 如何兼容旧项目？

**A**: 
- 检查工具仅检查本次提交的新增/修改代码，不会影响已有代码
- 可以通过配置文件逐步启用规则，先启用部分规则测试
- 对于历史遗留问题，可以通过白名单配置跳过检查

### Q: 检查耗时过长怎么办？

**A**: 
- 工具使用 Git diff 仅检查暂存区文件，不会全量检查
- 单文件检查耗时通常 ≤ 1s
- 如果仍然耗时过长，可以检查配置文件中的 `ignore` 设置，确保排除了不必要的文件

### Q: 如何调试检查逻辑？

**A**: 
- 可以直接运行 `node commit-check-core.js` 查看检查结果
- 检查逻辑会输出详细的错误信息，包括文件路径、行号、问题描述和修复建议

## 测试用例

测试用例位于 `test/test-files/` 目录：

- `rule1-violation.vue` / `rule1-pass.vue` - 规则1测试用例
- `rule2-violation.tsx` / `rule2-pass.tsx` - 规则2测试用例
- `rule3-violation.js` / `rule3-pass.js` - 规则3测试用例
- `rule4-violation.vue` / `rule4-pass.vue` - 规则4测试用例

可以使用这些测试用例验证检查功能是否正常工作。

