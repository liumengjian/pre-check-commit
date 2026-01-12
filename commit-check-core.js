/**
 * Git Pre-Commit 核心检查逻辑
 * 
 * 实现4项核心检查规则：
 * 1. 新增按钮接口调用防重复提交检查
 * 2. 新增列表/详情页首次进入 loading 检查
 * 3. 接口操作成功后轻提示检查
 * 4. 非 Table 组件列表空状态自定义检查
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const chalk = require('chalk');
const { execSync } = require('child_process');

// 加载配置
let config;

// 尝试从多个位置加载配置文件
const configPaths = [
  path.join(process.cwd(), 'commit-check.config.js'), // 项目根目录
  path.join(__dirname, 'commit-check.config.js'), // 包目录
  path.resolve(__dirname, '../commit-check.config.js') // 包目录（相对路径）
];

let configLoaded = false;
for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    try {
      config = require(configPath);
      configLoaded = true;
      break;
    } catch (e) {
      // 继续尝试下一个路径
    }
  }
}

if (!configLoaded) {
  console.error(chalk.red('❌ 无法加载配置文件 commit-check.config.js'));
  console.error(chalk.yellow('💡 请确保项目根目录存在 commit-check.config.js 配置文件'));
  console.error(chalk.yellow('   或在项目根目录执行: cp node_modules/pre-commit-check/commit-check.config.js .'));
  process.exit(1);
}

/**
 * 获取 Git 暂存区文件变更
 */
function getStagedFiles() {
  try {
    const result = execSync('git diff --cached --name-only --diff-filter=AM', { encoding: 'utf-8' });
    return result.split('\n').filter(Boolean);
  } catch (e) {
    console.error(chalk.red('❌ 无法获取 Git 暂存区文件'));
    return [];
  }
}

/**
 * 获取文件的新增/修改内容（diff）
 */
function getFileDiff(filePath) {
  try {
    const result = execSync(`git diff --cached "${filePath}"`, { encoding: 'utf-8' });
    return result;
  } catch (e) {
    return '';
  }
}

/**
 * 解析文件内容
 */
function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);

  if (ext === '.vue') {
    return parseVueFile(content);
  } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    return parseJSFile(content, ext);
  } else if (ext === '.html') {
    return parseHTMLFile(content);
  }

  return null;
}

/**
 * 解析 Vue 文件
 */
function parseVueFile(content) {
  // 提取 <script> 部分
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  
  let ast = null;
  let scriptContent = '';
  
  if (scriptMatch) {
    scriptContent = scriptMatch[1];
    try {
      ast = parser.parse(scriptContent, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties']
      });
    } catch (e) {
      // 解析失败时返回 null
    }
  }

  return {
    type: 'vue',
    ast,
    scriptContent,
    template: templateMatch ? templateMatch[1] : '',
    content
  };
}

/**
 * 解析 JS/TS/JSX/TSX 文件
 */
function parseJSFile(content, ext) {
  try {
    const plugins = ['jsx', 'typescript', 'decorators-legacy', 'classProperties'];
    if (ext === '.tsx' || ext === '.jsx') {
      plugins.push('jsx');
    }
    
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins
    });

    return {
      type: ext.replace('.', ''),
      ast,
      content
    };
  } catch (e) {
    return null;
  }
}

/**
 * 解析 HTML 文件
 */
function parseHTMLFile(content) {
  return {
    type: 'html',
    content
  };
}

/**
 * 检查规则1：新增按钮接口调用防重复提交检查
 */
function checkRule1(filePath, parsed, diff) {
  if (!config.rule1.enabled) return null;

  const errors = [];
  const { type, ast, template = '', content } = parsed;

  // 检查是否在 diff 中新增了按钮
  if (!diff || !diff.includes('+') || (!diff.includes('button') && !diff.includes('Button') && !diff.includes('@click') && !diff.includes('onClick'))) {
    return null;
  }

  // 提取新增的按钮和点击事件
  // 首先从 diff 中提取新增的行
  const diffLines = diff.split('\n');
  const addedLines = [];
  let currentLineOffset = 0;
  
  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    if (line.startsWith('@@')) {
      // 解析行号信息
      const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
      if (match) {
        currentLineOffset = parseInt(match[1]) - 1;
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({ line: currentLineOffset, content: line.substring(1) });
      currentLineOffset++;
    } else if (!line.startsWith('-') && !line.startsWith('@@') && !line.startsWith('\\')) {
      currentLineOffset++;
    }
  }

  const buttonPatterns = [
    /<button[^>]*onclick=["']([^"']+)["'][^>]*>/gi,
    /<button[^>]*@click=["']([^"']+)["'][^>]*>/gi,
    /<ElButton[^>]*@click=["']([^"']+)["'][^>]*>/gi,
    /<Button[^>]*onClick=\{([^}]+)\}[^>]*>/gi
  ];

  const handlers = new Set();
  
  // 检查新增的行中是否包含按钮
  for (const addedLine of addedLines) {
    for (const pattern of buttonPatterns) {
      pattern.lastIndex = 0; // 重置正则
      const match = pattern.exec(addedLine.content);
      if (match) {
        const handlerName = match[1].trim().replace(/['"]/g, '').replace(/\(\)/g, '');
        handlers.add({ name: handlerName, line: addedLine.line });
      }
    }
  }
  
  // 如果没找到，也检查整个文件内容（兼容性处理）
  if (handlers.size === 0) {
    for (const pattern of buttonPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const handlerName = match[1].trim().replace(/['"]/g, '').replace(/\(\)/g, '');
        const lineNum = content.substring(0, match.index).split('\n').length;
        handlers.add({ name: handlerName, line: lineNum });
      }
    }
  }

  // 检查每个处理函数
  if (ast && handlers.size > 0) {
    traverse(ast, {
      FunctionDeclaration(path) {
        const funcName = path.node.id?.name;
        if (!funcName) return;
        
        handlers.forEach(handler => {
          // 匹配处理函数名（支持 handleSubmit、onSubmit、submit 等多种格式）
          const handlerName = handler.name.replace(/['"()]/g, '').trim();
          if (funcName === handlerName || 
              handlerName.includes(funcName) || 
              funcName.toLowerCase() === handlerName.toLowerCase() ||
              handlerName.toLowerCase().includes(funcName.toLowerCase())) {
            checkHandlerForRule1(path, handler, errors, filePath, parsed);
          }
        });
      },
      FunctionExpression(path) {
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          const funcName = parent.id.name;
          handlers.forEach(handler => {
            const handlerName = handler.name.replace(/['"()]/g, '').trim();
            if (funcName === handlerName || 
                handlerName.includes(funcName) || 
                funcName.toLowerCase() === handlerName.toLowerCase()) {
              checkHandlerForRule1(path, handler, errors, filePath, parsed);
            }
          });
        }
      },
      ArrowFunctionExpression(path) {
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          const funcName = parent.id.name;
          handlers.forEach(handler => {
            const handlerName = handler.name.replace(/['"()]/g, '').trim();
            if (funcName === handlerName || 
                handlerName.includes(funcName) || 
                funcName.toLowerCase() === handlerName.toLowerCase()) {
              checkHandlerForRule1(path, handler, errors, filePath, parsed);
            }
          });
        }
      },
      // 检查 Vue methods 中的函数
      ObjectMethod(path) {
        const funcName = path.node.key?.name;
        if (!funcName) return;
        
        handlers.forEach(handler => {
          const handlerName = handler.name.replace(/['"()]/g, '').trim();
          if (funcName === handlerName || 
              handlerName.includes(funcName) || 
              funcName.toLowerCase() === handlerName.toLowerCase()) {
            checkHandlerForRule1(path, handler, errors, filePath, parsed);
          }
        });
      }
    });
  }

  return errors.length > 0 ? errors : null;
}

/**
 * 检查处理函数是否符合规则1
 */
function checkHandlerForRule1(path, handler, errors, filePath, parsed) {
  const funcName = handler.name;
  
  // 检查白名单
  const whitelistKeywords = config.rule1.whitelist.keywords || [];
  if (whitelistKeywords.some(keyword => funcName.includes(keyword))) {
    return;
  }

  let hasApiCall = false;
  let hasProtection = false;

  // 检查是否有接口调用
  const requestMethods = config.rule1.customKeywords.requestMethods || ['fetch', 'axios', 'request'];
  
  // 检查函数开始处是否有状态锁检查（如 if (isSubmitting) return;）
  const funcBody = path.node.body;
  if (t.isBlockStatement(funcBody) && funcBody.body.length > 0) {
    const firstStmt = funcBody.body[0];
    if (t.isIfStatement(firstStmt)) {
      const test = firstStmt.test;
      if (t.isIdentifier(test) || 
          (t.isUnaryExpression(test) && t.isIdentifier(test.argument)) ||
          (t.isBinaryExpression(test) && t.isIdentifier(test.left))) {
        const varName = t.isIdentifier(test) ? test.name : 
                       (t.isUnaryExpression(test) ? test.argument.name : test.left.name);
        if (varName && (varName.includes('Submitting') || varName.includes('Loading') || 
            varName.includes('loading') || varName.includes('submitting'))) {
          hasProtection = true; // 函数开始处有状态锁检查
        }
      }
    }
  }

  traverse(path.node, {
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      const methodName = getMethodName(callee);
      
      if (requestMethods.some(method => methodName.includes(method) || methodName.includes('post') || methodName.includes('put'))) {
        hasApiCall = true;
        
        // 检查是否有防重复提交保护
        // 1. 检查是否有防抖/节流包装
        // 2. 检查是否有状态锁
        
        // 检查防抖/节流
        let currentPath = callPath;
        while (currentPath.parent) {
          if (t.isCallExpression(currentPath.parent)) {
            const parentCallee = getMethodName(currentPath.parent.node.callee);
            if (parentCallee.includes('debounce') || parentCallee.includes('throttle')) {
              // 检查延迟时间
              const args = currentPath.parent.node.arguments;
              if (args.length >= 2) {
                const delay = args[1];
                if (t.isNumericLiteral(delay) && delay.value >= 500) {
                  hasProtection = true;
                  break;
                } else if (t.isIdentifier(delay)) {
                  // 延迟时间可能是变量，暂时认为有保护
                  hasProtection = true;
                  break;
                }
              } else {
                // 没有延迟参数，但使用了防抖/节流，认为有保护
                hasProtection = true;
                break;
              }
            }
          }
          currentPath = currentPath.parentPath;
        }
        
        // 检查状态锁（在接口调用前后）
        const parentFunc = callPath.findParent(p => p.isFunction());
        if (parentFunc && t.isBlockStatement(parentFunc.node.body)) {
          const statements = parentFunc.node.body.body;
          const callIndex = statements.findIndex(s => {
            if (t.isExpressionStatement(s)) {
              return s.expression === callPath.node || 
                     (t.isCallExpression(s.expression) && s.expression === callPath.node);
            }
            return false;
          });
          
          if (callIndex >= 0) {
            // 检查调用前是否有状态锁设为 true
            for (let i = 0; i < callIndex; i++) {
              const stmt = statements[i];
              if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
                const left = stmt.expression.left;
                const right = stmt.expression.right;
                if (t.isIdentifier(left)) {
                  const varName = left.name;
                  if ((varName.includes('Submitting') || varName.includes('Loading') || 
                       varName.includes('loading') || varName.includes('submitting')) &&
                      (t.isBooleanLiteral(right) && right.value === true ||
                       t.isUnaryExpression(right) && right.operator === '!' && 
                       t.isBooleanLiteral(right.argument) && right.argument.value === false)) {
                    // 检查调用后是否有状态锁设为 false（在 then/catch/finally 中）
                    // 检查后续语句或 then/catch 回调
                    hasProtection = true; // 暂时认为有保护，更详细的检查需要分析 Promise 链
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  
  // 检查模板中是否有 disabled 绑定（对于 Vue 文件）
  if (parsed.template) {
    const handlerName = handler.name.replace(/['"()]/g, '').trim();
    const disabledPattern = new RegExp(`disabled.*${handlerName}|${handlerName}.*disabled`, 'i');
    if (disabledPattern.test(parsed.template) || parsed.template.includes(':disabled') || parsed.template.includes('v-bind:disabled')) {
      hasProtection = true;
    }
  }

  if (hasApiCall && !hasProtection) {
    const line = handler.line || path.node.loc?.start.line || 0;
    errors.push({
      rule: 1,
      file: filePath,
      line: line,
      message: `新增按钮「${funcName}」的点击事件中调用了接口，但未实现防重复提交逻辑`,
      suggestion: '1. 增加按钮禁用状态绑定；2. 使用防抖函数包装接口调用（延迟≥500ms）；3. 增加布尔状态锁控制重复提交'
    });
  }
}

/**
 * 检查规则2：新增列表/详情页首次进入 loading 检查
 */
function checkRule2(filePath, parsed, diff) {
  if (!config.rule2.enabled) return null;

  const errors = [];
  const { type, ast, template = '', content } = parsed;

  // 检查是否是新增文件或新增了初始化逻辑
  const isNewFile = !diff || !diff.includes('---') || diff.match(/^\+/m);
  const hasInitLogic = diff && (diff.includes('created') || diff.includes('mounted') || 
                       diff.includes('useEffect') || diff.includes('componentDidMount'));

  if (!isNewFile && !hasInitLogic) {
    return null;
  }

  // 检查是否是列表页或详情页
  const isListPage = (template && (template.includes('el-table') || template.includes('<Table'))) || 
                     content.includes('.map(') || content.includes('v-for');
  const isDetailPage = content.includes('getDetail') || content.includes('fetchDetail') || 
                       content.includes('queryDetail') || content.includes('详情');

  if (!isListPage && !isDetailPage) {
    return null;
  }

  // 检查白名单
  const whitelistPaths = config.rule2.whitelist.paths || [];
  if (whitelistPaths.some(pattern => filePath.includes(pattern))) {
    return null;
  }

  if (ast) {
    let hasApiCall = false;
    let hasLoading = false;

    traverse(ast, {
      CallExpression(callPath) {
        const callee = callPath.node.callee;
        const methodName = getMethodName(callee);
        
        // 检查是否有接口调用
        const requestMethods = ['fetch', 'axios', 'request', 'get', 'post', 'put', 'delete'];
        if (requestMethods.some(method => methodName.includes(method))) {
          hasApiCall = true;
          
          // 检查是否有 loading
          const loadingMethods = config.rule2.customKeywords.loadingMethods || 
                                ['showLoading', 'hideLoading', 'loading', 'setLoading'];
          
          // 检查父级作用域
          const parentFunc = callPath.findParent(p => p.isFunction());
          if (parentFunc) {
            const funcBody = parentFunc.node.body;
            if (t.isBlockStatement(funcBody)) {
              const statements = funcBody.body;
              const callIndex = statements.findIndex(s => 
                s === callPath.node || (t.isExpressionStatement(s) && s.expression === callPath.node)
              );
              
              // 检查调用前是否有 showLoading
              for (let i = 0; i < callIndex; i++) {
                const stmt = statements[i];
                if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
                  const stmtMethod = getMethodName(stmt.expression.callee);
                  if (loadingMethods.some(m => stmtMethod.includes(m))) {
                    hasLoading = true;
                    break;
                  }
                }
              }
              
              // 检查调用后是否有 hideLoading（在 then/catch 中）
              if (t.isCallExpression(callPath.node) && 
                  (t.isMemberExpression(callPath.parent) || t.isVariableDeclarator(callPath.parent))) {
                // 检查是否有 .then() 或 .catch()
                const memberExpr = callPath.findParent(p => p.isMemberExpression());
                if (memberExpr) {
                  const prop = memberExpr.node.property;
                  if (t.isIdentifier(prop) && (prop.name === 'then' || prop.name === 'catch')) {
                    hasLoading = true;
                  }
                }
              }
            }
          }
        }
      }
    });

    if (hasApiCall && !hasLoading) {
      errors.push({
        rule: 2,
        file: filePath,
        line: ast.loc?.start.line || 0,
        message: `新增${isListPage ? '列表页' : '详情页'}首次进入时调用了数据查询接口，但未实现有效的 loading 展示与隐藏逻辑`,
        suggestion: '1. 使用全局 loading 方法包裹接口调用；2. 增加页面级 Spin 组件，绑定 isLoading 状态；3. 配置表格组件自带 loading 属性'
      });
    }
  }

  return errors.length > 0 ? errors : null;
}

/**
 * 检查规则3：接口操作成功后轻提示检查
 */
function checkRule3(filePath, parsed, diff) {
  if (!config.rule3.enabled) return null;

  const errors = [];
  const { type, ast, content } = parsed;

  if (!ast) return null;

  // 检查是否有 POST/PUT 类型的接口调用
  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      const methodName = getMethodName(callee);
      
      // 检查是否是 POST/PUT 请求
      const isPostPut = methodName.includes('post') || methodName.includes('put') || 
                        methodName.includes('POST') || methodName.includes('PUT') ||
                        (methodName.includes('request') && callPath.node.arguments.some(arg => {
                          if (t.isObjectExpression(arg)) {
                            return arg.properties.some(prop => {
                              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && 
                                  (prop.key.name === 'method' || prop.key.name === 'type')) {
                                const value = prop.value;
                                if (t.isStringLiteral(value)) {
                                  return value.value.toUpperCase() === 'POST' || value.value.toUpperCase() === 'PUT';
                                }
                              }
                              return false;
                            });
                          }
                          return false;
                        }));

      if (isPostPut) {
        // 检查操作关键词
        const parentFunc = callPath.findParent(p => p.isFunction());
        const funcName = parentFunc && parentFunc.node.id ? parentFunc.node.id.name : '';
        const hasOperationKeyword = ['add', 'create', 'delete', 'remove', 'edit', 'update', 'batch']
          .some(keyword => funcName.toLowerCase().includes(keyword));

        // 检查白名单
        const whitelistKeywords = config.rule3.whitelist.keywords || [];
        if (whitelistKeywords.some(keyword => funcName.includes(keyword))) {
          return;
        }

        if (hasOperationKeyword || isPostPut) {
          // 检查成功回调中是否有轻提示
          let hasSuccessTip = false;
          
          // 检查 .then() 回调
          const memberExpr = callPath.findParent(p => p.isMemberExpression());
          if (memberExpr && t.isCallExpression(memberExpr.parent)) {
            const thenCall = memberExpr.parent;
            if (t.isIdentifier(memberExpr.node.property) && memberExpr.node.property.name === 'then') {
              const successCallback = thenCall.arguments[0];
              if (successCallback) {
                hasSuccessTip = checkForSuccessTip(successCallback);
              }
            }
          }
          
          // 检查 async/await 后的代码
          if (!hasSuccessTip && parentFunc && parentFunc.node.async) {
            const funcBody = parentFunc.node.body;
            if (t.isBlockStatement(funcBody)) {
              const callIndex = funcBody.body.findIndex(s => 
                s === callPath.node || (t.isExpressionStatement(s) && s.expression === callPath.node)
              );
              
              // 检查调用后的语句
              for (let i = callIndex + 1; i < funcBody.body.length; i++) {
                const stmt = funcBody.body[i];
                if (checkStatementForSuccessTip(stmt)) {
                  hasSuccessTip = true;
                  break;
                }
              }
            }
          }

          if (!hasSuccessTip) {
            const line = callPath.node.loc?.start.line || 0;
            errors.push({
              rule: 3,
              file: filePath,
              line: line,
              message: `${methodName.includes('post') || methodName.includes('POST') ? 'POST' : 'PUT'} 类型接口（${hasOperationKeyword ? '业务操作' : '数据操作'}）操作成功后，未触发有效的成功轻提示`,
              suggestion: '1. 调用 message.success(\'操作成功\')；2. 集成项目通用成功提示方法；3. 若有页面跳转，确保目标页面包含成功提示'
            });
          }
        }
      }
    }
  });

  return errors.length > 0 ? errors : null;
}

/**
 * 检查回调函数中是否有成功提示
 */
function checkForSuccessTip(callback) {
  const successMethods = config.rule3.customKeywords.successMethods || 
                        ['message.success', '$message.success', 'showSuccessTip', 'ElMessage.success', 'Message.success'];
  
  if (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) {
    const body = callback.body;
    if (t.isBlockStatement(body)) {
      for (const stmt of body.body) {
        if (checkStatementForSuccessTip(stmt)) {
          return true;
        }
      }
    } else if (t.isCallExpression(body)) {
      return checkStatementForSuccessTip(t.expressionStatement(body));
    }
  }
  
  return false;
}

/**
 * 检查语句中是否有成功提示
 */
function checkStatementForSuccessTip(stmt) {
  const successMethods = config.rule3.customKeywords.successMethods || 
                        ['message.success', '$message.success', 'showSuccessTip', 'ElMessage.success', 'Message.success'];
  
  if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
    const methodName = getMethodName(stmt.expression.callee);
    if (successMethods.some(m => methodName.includes(m))) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查规则4：非 Table 组件列表空状态自定义检查
 */
function checkRule4(filePath, parsed, diff) {
  if (!config.rule4.enabled) return null;

  const errors = [];
  const { type, ast, template = '', content } = parsed;

  // 检查是否使用了 Table 组件
  const hasTableComponent = (template && (template.includes('el-table') || template.includes('<Table'))) || 
                            content.includes('ElTable') || content.includes('Table') ||
                            (content.includes('antd') && content.includes('Table'));

  if (hasTableComponent) {
    return null; // 使用了 Table 组件，跳过检查
  }

  // 检查是否有列表渲染
  const hasListRender = (template && template.includes('v-for')) || content.includes('.map(') || 
                        content.includes('forEach') || content.includes('for (');

  if (!hasListRender) {
    return null;
  }

  // 检查白名单
  const whitelistKeywords = config.rule4.whitelist.keywords || [];
  if (whitelistKeywords.some(keyword => content.includes(keyword))) {
    return null;
  }

  // 检查是否有空状态处理
  const emptyComponents = config.rule4.customKeywords.emptyComponents || ['Empty', 'NoData', 'EmptyTip'];
  const hasEmptyState = (template && (template.includes('暂无数据') || template.includes('暂无'))) ||
                       content.includes('暂无数据') || content.includes('暂无') ||
                       emptyComponents.some(comp => (template && template.includes(comp)) || content.includes(comp)) ||
                       (template && (template.includes('v-if="!') || template.includes('v-if="list.length === 0'))) ||
                       content.includes('length === 0') || content.includes('!list') ||
                       content.includes('list.length === 0');

  if (!hasEmptyState) {
    const line = ast?.loc?.start.line || 1;
    errors.push({
      rule: 4,
      file: filePath,
      line: line,
      message: '该列表未使用 Table 组件，且未实现列表数据为空时的自定义空状态展示',
      suggestion: '1. 条件渲染「暂无数据」文案；2. 引入项目通用 Empty 组件；3. 配置空状态占位图与引导文案'
    });
  }

  return errors.length > 0 ? errors : null;
}

/**
 * 获取方法名
 */
function getMethodName(callee) {
  if (t.isIdentifier(callee)) {
    return callee.name;
  } else if (t.isMemberExpression(callee)) {
    const object = t.isIdentifier(callee.object) ? callee.object.name : 
                   t.isMemberExpression(callee.object) ? getMethodName(callee.object) : '';
    const property = t.isIdentifier(callee.property) ? callee.property.name : '';
    return `${object}.${property}`;
  } else if (t.isCallExpression(callee)) {
    return getMethodName(callee.callee);
  }
  return '';
}

/**
 * 主检查函数
 */
function runChecks() {
  const stagedFiles = getStagedFiles();
  const allErrors = [];

  // 过滤需要检查的文件
  const fileExtensions = config.global.fileExtensions || ['.html', '.js', '.ts', '.vue', '.jsx', '.tsx'];
  const ignorePatterns = config.global.ignore || ['node_modules/**', 'dist/**', 'build/**'];

  const filesToCheck = stagedFiles.filter(file => {
    const ext = path.extname(file);
    if (!fileExtensions.includes(ext)) {
      return false;
    }
    
    // 检查忽略模式
    for (const pattern of ignorePatterns) {
      if (file.includes(pattern.replace('/**', ''))) {
        return false;
      }
    }
    
    return true;
  });

  if (filesToCheck.length === 0) {
    console.log(chalk.green('✓ 暂存区没有需要检查的文件'));
    return true;
  }

  console.log(chalk.blue(`\n🔍 开始检查 ${filesToCheck.length} 个文件...\n`));

  for (const file of filesToCheck) {
    if (!fs.existsSync(file)) {
      continue;
    }

    try {
      const parsed = parseFile(file);
      if (!parsed) {
        continue;
      }

      const diff = getFileDiff(file);

      // 执行4项规则检查
      const errors1 = checkRule1(file, parsed, diff);
      const errors2 = checkRule2(file, parsed, diff);
      const errors3 = checkRule3(file, parsed, diff);
      const errors4 = checkRule4(file, parsed, diff);

      if (errors1) allErrors.push(...errors1);
      if (errors2) allErrors.push(...errors2);
      if (errors3) allErrors.push(...errors3);
      if (errors4) allErrors.push(...errors4);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  检查文件 ${file} 时出错: ${error.message}`));
    }
  }

  // 输出错误信息
  if (allErrors.length > 0) {
    console.log(chalk.red('\n❌ 代码检查未通过，发现以下问题：\n'));
    
    allErrors.forEach((error, index) => {
      console.log(chalk.red(`【规则 ${error.rule} 不通过】- ${getRuleName(error.rule)}`));
      console.log(chalk.white(`文件：${error.file}`));
      console.log(chalk.white(`行号：${error.line}`));
      console.log(chalk.yellow(`问题：${error.message}`));
      console.log(chalk.cyan(`修复建议：${error.suggestion}`));
      if (index < allErrors.length - 1) {
        console.log('');
      }
    });

    console.log(chalk.red('\n请修复上述问题后重新提交。'));
    console.log(chalk.gray('提示：如需跳过检查（紧急情况），可使用 git commit --no-verify\n'));
    return false;
  }

  console.log(chalk.green('\n✓ 所有检查通过！\n'));
  return true;
}

/**
 * 获取规则名称
 */
function getRuleName(ruleNum) {
  const names = {
    1: '防重复提交缺失',
    2: '首次进入页面缺失 loading 状态',
    3: '接口操作成功后缺失轻提示',
    4: '非 Table 列表缺失自定义空状态'
  };
  return names[ruleNum] || '未知规则';
}

// 如果直接运行此文件，执行检查
if (require.main === module) {
  const success = runChecks();
  process.exit(success ? 0 : 1);
}

module.exports = { runChecks };

