/**
 * Git Pre-Commit 核心检查逻辑
 * 
 * 实现5项核心检查规则：
 * 1. 新增按钮接口调用防重复提交检查
 * 2. 新增列表/详情页首次进入 loading 检查
 * 3. 接口操作成功后轻提示检查
 * 4. 非 Table 组件列表空状态自定义检查
 * 5. 表单输入项默认提示检查
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const chalk = require('chalk');
const { execSync } = require('child_process');
const glob = require('glob');

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
 * AST工具函数：安全地检查代码模式，避免匹配到注释、字符串等
 */
const ASTUtils = {
  /**
   * 移除代码中的注释和字符串，返回纯代码文本
   */
  removeCommentsAndStrings(code) {
    let result = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let inSingleComment = false;
    let inMultiComment = false;
    let i = 0;
    
    while (i < code.length) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : '';
      const nextChar = i < code.length - 1 ? code[i + 1] : '';
      
      // 处理字符串
      if (!inSingleComment && !inMultiComment) {
        if (char === "'" && prevChar !== '\\' && !inDoubleQuote && !inTemplate) {
          inSingleQuote = !inSingleQuote;
          result += ' '; // 替换引号为空格
          i++;
          continue;
        } else if (char === '"' && prevChar !== '\\' && !inSingleQuote && !inTemplate) {
          inDoubleQuote = !inDoubleQuote;
          result += ' '; // 替换引号为空格
          i++;
          continue;
        } else if (char === '`' && prevChar !== '\\' && !inSingleQuote && !inDoubleQuote) {
          inTemplate = !inTemplate;
          result += ' '; // 替换反引号为空格
          i++;
          continue;
        }
      }
      
      // 处理注释
      if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
        if (char === '/' && nextChar === '/' && !inMultiComment) {
          inSingleComment = true;
          result += ' '; // 替换注释开始为空格
          i++;
          continue;
        } else if (char === '/' && nextChar === '*' && !inSingleComment) {
          inMultiComment = true;
          result += ' '; // 替换注释开始为空格
          i += 2; // 跳过 /*
          continue;
        } else if (char === '*' && nextChar === '/' && inMultiComment) {
          inMultiComment = false;
          result += ' '; // 替换注释结束为空格
          i += 2; // 跳过 */
          continue;
        } else if (char === '\n' && inSingleComment) {
          inSingleComment = false;
          result += '\n';
          i++;
          continue;
        }
      }
      
      // 如果在注释或字符串中，替换为空格
      if (inSingleComment || inMultiComment || inSingleQuote || inDoubleQuote || inTemplate) {
        result += ' ';
      } else {
        result += char;
      }
      
      i++;
    }
    
    return result;
  },

  /**
   * 获取方法名（辅助函数）
   */
  getMethodName(callee) {
    if (t.isIdentifier(callee)) {
      return callee.name;
    } else if (t.isMemberExpression(callee)) {
      const object = this.getMethodName(callee.object);
      const property = this.getMethodName(callee.property);
      return `${object}.${property}`;
    } else if (t.isCallExpression(callee)) {
      return this.getMethodName(callee.callee) + '()';
    }
    return '';
  },

  /**
   * 使用AST检查代码中是否包含某个模式（避免匹配注释和字符串）
   */
  checkPatternInAST(ast, pattern) {
    if (!ast) return false;
    
    const self = this;
    let found = false;
    traverse(ast, {
      // 检查标识符
      Identifier(path) {
        if (pattern.test(path.node.name)) {
          found = true;
          path.stop();
        }
      },
      // 检查字符串字面量（但排除注释）
      StringLiteral(path) {
        if (pattern.test(path.node.value)) {
          found = true;
          path.stop();
        }
      },
      // 检查模板字面量
      TemplateLiteral(path) {
        path.node.quasis.forEach(quasi => {
          if (pattern.test(quasi.value.raw)) {
            found = true;
            path.stop();
          }
        });
      },
      // 检查成员表达式（如 .map(, .length）
      MemberExpression(path) {
        if (t.isIdentifier(path.node.property)) {
          if (pattern.test(path.node.property.name)) {
            found = true;
            path.stop();
          }
        }
      },
      // 检查调用表达式
      CallExpression(path) {
        const methodName = self.getMethodName(path.node.callee);
        if (pattern.test(methodName)) {
          found = true;
          path.stop();
        }
      }
    });
    
    return found;
  },

  /**
   * 检查代码中是否包含某个关键词（使用AST，避免匹配注释和字符串）
   */
  hasKeyword(ast, content, keywords) {
    if (!ast && !content) return false;
    
    // 如果有关键词数组，检查每个关键词
    if (Array.isArray(keywords)) {
      return keywords.some(keyword => this.hasKeyword(ast, content, keyword));
    }
    
    const keyword = keywords;
    const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    
    // 优先使用AST检查（排除字符串字面量）
    if (ast) {
      const self = this;
      let found = false;
      traverse(ast, {
        // 检查标识符（变量名、函数名等）
        Identifier(path) {
          if (pattern.test(path.node.name)) {
            found = true;
            path.stop();
          }
        },
        // 检查成员表达式的属性名（如 .map, .length）
        MemberExpression(path) {
          if (t.isIdentifier(path.node.property)) {
            if (pattern.test(path.node.property.name)) {
              found = true;
              path.stop();
            }
          }
        },
        // 检查调用表达式的方法名
        CallExpression(path) {
          const methodName = self.getMethodName(path.node.callee);
          if (pattern.test(methodName)) {
            found = true;
            path.stop();
          }
        },
        // 跳过字符串字面量和模板字面量（避免匹配字符串内容）
        StringLiteral(path) {
          // 不检查字符串内容
        },
        TemplateLiteral(path) {
          // 不检查模板字符串内容
        }
      });
      if (found) return true;
    }
    
    // 回退到字符串检查（但移除注释和字符串）
    if (content) {
      const cleanContent = this.removeCommentsAndStrings(content);
      return pattern.test(cleanContent);
    }
    
    return false;
  },

  /**
   * 检查代码中是否包含某个方法调用（使用AST）
   */
  hasMethodCall(ast, methodName) {
    if (!ast) return false;
    
    const self = this;
    let found = false;
    const methodNameLower = methodName.toLowerCase();
    
    traverse(ast, {
      CallExpression(path) {
        const method = self.getMethodName(path.node.callee);
        if (method.toLowerCase().includes(methodNameLower)) {
          found = true;
          path.stop();
        }
      }
    });
    
    return found;
  },

  /**
   * 检查代码中是否包含某个JSX组件（使用AST）
   */
  hasJSXComponent(ast, componentName) {
    if (!ast) return false;
    
    let found = false;
    
    traverse(ast, {
      JSXOpeningElement(path) {
        const elementName = path.node.name;
        let name = '';
        
        if (t.isJSXIdentifier(elementName)) {
          name = elementName.name;
        } else if (t.isJSXMemberExpression(elementName)) {
          const object = elementName.object;
          const property = elementName.property;
          if (t.isJSXIdentifier(object) && t.isJSXIdentifier(property)) {
            name = `${object.name}.${property.name}`;
          }
        }
        
        if (name === componentName || name.toLowerCase() === componentName.toLowerCase()) {
          found = true;
          path.stop();
        }
      }
    });
    
    return found;
  }
};

/**
 * 检查规则1：新增按钮接口调用防重复提交检查
 */
function checkRule1(filePath, parsed, diff) {
  if (!config.rule1.enabled) return null;

  const errors = [];
  const { type, ast, template = '', content } = parsed;

  // 检查是否在 diff 中新增了按钮，或者检查所有按钮（如果文件是新增的）
  const isNewFile = !diff || !diff.includes('---') || (diff && diff.split('\n').filter(l => l.startsWith('+++')).length > 0);
  
  // 使用AST检查是否有按钮相关代码（避免匹配注释和字符串）
  let hasNewButton = false;
  if (diff && diff.includes('+')) {
    // 从diff中提取新增的代码行
    const diffLines = diff.split('\n');
    const addedCode = diffLines
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.substring(1))
      .join('\n');
    
    // 移除注释和字符串后检查
    const cleanDiff = ASTUtils.removeCommentsAndStrings(addedCode);
    const buttonKeywords = ['button', 'Button', '@click', 'onClick', 'onOk', 'onConfirm', 'onFinish', 'htmlType', 'Modal', 'Drawer', 'Popconfirm', 'Form'];
    hasNewButton = buttonKeywords.some(keyword => {
      const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return pattern.test(cleanDiff);
    });
    
    // 如果AST可用，也使用AST检查
    if (ast && !hasNewButton) {
      hasNewButton = ASTUtils.hasJSXComponent(ast, 'Button') ||
                     ASTUtils.hasJSXComponent(ast, 'Modal') ||
                     ASTUtils.hasJSXComponent(ast, 'Drawer') ||
                     ASTUtils.hasJSXComponent(ast, 'Popconfirm') ||
                     ASTUtils.hasJSXComponent(ast, 'Form') ||
                     ASTUtils.hasKeyword(ast, content, ['onClick', 'onOk', 'onConfirm', 'onFinish', 'htmlType']);
    }
  }

  // 如果既不是新文件，也没有新增按钮，则跳过检查
  if (!isNewFile && !hasNewButton) {
    return null;
  }

  // 提取按钮和点击事件（包括 Modal、Drawer、Form 等组件的确认按钮）
  const buttonPatterns = [
    /<button[^>]*onclick=["']([^"']+)["'][^>]*>/gi,
    /<button[^>]*@click=["']([^"']+)["'][^>]*>/gi,
    /<ElButton[^>]*@click=["']([^"']+)["'][^>]*>/gi,
    /<Button[^>]*onClick=\{([^}]+)\}[^>]*>/gi,
    // Modal、Drawer 等组件的 onOk 属性（支持多行）
    /<Modal[\s\S]*?onOk\s*=\s*\{([^}]+)\}/gi,
    /<Drawer[\s\S]*?onOk\s*=\s*\{([^}]+)\}/gi,
    /<Popconfirm[\s\S]*?onConfirm\s*=\s*\{([^}]+)\}/gi,
    // Form 组件的 onFinish 属性（支持多行）
    /<Form[\s\S]*?onFinish\s*=\s*\{([^}]+)\}/gi
  ];

  const handlers = new Set();
  
  // 移除注释，避免匹配到注释中的代码
  const removeComments = (text) => {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* */ 注释
      .replace(/\/\/.*$/gm, ''); // 移除 // 注释
  };
  
  const contentWithoutComments = removeComments(content);

  // 如果是新文件，检查整个文件内容（跳过注释）
  if (isNewFile) {
    // 直接在原始内容中匹配，但检查是否在注释中
    for (const pattern of buttonPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const matchStart = match.index;
        const beforeMatch = content.substring(0, matchStart);
        
        // 检查是否在多行注释中
        const lastMultiCommentStart = beforeMatch.lastIndexOf('/*');
        const lastMultiCommentEnd = beforeMatch.lastIndexOf('*/');
        const isInMultiComment = lastMultiCommentStart > lastMultiCommentEnd;
        
        // 检查是否在单行注释中
        const linesBeforeMatch = beforeMatch.split('\n');
        const currentLine = linesBeforeMatch[linesBeforeMatch.length - 1];
        const commentStartInLine = currentLine.indexOf('//');
        const matchStartInLine = matchStart - (beforeMatch.lastIndexOf('\n') + 1);
        const isInSingleComment = commentStartInLine !== -1 && commentStartInLine < matchStartInLine;
        
        // 如果不在注释中，才添加handler
        if (!isInMultiComment && !isInSingleComment) {
          const handlerName = match[1].trim().replace(/['"]/g, '').replace(/\(\)/g, '');
          const lineNum = linesBeforeMatch.length;
          handlers.add({ name: handlerName, line: lineNum });
        }
      }
    }
  } else if (hasNewButton && diff) {
    // 如果只是新增了按钮，从 diff 中提取新增的行
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

    // 检查新增的行中是否包含按钮（移除注释后）
    for (const addedLine of addedLines) {
      const lineWithoutComments = removeComments(addedLine.content);
      // 如果移除注释后内容为空，说明整行都是注释，跳过
      if (!lineWithoutComments.trim()) continue;
      
      for (const pattern of buttonPatterns) {
        pattern.lastIndex = 0; // 重置正则
        const match = pattern.exec(lineWithoutComments);
        if (match) {
          const handlerName = match[1].trim().replace(/['"]/g, '').replace(/\(\)/g, '');
          handlers.add({ name: handlerName, line: addedLine.line });
        }
      }
    }
  }

  // 检查每个处理函数（对同一个handler只检查一次）
  const checkedHandlers = new Set(); // 记录已经检查过的handler名称
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
            // 对同一个handler只检查一次
            if (!checkedHandlers.has(handlerName)) {
              checkedHandlers.add(handlerName);
              checkHandlerForRule1(path, handler, errors, filePath, parsed);
            }
          }
        });
      },
      FunctionExpression(path) {
        const parent = path.parent;
        if (parent && t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          const funcName = parent.id.name;
          handlers.forEach(handler => {
            const handlerName = handler.name.replace(/['"()]/g, '').trim();
            if (funcName === handlerName ||
              handlerName.includes(funcName) ||
              funcName.toLowerCase() === handlerName.toLowerCase()) {
              // 对同一个handler只检查一次
              if (!checkedHandlers.has(handlerName)) {
                checkedHandlers.add(handlerName);
                checkHandlerForRule1(path, handler, errors, filePath, parsed);
              }
            }
          });
        }
      },
      ArrowFunctionExpression(path) {
        const parent = path.parent;
        // 支持 const onSave = () => {} 和 const onSave = async () => {}
        if (parent && t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          const funcName = parent.id.name;
          handlers.forEach(handler => {
            const handlerName = handler.name.replace(/['"()]/g, '').trim();
            if (funcName === handlerName ||
              handlerName.includes(funcName) ||
              funcName.toLowerCase() === handlerName.toLowerCase()) {
              // 对同一个handler只检查一次
              if (!checkedHandlers.has(handlerName)) {
                checkedHandlers.add(handlerName);
                checkHandlerForRule1(path, handler, errors, filePath, parsed);
              }
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
            // 对同一个handler只检查一次
            if (!checkedHandlers.has(handlerName)) {
              checkedHandlers.add(handlerName);
              checkHandlerForRule1(path, handler, errors, filePath, parsed);
            }
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

  // 获取AST（如果可用）
  const ast = parsed.ast || null;

  let hasApiCall = false;
  let hasProtection = false;
  // 用于检查问题1和问题2的变量
  let definedButNotUsed = false;
  let usedWrongLoading = false;
  let correctLoadingName = null;
  let foundModalOrDrawerWithoutLoading = false; // 标记是否找到 Modal/Drawer/Form 但没有 loading（在函数开始时初始化）

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

  // 使用 path.traverse 而不是独立的 traverse，这样可以正确传递 scope 和 parentPath
  let loadingVarName = null; // 记录loading变量名

  // 首先检查模板中是否有loading绑定
  if (parsed.template) {
    const handlerName = handler.name.replace(/['"()]/g, '').trim();
    // 检查按钮是否有loading属性绑定
    const loadingPatterns = [
      new RegExp(`<[^>]*${handlerName}[^>]*:loading`, 'i'),
      new RegExp(`<[^>]*${handlerName}[^>]*loading=`, 'i'),
      new RegExp(`<[^>]*loading.*${handlerName}`, 'i'),
      // 检查 Button 组件的 loading 属性（只要Button有loading属性即可，不关心位置）
      new RegExp(`<Button[\\s\\S]*?loading\\s*=\\s*\\{([^}]+)\\}`, 'i')
    ];

    for (const pattern of loadingPatterns) {
      const match = parsed.template.match(pattern);
      if (match) {
        // 提取loading变量名
        if (match[1]) {
          loadingVarName = match[1].trim().replace(/['"{}]/g, '');
        }
        break;
      }
    }
  }

  path.traverse({
    CallExpression(callPath) {
      // 使用新的 isApiCall 函数检测接口调用
      if (isApiCall(callPath)) {
        hasApiCall = true;

        // 检查是否有防重复提交保护
        // 1. 检查是否有防抖/节流包装
        // 2. 检查是否有状态锁
        // 3. 检查是否有loading状态管理（新增：接口调用前设置loading为true，调用后设置为false）

        // 检查防抖/节流
        let currentPath = callPath;
        while (currentPath && currentPath.parentPath) {
          const parentNode = currentPath.parentPath.node;
          if (parentNode && t.isCallExpression(parentNode)) {
            const parentCallee = getMethodName(parentNode.callee);
            if (parentCallee.includes('debounce') || parentCallee.includes('throttle')) {
              // 检查延迟时间
              const args = parentNode.arguments;
              if (args && args.length >= 2) {
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
          if (!currentPath) break;
        }

        // 检查loading状态管理（新增逻辑）
        const parentFunc = callPath.findParent(p => p.isFunction());
        if (parentFunc && t.isBlockStatement(parentFunc.node.body)) {
          const statements = parentFunc.node.body.body;

          // 查找接口调用在函数体中的位置
          let callIndex = -1;
          for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            // 检查是否是包含接口调用的语句
            if (t.isExpressionStatement(stmt)) {
              // 直接匹配
              if (stmt.expression === callPath.node) {
                callIndex = i;
                break;
              }
              // 检查是否是 CallExpression
              if (t.isCallExpression(stmt.expression)) {
                // 检查是否是接口调用本身
                if (stmt.expression === callPath.node) {
                  callIndex = i;
                  break;
                }
                // 检查是否是链式调用，如 fetch().then() 或 props.xxxAction().then()
                // 需要递归查找整个表达式树，找到接口调用
                const findCallInExpression = (expr) => {
                  if (!expr) return false;
                  // 直接匹配
                  if (expr === callPath.node) return true;
                  // 如果是CallExpression，检查callee
                  if (t.isCallExpression(expr)) {
                    return findCallInExpression(expr.callee);
                  }
                  // 如果是MemberExpression，检查object
                  if (t.isMemberExpression(expr)) {
                    return findCallInExpression(expr.object);
                  }
                  return false;
                };
                
                if (findCallInExpression(stmt.expression)) {
                  callIndex = i;
                  break;
                }
              }
              // 检查是否是赋值语句，右侧是接口调用
              if (t.isAssignmentExpression(stmt.expression) &&
                t.isCallExpression(stmt.expression.right) &&
                stmt.expression.right === callPath.node) {
                callIndex = i;
                break;
              }
            }
            // 检查是否是变量声明，初始值是接口调用
            if (t.isVariableDeclaration(stmt)) {
              for (const declarator of stmt.declarations) {
                if (t.isCallExpression(declarator.init) && declarator.init === callPath.node) {
                  callIndex = i;
                  break;
                }
              }
              if (callIndex >= 0) break;
            }
          }

          if (callIndex >= 0) {
            // 检查调用前是否有设置loading为true
            let loadingSetBefore = false;
            let loadingVarBefore = null;

            for (let i = 0; i < callIndex; i++) {
              const stmt = statements[i];

              // 检查赋值语句：loading = true 或 this.loading = true
              if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
                const left = stmt.expression.left;
                const right = stmt.expression.right;

                if (t.isIdentifier(left)) {
                  const varName = left.name;
                  // 检查是否是loading相关的变量
                  const isLoadingVar = varName.toLowerCase().includes('loading') ||
                    varName.toLowerCase().includes('submitting') ||
                    (loadingVarName && varName === loadingVarName);

                  if (isLoadingVar) {
                    // 检查是否设置为true
                    if (t.isBooleanLiteral(right) && right.value === true) {
                      loadingSetBefore = true;
                      loadingVarBefore = varName;
                      break;
                    } else if (t.isUnaryExpression(right) && right.operator === '!' &&
                      t.isBooleanLiteral(right.argument) && right.argument.value === false) {
                      loadingSetBefore = true;
                      loadingVarBefore = varName;
                      break;
                    }
                  }
                } else if (t.isMemberExpression(left)) {
                  // 检查 this.loading = true 或 setState({ loading: true })
                  const prop = left.property;
                  if (t.isIdentifier(prop)) {
                    const propName = prop.name;
                    const isLoadingProp = propName.toLowerCase().includes('loading') ||
                      propName.toLowerCase().includes('submitting');
                    if (isLoadingProp &&
                      (t.isBooleanLiteral(right) && right.value === true ||
                        (t.isUnaryExpression(right) && right.operator === '!' &&
                          t.isBooleanLiteral(right.argument) && right.argument.value === false))) {
                      loadingSetBefore = true;
                      loadingVarBefore = propName;
                      break;
                    }
                  }
                }
              }

              // 检查函数调用：setLoading(true) 或 setState({ loading: true })
              if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
                const callee = stmt.expression.callee;
                const args = stmt.expression.arguments;

                // 检查 setLoading(true) 模式
                if (t.isIdentifier(callee)) {
                  const funcName = callee.name;
                  const funcNameLower = funcName.toLowerCase();
                  // 检查是否是 setLoading, setSubmitting 等函数
                  const isSetLoadingFunc = funcNameLower.includes('setloading') ||
                    funcNameLower.includes('setsubmitting') ||
                    (loadingVarName && (
                      funcNameLower === 'set' + loadingVarName.toLowerCase() ||
                      funcNameLower === 'set' + loadingVarName.toLowerCase().charAt(0).toUpperCase() + loadingVarName.toLowerCase().slice(1)
                    ));

                  if (isSetLoadingFunc && args.length > 0) {
                    const arg = args[0];
                    // 检查参数是否为 true
                    if (t.isBooleanLiteral(arg) && arg.value === true) {
                      loadingSetBefore = true;
                      // 提取变量名（setLoading -> loading）
                      if (loadingVarName) {
                        loadingVarBefore = loadingVarName;
                      } else {
                        // 从函数名中提取：setLoading -> loading
                        loadingVarBefore = funcName.replace(/^set/i, '').toLowerCase();
                      }
                      break;
                    }
                  }
                } else if (t.isMemberExpression(callee)) {
                  // 检查 this.setState({ loading: true }) 模式
                  const prop = callee.property;
                  if (t.isIdentifier(prop) && prop.name === 'setState' && args.length > 0) {
                    const arg = args[0];
                    if (t.isObjectExpression(arg)) {
                      for (const prop of arg.properties) {
                        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                          const propName = prop.key.name;
                          if (propName.toLowerCase().includes('loading') ||
                            propName.toLowerCase().includes('submitting')) {
                            const value = prop.value;
                            if (t.isBooleanLiteral(value) && value.value === true) {
                              loadingSetBefore = true;
                              loadingVarBefore = propName;
                              break;
                            }
                          }
                        }
                      }
                      if (loadingSetBefore) break;
                    }
                  }
                }
              }
            }

            // 如果调用前设置了loading为true，检查调用后是否设置为false
            if (loadingSetBefore && loadingVarBefore) {
              // 检查Promise链中是否有设置loading为false
              let currentPath = callPath;
              let foundLoadingReset = false;

              // 向上查找Promise链（.then(), .catch(), .finally()）
              while (currentPath && currentPath.parentPath) {
                if (currentPath.parentPath.isMemberExpression()) {
                  const prop = currentPath.parentPath.node.property;
                  if (t.isIdentifier(prop) &&
                    (prop.name === 'then' || prop.name === 'catch' || prop.name === 'finally')) {
                    // 找到Promise链，检查回调中是否有设置loading为false
                    const thenCall = currentPath.parentPath.parentPath;
                    if (thenCall && thenCall.isCallExpression()) {
                      const callbacks = thenCall.node.arguments;
                      for (const callback of callbacks) {
                        if (callback && (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback))) {
                          const callbackBody = callback.body;
                          if (t.isBlockStatement(callbackBody)) {
                            // 检查回调函数体中是否有设置loading为false
                            for (const callbackStmt of callbackBody.body) {
                              // 检查赋值语句：loading = false
                              if (t.isExpressionStatement(callbackStmt) &&
                                t.isAssignmentExpression(callbackStmt.expression)) {
                                const left = callbackStmt.expression.left;
                                const right = callbackStmt.expression.right;

                                // 检查是否是同一个loading变量
                                let isSameLoadingVar = false;
                                if (t.isIdentifier(left) && left.name === loadingVarBefore) {
                                  isSameLoadingVar = true;
                                } else if (t.isMemberExpression(left)) {
                                  const prop = left.property;
                                  if (t.isIdentifier(prop) && prop.name === loadingVarBefore) {
                                    isSameLoadingVar = true;
                                  }
                                }

                                if (isSameLoadingVar) {
                                  // 检查是否设置为false
                                  if (t.isBooleanLiteral(right) && right.value === false) {
                                    foundLoadingReset = true;
                                    break;
                                  } else if (t.isUnaryExpression(right) && right.operator === '!' &&
                                    t.isBooleanLiteral(right.argument) && right.argument.value === true) {
                                    foundLoadingReset = true;
                                    break;
                                  }
                                }
                              }

                              // 检查函数调用：setLoading(false)
                              if (t.isExpressionStatement(callbackStmt) &&
                                t.isCallExpression(callbackStmt.expression)) {
                                const callee = callbackStmt.expression.callee;
                                const args = callbackStmt.expression.arguments;

                                // 检查 setLoading(false) 模式
                                if (t.isIdentifier(callee)) {
                                  const funcName = callee.name;
                                  const funcNameLower = funcName.toLowerCase();
                                  // 检查是否是 setLoading, setSubmitting 等函数
                                  // 如果已经有 loadingVarBefore，检查是否匹配（如 setLoading 匹配 loading）
                                  const isSetLoadingFunc = funcNameLower.includes('setloading') ||
                                    funcNameLower.includes('setsubmitting') ||
                                    (loadingVarBefore && (
                                      // 精确匹配：setLoading 匹配 loading
                                      funcNameLower === 'set' + loadingVarBefore.toLowerCase() ||
                                      // 首字母大写匹配：setLoading 匹配 Loading
                                      funcNameLower === 'set' + loadingVarBefore.toLowerCase().charAt(0).toUpperCase() + loadingVarBefore.toLowerCase().slice(1) ||
                                      // 包含匹配：setLoading 包含 loading（更宽松的匹配）
                                      funcNameLower.includes('set' + loadingVarBefore.toLowerCase())
                                    ));

                                  if (isSetLoadingFunc && args.length > 0) {
                                    const arg = args[0];
                                    // 检查参数是否为 false
                                    if (t.isBooleanLiteral(arg) && arg.value === false) {
                                      foundLoadingReset = true;
                                      break;
                                    }
                                  }
                                } else if (t.isMemberExpression(callee)) {
                                  // 检查 this.setState({ loading: false }) 模式
                                  const prop = callee.property;
                                  if (t.isIdentifier(prop) && prop.name === 'setState' && args.length > 0) {
                                    const arg = args[0];
                                    if (t.isObjectExpression(arg)) {
                                      for (const prop of arg.properties) {
                                        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                                          const propName = prop.key.name;
                                          if (propName === loadingVarBefore ||
                                            propName.toLowerCase().includes('loading') ||
                                            propName.toLowerCase().includes('submitting')) {
                                            const value = prop.value;
                                            if (t.isBooleanLiteral(value) && value.value === false) {
                                              foundLoadingReset = true;
                                              break;
                                            }
                                          }
                                        }
                                      }
                                      if (foundLoadingReset) break;
                                    }
                                  }
                                }
                              }

                            }
                          }
                        }
                        if (foundLoadingReset) break;
                      }
                    }
                  }
                }
                currentPath = currentPath.parentPath;
                if (foundLoadingReset) break;
              }

              // 如果找到了loading的设置和重置，还需要检查是否在JSX中实际使用了这个loading
              // 只有在JSX中实际使用了loading时，才认为有防重复提交保护
              if (foundLoadingReset && loadingVarBefore) {
                // 使用AST检查loading是否在JSX中实际使用（避免匹配注释）
                let foundInJSX = false;
                
                // 优先使用AST检查
                if (ast) {
                  traverse(ast, {
                    JSXOpeningElement(jsxPath) {
                      const elementName = jsxPath.node.name;
                      let componentName = '';
                      
                      if (t.isJSXIdentifier(elementName)) {
                        componentName = elementName.name;
                      } else if (t.isJSXMemberExpression(elementName)) {
                        const object = elementName.object;
                        const property = elementName.property;
                        if (t.isJSXIdentifier(object) && t.isJSXIdentifier(property)) {
                          componentName = `${object.name}.${property.name}`;
                        }
                      }
                      
                      // 检查Button组件
                      if (componentName === 'Button') {
                        const attributes = jsxPath.node.attributes || [];
                        for (const attr of attributes) {
                          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'loading') {
                            // 检查loading属性的值
                            if (attr.value) {
                              if (t.isJSXExpressionContainer(attr.value) && t.isIdentifier(attr.value.expression)) {
                                if (attr.value.expression.name === loadingVarBefore) {
                                  foundInJSX = true;
                                  jsxPath.stop();
                                  return;
                                }
                              } else if (t.isJSXExpressionContainer(attr.value) && t.isMemberExpression(attr.value.expression)) {
                                // 支持 this.loading 或 props.loading
                                const memberExpr = attr.value.expression;
                                if (t.isIdentifier(memberExpr.property) && memberExpr.property.name === loadingVarBefore) {
                                  foundInJSX = true;
                                  jsxPath.stop();
                                  return;
                                }
                              }
                            }
                          }
                        }
                      }
                      
                      // 检查Modal组件的confirmLoading
                      if (componentName === 'Modal' || componentName === 'Drawer') {
                        const attributes = jsxPath.node.attributes || [];
                        for (const attr of attributes) {
                          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && 
                              (attr.name.name === 'confirmLoading' || attr.name.name === 'loading')) {
                            if (attr.value) {
                              if (t.isJSXExpressionContainer(attr.value) && t.isIdentifier(attr.value.expression)) {
                                if (attr.value.expression.name === loadingVarBefore) {
                                  foundInJSX = true;
                                  jsxPath.stop();
                                  return;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  });
                }
                
                // 如果AST检查没有找到，回退到正则匹配（但移除注释）
                if (!foundInJSX) {
                  const fullContent = parsed.content || '';
                  const contentWithoutComments = ASTUtils.removeCommentsAndStrings(fullContent);
                  
                  const escapedVarName = loadingVarBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const loadingUsagePatterns = [
                    new RegExp(`confirmLoading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`loading\\s*:\\s*${escapedVarName}\\b`, 'i'), // 匹配 loading: loading (注意：需要单词边界)
                    new RegExp(`loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`okButtonProps\\s*=\\s*\\{[^}]*loading\\s*:\\s*${escapedVarName}\\b[^}]*\\}`, 'i'), // 匹配 okButtonProps={{ loading: loading }}
                    new RegExp(`okButtonProps\\s*=\\s*\\{[^}]*loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}[^}]*\\}`, 'i'),
                    // 检查 Button 组件的 loading 属性（只要Button有loading属性，且值是正确的loading变量即可，不关心位置）
                    // 注意：这里要排除注释中的loading，所以使用contentWithoutComments
                    new RegExp(`<Button[\\s\\S]*?loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i')
                  ];
                  
                  for (const pattern of loadingUsagePatterns) {
                    if (pattern.test(contentWithoutComments)) {
                      foundInJSX = true;
                      break;
                    }
                  }
                }
                
                // 只有在JSX中实际使用了loading时，才设置hasProtection
                // 但是，如果Button有htmlType="submit"且Form有onFinish，需要特别检查Button的loading
                if (foundInJSX) {
                  // 即使找到了loading的使用，也要检查是否是Form的onFinish情况
                  // 如果是Form的onFinish，且Button有htmlType="submit"，必须确保Button有loading
                  let needCheckSubmitButton = false;
                  if (ast) {
                    traverse(ast, {
                      JSXOpeningElement(jsxPath) {
                        const elementName = jsxPath.node.name;
                        let componentName = '';
                        
                        if (t.isJSXIdentifier(elementName)) {
                          componentName = elementName.name;
                        }
                        
                        // 检查Form组件是否有onFinish
                        if (componentName === 'Form') {
                          const attributes = jsxPath.node.attributes || [];
                          for (const attr of attributes) {
                            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'onFinish') {
                              if (attr.value && t.isJSXExpressionContainer(attr.value)) {
                                const expr = attr.value.expression;
                                if (t.isIdentifier(expr)) {
                                  const formOnFinishName = expr.name;
                                  const currentHandlerName = handler.name.replace(/['"()]/g, '').trim();
                                  if (formOnFinishName === currentHandlerName || 
                                      currentHandlerName.toLowerCase() === formOnFinishName.toLowerCase()) {
                                    needCheckSubmitButton = true;
                                  }
                                }
                              }
                              break;
                            }
                          }
                        }
                      }
                    });
                  }
                  
                  // 如果需要检查submit按钮，验证Button是否有loading
                  if (needCheckSubmitButton && ast) {
                    let submitButtonHasHtmlTypeSubmit = false;
                    let submitButtonHasLoading = false;
                    let submitButtonInForm = false;
                    
                    traverse(ast, {
                      JSXOpeningElement(jsxPath) {
                        const elementName = jsxPath.node.name;
                        let componentName = '';
                        
                        if (t.isJSXIdentifier(elementName)) {
                          componentName = elementName.name;
                        }
                        
                        if (componentName === 'Button') {
                          let parent = jsxPath.parentPath;
                          let inForm = false;
                          while (parent) {
                            if (parent.isJSXOpeningElement()) {
                              const parentName = parent.node.name;
                              if (t.isJSXIdentifier(parentName) && parentName.name === 'Form') {
                                inForm = true;
                                submitButtonInForm = true;
                                break;
                              }
                            }
                            if (parent.isJSXElement()) {
                              const parentElement = parent.node.openingElement;
                              if (parentElement && t.isJSXIdentifier(parentElement.name) && parentElement.name.name === 'Form') {
                                inForm = true;
                                submitButtonInForm = true;
                                break;
                              }
                            }
                            parent = parent.parentPath;
                            if (!parent) break;
                          }
                          
                          if (inForm) {
                            const attributes = jsxPath.node.attributes || [];
                            for (const attr of attributes) {
                              if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                                if (attr.name.name === 'htmlType') {
                                  if (attr.value && t.isStringLiteral(attr.value) && attr.value.value === 'submit') {
                                    submitButtonHasHtmlTypeSubmit = true;
                                  }
                                }
                                if (attr.name.name === 'loading') {
                                  submitButtonHasLoading = true;
                                }
                              }
                            }
                          }
                        }
                      }
                    });
                    
                    // 如果Button有htmlType="submit"但没有loading，应该报错
                    if (submitButtonHasHtmlTypeSubmit && !submitButtonHasLoading) {
                      foundInJSX = false; // 标记为没有找到loading，这样会触发错误
                      definedButNotUsed = true;
                      foundModalOrDrawerWithoutLoading = true;
                    }
                  }
                  
                  if (foundInJSX) {
                    hasProtection = true;
                  }
                } else {
                  // 如果定义了loading但没有在JSX中使用，标记为definedButNotUsed
                  // 但需要检查是否是Form的onFinish情况，如果是，需要特别检查Button的htmlType="submit"
                  if (loadingVarBefore) {
                    // 检查是否是Form的onFinish情况
                    let isFormOnFinish = false;
                    let formButtonHasHtmlTypeSubmit = false;
                    let formButtonHasLoading = false;
                    
                    if (ast) {
                      traverse(ast, {
                        JSXOpeningElement(jsxPath) {
                          const elementName = jsxPath.node.name;
                          let componentName = '';
                          
                          if (t.isJSXIdentifier(elementName)) {
                            componentName = elementName.name;
                          }
                          
                          // 检查Form组件是否有onFinish
                          if (componentName === 'Form') {
                            const attributes = jsxPath.node.attributes || [];
                            for (const attr of attributes) {
                              if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'onFinish') {
                                isFormOnFinish = true;
                                break;
                              }
                            }
                          }
                          
                          // 检查Form内的Button是否有htmlType="submit"和loading
                          if (componentName === 'Button') {
                            let inForm = false;
                            let parent = jsxPath.parentPath;
                            while (parent) {
                              if (parent.isJSXOpeningElement()) {
                                const parentName = parent.node.name;
                                if (t.isJSXIdentifier(parentName) && parentName.name === 'Form') {
                                  inForm = true;
                                  break;
                                }
                              }
                              parent = parent.parentPath;
                            }
                            
                            if (inForm) {
                              const attributes = jsxPath.node.attributes || [];
                              for (const attr of attributes) {
                                if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                                  if (attr.name.name === 'htmlType') {
                                    if (attr.value && t.isStringLiteral(attr.value) && attr.value.value === 'submit') {
                                      formButtonHasHtmlTypeSubmit = true;
                                    }
                                  }
                                  if (attr.name.name === 'loading') {
                                    formButtonHasLoading = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      });
                    }
                    
                    // 如果是Form的onFinish，且Button有htmlType="submit"，但没有loading，应该报错
                    if (isFormOnFinish && formButtonHasHtmlTypeSubmit && !formButtonHasLoading) {
                      definedButNotUsed = true;
                    } else if (!foundInJSX) {
                      // 其他情况，如果定义了loading但没有使用，也标记为definedButNotUsed
                      definedButNotUsed = true;
                    }
                  }
                }
              }
            }

            // 原有的状态锁检查逻辑（保留兼容性）
            // 注意：这里不再自动设置hasProtection，因为需要检查loading是否在JSX中实际使用
            // 如果只是设置了loading但没有在JSX中使用，不应该认为有保护
            // 这个检查逻辑已经在上面的loading状态管理检查中处理了
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

  // 检查是否使用了 declareRequest 定义的 loading（防重复提交）
  // 同时检查：1. 定义了loading但没有使用；2. 使用了其他接口的loading
  // 注意：只有在没有找到其他保护机制时，才检查definedButNotUsed和usedWrongLoading
  // 如果在上面的path.traverse中已经设置了hasProtection = true，说明已经找到了有效的保护机制，就不需要再检查这些问题了
  
  // 特别检查：当Button有htmlType="submit"时，如果Form有onFinish且onFinish中调用了接口，Button必须有loading
  // 只有当onFinish里没有调用接口，或者Form没有绑定onFinish方法，才不用loading
  // 注意：这个检查应该在检查hasProtection之前进行，因为即使hasProtection为false，如果Button有htmlType="submit"且Form有onFinish，也应该检查
  // 这个检查必须在path.traverse之后执行，因为hasApiCall是在path.traverse内部设置的
  if (hasApiCall && parsed.ast) {
    const ast = parsed.ast;
    let formHasOnFinish = false;
    let formOnFinishHandlerName = null;
    let submitButtonHasHtmlTypeSubmit = false;
    let submitButtonHasLoading = false;
    let submitButtonInForm = false;
    
    // 检查Form是否有onFinish，以及Button是否有htmlType="submit"
    traverse(ast, {
      JSXOpeningElement(jsxPath) {
        const elementName = jsxPath.node.name;
        let componentName = '';
        
        if (t.isJSXIdentifier(elementName)) {
          componentName = elementName.name;
        }
        
        // 检查Form组件是否有onFinish
        if (componentName === 'Form') {
          const attributes = jsxPath.node.attributes || [];
          for (const attr of attributes) {
            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'onFinish') {
              if (attr.value && t.isJSXExpressionContainer(attr.value)) {
                const expr = attr.value.expression;
                if (t.isIdentifier(expr)) {
                  formHasOnFinish = true;
                  formOnFinishHandlerName = expr.name;
                }
              }
              break;
            }
          }
        }
        
        // 检查Form内的Button是否有htmlType="submit"和loading
        if (componentName === 'Button') {
          // 检查这个Button是否在Form内（需要向上查找所有父节点，包括JSXElement）
          let parent = jsxPath.parentPath;
          let inForm = false;
          while (parent) {
            if (parent.isJSXOpeningElement()) {
              const parentName = parent.node.name;
              if (t.isJSXIdentifier(parentName) && parentName.name === 'Form') {
                inForm = true;
                submitButtonInForm = true;
                break;
              }
            }
            // 也需要检查JSXElement的父节点
            if (parent.isJSXElement()) {
              const parentElement = parent.node.openingElement;
              if (parentElement && t.isJSXIdentifier(parentElement.name) && parentElement.name.name === 'Form') {
                inForm = true;
                submitButtonInForm = true;
                break;
              }
            }
            parent = parent.parentPath;
            if (!parent) break;
          }
          
          if (inForm) {
            const attributes = jsxPath.node.attributes || [];
            for (const attr of attributes) {
              if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                if (attr.name.name === 'htmlType') {
                  if (attr.value && t.isStringLiteral(attr.value) && attr.value.value === 'submit') {
                    submitButtonHasHtmlTypeSubmit = true;
                  }
                }
                if (attr.name.name === 'loading') {
                  submitButtonHasLoading = true;
                }
              }
            }
          }
        }
      }
    });
    
    // 如果Form有onFinish，且Button有htmlType="submit"，且onFinish中调用了接口，但Button没有loading，应该报错
    if (formHasOnFinish && submitButtonHasHtmlTypeSubmit && !submitButtonHasLoading) {
      // 检查onFinish方法中是否调用了接口
      // 如果hasApiCall为true，说明当前检查的函数（onFinish）中调用了接口
      const currentHandlerName = handler.name.replace(/['"()]/g, '').trim();
      const formOnFinishName = formOnFinishHandlerName ? formOnFinishHandlerName.trim() : '';
      
      // 匹配handler名称（支持多种格式：onFinish, onFinish(), "onFinish"等）
      const handlerNameMatch = currentHandlerName === formOnFinishName ||
          currentHandlerName.toLowerCase() === formOnFinishName.toLowerCase() ||
          currentHandlerName.includes(formOnFinishName) ||
          formOnFinishName.includes(currentHandlerName) ||
          currentHandlerName.replace(/['"()]/g, '') === formOnFinishName.replace(/['"()]/g, '');
      
      if (handlerNameMatch) {
        // onFinish方法中调用了接口，但Button没有loading，应该报错
        // 强制设置这些标志，确保错误被报告
        definedButNotUsed = true;
        foundModalOrDrawerWithoutLoading = true;
        hasProtection = false; // 确保hasProtection为false，这样会在最后报错
      }
    }
  }
  
  if (!hasProtection && hasApiCall) {
    // 查找函数中的所有接口调用
    let foundDeclareRequestLoading = false;
    // 注意：foundModalOrDrawerWithoutLoading 已经在上面检查htmlType="submit"时可能设置了，不要重新声明
    // usedWrongLoading 和 correctLoadingName 也可能在上面设置了，不要重新声明
    // 如果上面没有设置，这里保持初始值false/null
    
    // 先检查是否有 Modal/Drawer/Form 但没有 loading（在遍历接口调用之前）
    const handlerName = handler.name.replace(/['"()]/g, '').trim();
    const templateContent = parsed.template || parsed.content || '';
    const fullContent = parsed.content || '';
    
    // 移除注释后检查（先移除多行注释，再移除单行注释）
    const contentWithoutComments = fullContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* */ 注释
      .replace(/\/\/.*$/gm, ''); // 移除 // 注释
    
    // 先不检查Modal/Drawer/Form是否有loading，这个检查会在检查declareRequest的loading时进行
    // 这样可以检测到使用了错误的loading的情况
    
    // 检查问题1：定义了loading但没有使用
    // 查找函数中是否有 setLoading(true) 和 setLoading(false) 的逻辑
    let definedLoadingVars = new Set(); // 记录定义的loading变量名
    let usedLoadingVars = new Set(); // 记录在JSX中使用的loading变量名
    
    // 查找函数中定义的loading变量（通过setLoading调用）
    path.traverse({
      CallExpression(setLoadingPath) {
        const callee = setLoadingPath.node.callee;
        if (t.isIdentifier(callee)) {
          const funcName = callee.name;
          const funcNameLower = funcName.toLowerCase();
          // 检查是否是 setLoading, setSubmitting 等函数
          if (funcNameLower.includes('setloading') || funcNameLower.includes('setsubmitting')) {
            // 从函数名中提取变量名：setLoading -> loading
            const loadingVarName = funcName.replace(/^set/i, '').toLowerCase();
            definedLoadingVars.add(loadingVarName);
          }
        }
      },
      VariableDeclarator(varPath) {
        // 检查数组解构：const [loading, setLoading] = useState(false);
        if (t.isArrayPattern(varPath.node.id)) {
          const elements = varPath.node.id.elements;
          if (elements && elements.length > 0 && t.isIdentifier(elements[0])) {
            const varName = elements[0].name;
            const varNameLower = varName.toLowerCase();
            if (varNameLower.includes('loading') || varNameLower.includes('submitting')) {
              definedLoadingVars.add(varName);
            }
          }
        }
      }
    });
    
    // 查找JSX中使用的loading变量
    const fullContentForCheck = contentWithoutComments;
    for (const loadingVar of definedLoadingVars) {
      // 检查是否在JSX中使用（排除注释）
      const escapedVarName = loadingVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 检查 Modal/Drawer/Button 等组件上的 loading 属性
      const loadingUsagePatterns = [
        new RegExp(`confirmLoading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
        new RegExp(`loading\\s*:\\s*${escapedVarName}\\b`, 'i'), // 匹配 loading: loading (注意：需要单词边界)
        new RegExp(`loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
        new RegExp(`okButtonProps\\s*=\\s*\\{[^}]*loading\\s*:\\s*${escapedVarName}\\b[^}]*\\}`, 'i'), // 匹配 okButtonProps={{ loading: loading }}
        new RegExp(`okButtonProps\\s*=\\s*\\{[^}]*loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}[^}]*\\}`, 'i'),
        // 检查 Button 组件的 loading 属性（只要Button有loading属性，且值是正确的loading变量即可，不关心位置）
        new RegExp(`<Button[\\s\\S]*?loading\\s*=\\s*\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i')
      ];
      
      for (const pattern of loadingUsagePatterns) {
        if (pattern.test(fullContentForCheck)) {
          usedLoadingVars.add(loadingVar);
          break;
        }
      }
    }
    
    // 如果定义了loading但没有使用，标记为没有保护
    const unusedLoadingVars = Array.from(definedLoadingVars).filter(v => !usedLoadingVars.has(v));
    if (unusedLoadingVars.length > 0) {
      // 定义了loading但没有使用，不设置hasProtection，让外层逻辑判定为没有保护
      definedButNotUsed = true;
      foundModalOrDrawerWithoutLoading = true;
    }
    
    // 继续检查declareRequest的loading，这样可以检测到使用了错误的loading的情况
    // 注意：即使定义了loading但没有使用，也要检查是否使用了错误的loading
    path.traverse({
      CallExpression(apiCallPath) {
        if (isApiCall(apiCallPath)) {
          const actionName = getActionNameFromCall(apiCallPath);
          if (actionName) {
            // 首先尝试查找第一个参数为 'loading' 的接口
            let declareRequestInfo = findDeclareRequestLoading(actionName, filePath, parsed.ast);
            // 如果没找到，查找接口定义（无论第一个参数是什么）
            if (!declareRequestInfo) {
              declareRequestInfo = findDeclareRequestInfo(actionName, filePath, parsed.ast);
            }
            
            if (declareRequestInfo && declareRequestInfo.loadingName) {
              // 检查页面中是否使用了这个 loading（在按钮或 Modal/Drawer 上绑定）
              const handlerName = handler.name.replace(/['"()]/g, '').trim();
              // 对于 JSX 文件，template 可能是 undefined，使用 content
              const templateContent = parsed.template || parsed.content || '';
              const fullContent = parsed.content || '';
              
              // 移除注释后检查
              const contentWithoutComments = fullContent
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');
              const templateWithoutComments = templateContent
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');
              
              // 转义特殊字符
              const escapedLoadingName = declareRequestInfo.loadingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const escapedHandlerName = handlerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              // 检查问题2：是否使用了其他接口的loading
              // 设置正确的loading名称
              correctLoadingName = declareRequestInfo.loadingName;
              
              // 检查 Modal 是否使用了错误的loading
              const modalMatch = contentWithoutComments.match(new RegExp(`<Modal[\\s\\S]*?</Modal>`, 'i'));
              if (modalMatch) {
                const modalContent = modalMatch[0];
                const hasOnOk = new RegExp(`onOk[\\s\\S]*?${escapedHandlerName}`, 'i').test(modalContent);
                if (hasOnOk) {
                  // Modal 有 onOk，检查 confirmLoading
                  const confirmLoadingMatch = modalContent.match(/confirmLoading\s*=\s*\{([^}]+)\}/i);
                  if (confirmLoadingMatch) {
                    const loadingValue = confirmLoadingMatch[1].trim();
                    // 检查是否是当前接口对应的loading
                    if (loadingValue === declareRequestInfo.loadingName) {
                      foundDeclareRequestLoading = true;
                      hasProtection = true;
                      apiCallPath.stop();
                      return;
                    } else {
                      // 使用了其他接口的loading
                      usedWrongLoading = true;
                      correctLoadingName = declareRequestInfo.loadingName;
                      // 不设置hasProtection，让外层逻辑判定为没有保护
                    }
                  } else {
                    // Modal 有 onOk 但没有 confirmLoading，检查 okButtonProps 中的 loading
                    const okButtonPropsMatch = modalContent.match(/okButtonProps\s*=\s*\{([^}]+)\}/i);
                    if (okButtonPropsMatch) {
                      const okButtonPropsContent = okButtonPropsMatch[1];
                      // 检查 okButtonProps 中是否有 loading
                      const loadingInOkButtonPropsMatch = okButtonPropsContent.match(/loading\s*:\s*([^,}]+)/i);
                      if (loadingInOkButtonPropsMatch) {
                        const loadingValue = loadingInOkButtonPropsMatch[1].trim().replace(/['"]/g, '');
                        // 检查是否是当前接口对应的loading
                        if (loadingValue === declareRequestInfo.loadingName) {
                          foundDeclareRequestLoading = true;
                          hasProtection = true;
                          apiCallPath.stop();
                          return;
                        } else {
                          // 使用了其他接口的loading
                          usedWrongLoading = true;
                          correctLoadingName = declareRequestInfo.loadingName;
                        }
                      } else {
                        // Modal 有 onOk，okButtonProps 存在但没有 loading
                        foundModalOrDrawerWithoutLoading = true;
                      }
                    } else {
                      // Modal 有 onOk 但没有 confirmLoading 和 okButtonProps
                      foundModalOrDrawerWithoutLoading = true;
                    }
                  }
                }
              }
              
              // 检查 Drawer 是否使用了错误的loading
              const drawerMatch = contentWithoutComments.match(new RegExp(`<Drawer[\\s\\S]*?</Drawer>`, 'i'));
              if (drawerMatch) {
                const drawerContent = drawerMatch[0];
                const hasOnOk = new RegExp(`onOk[\\s\\S]*?${escapedHandlerName}`, 'i').test(drawerContent);
                if (hasOnOk) {
                  const confirmLoadingMatch = drawerContent.match(/confirmLoading\s*=\s*\{([^}]+)\}/i);
                  if (confirmLoadingMatch) {
                    const loadingValue = confirmLoadingMatch[1].trim();
                    if (loadingValue === declareRequestInfo.loadingName) {
                      foundDeclareRequestLoading = true;
                      hasProtection = true;
                      apiCallPath.stop();
                      return;
                    } else {
                      usedWrongLoading = true;
                    }
                  } else {
                    foundModalOrDrawerWithoutLoading = true;
                  }
                }
              }
              
              // 检查 Popconfirm 是否使用了错误的loading
              const popconfirmMatch = contentWithoutComments.match(new RegExp(`<Popconfirm[\\s\\S]*?</Popconfirm>`, 'i'));
              if (popconfirmMatch) {
                const popconfirmContent = popconfirmMatch[0];
                const hasOnConfirm = new RegExp(`onConfirm[\\s\\S]*?${escapedHandlerName}`, 'i').test(popconfirmContent);
                if (hasOnConfirm) {
                  const loadingMatch = popconfirmContent.match(/loading\s*=\s*\{([^}]+)\}/i);
                  if (loadingMatch) {
                    const loadingValue = loadingMatch[1].trim();
                    if (loadingValue === declareRequestInfo.loadingName) {
                      foundDeclareRequestLoading = true;
                      hasProtection = true;
                      apiCallPath.stop();
                      return;
                    } else {
                      usedWrongLoading = true;
                    }
                  } else {
                    foundModalOrDrawerWithoutLoading = true;
                  }
                }
              }
              
              // 检查 Form 是否使用了错误的loading
              // 使用AST检查，避免匹配注释
              const handlerNameForCheck = handler.name.replace(/['"()]/g, '').trim();
              let formHasOnFinish = false;
              let formButtonHasLoading = false;
              let formButtonLoadingValue = null;
              
              if (ast) {
                traverse(ast, {
                  JSXOpeningElement(jsxPath) {
                    const elementName = jsxPath.node.name;
                    let componentName = '';
                    
                    if (t.isJSXIdentifier(elementName)) {
                      componentName = elementName.name;
                    } else if (t.isJSXMemberExpression(elementName)) {
                      const object = elementName.object;
                      const property = elementName.property;
                      if (t.isJSXIdentifier(object) && t.isJSXIdentifier(property)) {
                        componentName = `${object.name}.${property.name}`;
                      }
                    }
                    
                    // 检查Form组件
                    if (componentName === 'Form') {
                      const attributes = jsxPath.node.attributes || [];
                      for (const attr of attributes) {
                        if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'onFinish') {
                          if (attr.value && t.isJSXExpressionContainer(attr.value)) {
                            const expr = attr.value.expression;
                            if (t.isIdentifier(expr) && (expr.name === handlerNameForCheck || expr.name.includes(handlerNameForCheck) || handlerNameForCheck.includes(expr.name))) {
                              formHasOnFinish = true;
                            }
                          }
                        }
                      }
                    }
                    
                    // 检查Form内的Button组件
                    if (componentName === 'Button') {
                      // 检查这个Button是否在Form内（通过查找父节点）
                      let parent = jsxPath.parentPath;
                      let inForm = false;
                      while (parent) {
                        if (parent.isJSXOpeningElement()) {
                          const parentName = parent.node.name;
                          if (t.isJSXIdentifier(parentName) && parentName.name === 'Form') {
                            inForm = true;
                            break;
                          }
                        }
                        parent = parent.parentPath;
                      }
                      
                      if (inForm) {
                        const attributes = jsxPath.node.attributes || [];
                        for (const attr of attributes) {
                          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'loading') {
                            formButtonHasLoading = true;
                            if (attr.value && t.isJSXExpressionContainer(attr.value)) {
                              const expr = attr.value.expression;
                              if (t.isIdentifier(expr)) {
                                formButtonLoadingValue = expr.name;
                              }
                            }
                            break;
                          }
                        }
                      }
                    }
                  }
                });
              }
              
              // 如果AST检查没有找到，回退到正则匹配（但移除注释）
              if (!formHasOnFinish) {
                const formMatch = contentWithoutComments.match(new RegExp(`<Form[\\s\\S]*?</Form>`, 'i'));
                if (formMatch) {
                  const formContent = formMatch[0];
                  formHasOnFinish = new RegExp(`onFinish[\\s\\S]*?${escapedHandlerName}`, 'i').test(formContent);
                }
              }
              
              if (!formButtonHasLoading && formHasOnFinish) {
                const formMatch = contentWithoutComments.match(new RegExp(`<Form[\\s\\S]*?</Form>`, 'i'));
                if (formMatch) {
                  const formContent = formMatch[0];
                  const submitButtonLoadingMatch = formContent.match(/<Button[\\s\\S]*?loading\s*=\s*\{([^}]+)\}/i);
                  if (submitButtonLoadingMatch) {
                    formButtonHasLoading = true;
                    formButtonLoadingValue = submitButtonLoadingMatch[1].trim();
                  }
                }
              }
              
              if (formHasOnFinish) {
                if (formButtonHasLoading && formButtonLoadingValue === declareRequestInfo.loadingName) {
                  foundDeclareRequestLoading = true;
                  hasProtection = true;
                  apiCallPath.stop();
                  return;
                } else if (formButtonHasLoading) {
                  usedWrongLoading = true;
                } else {
                  foundModalOrDrawerWithoutLoading = true;
                }
              }
              
              // 检查 Button 是否使用了错误的loading（只要Button有loading属性即可，不关心位置）
              const buttonLoadingMatch = templateWithoutComments.match(new RegExp(`<Button[\\s\\S]*?loading\\s*=\\s*\\{([^}]+)\\}`, 'i'));
              
              if (buttonLoadingMatch) {
                const loadingValue = buttonLoadingMatch[1].trim();
                if (loadingValue === declareRequestInfo.loadingName) {
                  foundDeclareRequestLoading = true;
                  hasProtection = true;
                  apiCallPath.stop();
                  return;
                } else {
                  usedWrongLoading = true;
                }
              }
              
              // 如果使用了错误的loading，标记为没有保护，但不返回，继续检查其他组件
              // 如果找到了 Modal/Drawer/Popconfirm/Form 但没有 loading，也不返回，继续检查其他组件
              // 这样可以检测到所有的问题
              
              // 检查 Button 是否绑定了 loading（如果上面的 Modal/Drawer/Popconfirm 检查都没有通过）
              // 只要Button有loading属性，且值是正确的loading变量即可，不关心位置
              const buttonLoadingPattern = new RegExp(`<Button[\\s\\S]*?loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i');
              
              // 只有在没有使用错误的loading，且Modal/Drawer/Form有loading的情况下，才设置hasProtection
              if (!usedWrongLoading && !foundModalOrDrawerWithoutLoading) {
                if (buttonLoadingPattern.test(templateWithoutComments) || 
                    checkDeclareRequestLoadingUsage(declareRequestInfo.loadingName, fullContent, templateContent)) {
                  foundDeclareRequestLoading = true;
                  hasProtection = true;
                  apiCallPath.stop();
                }
              }
            }
          }
        }
      }
      });
  }

  if (hasApiCall && !hasProtection) {
    const line = handler.line || path.node.loc?.start.line || 0;
    
    // 根据问题类型生成不同的错误消息
    // 注意：definedButNotUsed、usedWrongLoading 和 correctLoadingName 应该在上面的 if (!hasProtection && hasApiCall) 块中已经设置
    let errorMessage = `新增按钮「${funcName}」的点击事件中调用了接口，但未实现防重复提交逻辑`;
    let suggestion = '1. 增加按钮 loading 状态绑定，接口调用前设置 loading 为 true，调用后设置为 false；2. 增加按钮禁用状态绑定；3. 使用防抖函数包装接口调用（延迟≥500ms）；4. 增加布尔状态锁控制重复提交';
    
    if (definedButNotUsed) {
      errorMessage = `新增按钮「${funcName}」的点击事件中定义了 loading 状态，但未在 JSX 中使用（如 Modal 的 confirmLoading 或 Button 的 loading 属性）`;
      suggestion = `请在 Modal/Drawer/Button 等组件上绑定定义的 loading 状态，例如：<Modal confirmLoading={loading} onOk={${funcName}}> 或 <Button loading={loading} onClick={${funcName}}>`;
    } else if (usedWrongLoading && correctLoadingName) {
      errorMessage = `新增按钮「${funcName}」的点击事件中使用了其他接口的 loading，应使用接口「${correctLoadingName}」对应的 loading`;
      suggestion = `请使用正确的 loading 变量，该接口对应的 loading 名称应为「${correctLoadingName}」。请检查 props 解构和组件上的 loading 绑定`;
    }
    
    errors.push({
      rule: 1,
      file: filePath,
      line: line,
      message: errorMessage,
      suggestion: suggestion
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
  // 新增文件的判断：diff 以 +++ 开头，或者没有 --- 行
  const isNewFile = !diff || (!diff.includes('---') && diff.includes('+++')) ||
    (diff && diff.split('\n').some(line => line.startsWith('+++') && !line.includes('---')));
  const hasInitLogic = diff && (diff.includes('created') || diff.includes('mounted') ||
    diff.includes('useEffect') || diff.includes('componentDidMount'));

  // 检查是否有useEffect（即使不是新增文件，只要有useEffect也检查）
  // 使用AST检查，避免匹配注释和字符串
  const hasUseEffectInContent = ASTUtils.hasMethodCall(ast, 'useEffect') || 
                                 ASTUtils.hasKeyword(ast, content, 'useEffect');

  if (!isNewFile && !hasInitLogic && !hasUseEffectInContent) {
    return null;
  }

  // 检查是否是列表页或详情页（可选，如果不是列表页/详情页，只要有useEffect中的接口调用也检查）
  // 使用AST检查，避免匹配注释和字符串
  const isListPage = (template && (template.includes('el-table') || template.includes('<Table'))) ||
                     ASTUtils.hasMethodCall(ast, '.map') ||
                     ASTUtils.hasKeyword(ast, content, ['.map(', 'v-for']);
  
  const isDetailPage = ASTUtils.hasKeyword(ast, content, ['getDetail', 'fetchDetail', 'queryDetail', '详情']);

  // 检查是否有useEffect
  const hasUseEffect = ASTUtils.hasMethodCall(ast, 'useEffect') || ASTUtils.hasKeyword(ast, content, 'useEffect');

  // 如果不是列表页/详情页，也没有useEffect，则跳过检查
  if (!isListPage && !isDetailPage && !hasUseEffect) {
    return null;
  }

  // 检查白名单
  const whitelistPaths = config.rule2.whitelist.paths || [];
  if (whitelistPaths.some(pattern => filePath.includes(pattern))) {
    return null;
  }

  if (ast) {
    let hasApiCallInEffect = false;
    let hasLoading = false;
    const loadingMethods = config.rule2.customKeywords.loadingMethods ||
      ['showLoading', 'hideLoading', 'loading', 'setLoading'];

    // 检查 useEffect 中的接口调用
    // 先找到所有接口调用，然后检查它们是否在 useEffect 中
    traverse(ast, {
      CallExpression(callPath) {
        // 检查是否是接口调用
        if (!isApiCall(callPath)) {
          return;
        }

        // 检查是否在 useEffect 的回调函数中
        let currentPath = callPath;
        let inUseEffect = false;
        let parentFunc = null;

        // 向上查找，看是否在 useEffect 的回调中
        while (currentPath && currentPath.parentPath) {
          // 检查是否是函数表达式或箭头函数
          if (currentPath.parentPath.isArrowFunctionExpression() ||
            currentPath.parentPath.isFunctionExpression()) {
            parentFunc = currentPath.parentPath;
            // 继续向上查找，看是否是 useEffect 的回调
            let checkPath = currentPath.parentPath.parentPath;
            while (checkPath) {
              if (checkPath.isCallExpression() &&
                t.isIdentifier(checkPath.node.callee) &&
                checkPath.node.callee.name === 'useEffect') {
                inUseEffect = true;
                break;
              }
              checkPath = checkPath.parentPath;
            }
            break;
          }
          currentPath = currentPath.parentPath;
        }

        if (inUseEffect && parentFunc) {
          hasApiCallInEffect = true;

          // 检查是否有 loading
          const funcBody = parentFunc.node.body;
          if (t.isBlockStatement(funcBody)) {
            const statements = funcBody.body;

            // 检查调用前是否有 showLoading
            for (const stmt of statements) {
              if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
                const stmtMethod = getMethodName(stmt.expression.callee);
                if (loadingMethods.some(m => stmtMethod.includes(m))) {
                  hasLoading = true;
                  break;
                }
              }
            }

            // 检查接口调用是否在 Promise 链中
            currentPath = callPath;
            while (currentPath && currentPath.parentPath) {
              if (currentPath.parentPath.isMemberExpression()) {
                const prop = currentPath.parentPath.node.property;
                if (t.isIdentifier(prop) && (prop.name === 'then' || prop.name === 'catch' || prop.name === 'finally')) {
                  const thenCall = currentPath.parentPath.parentPath;
                  if (thenCall && thenCall.isCallExpression() && thenCall.node.arguments.length > 0) {
                    const callback = thenCall.node.arguments[0];
                    if (callback && (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback))) {
                      const callbackBody = callback.body;
                      if (t.isBlockStatement(callbackBody)) {
                        for (const stmt of callbackBody.body) {
                          if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
                            const stmtMethod = getMethodName(stmt.expression.callee);
                            if (loadingMethods.some(m => stmtMethod.includes(m))) {
                              hasLoading = true;
                              break;
                            }
                          }
                        }
                      } else if (t.isCallExpression(callbackBody)) {
                        const stmtMethod = getMethodName(callbackBody.callee);
                        if (loadingMethods.some(m => stmtMethod.includes(m))) {
                          hasLoading = true;
                        }
                      }
                    }
                  }
                }
              }
              currentPath = currentPath.parentPath;
              if (hasLoading) break;
            }
          }
          
          // 检查是否使用了 useState 定义的 loading 变量并在 JSX 中使用
          if (!hasLoading) {
            // 查找接口调用在 useEffect 中的位置
            const funcBody = parentFunc.node.body;
            if (t.isBlockStatement(funcBody)) {
              const statements = funcBody.body;
              
              // 找到接口调用在函数体中的位置
              let callIndex = -1;
              for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i];
                // 检查是否是包含接口调用的语句
                if (t.isExpressionStatement(stmt)) {
                  if (t.isCallExpression(stmt.expression)) {
                    // 检查是否是接口调用本身
                    if (stmt.expression === callPath.node) {
                      callIndex = i;
                      break;
                    }
                    // 检查是否是链式调用，如 props.xxxAction().then()
                    if (t.isMemberExpression(stmt.expression.callee)) {
                      let checkExpr = stmt.expression.callee;
                      while (checkExpr && t.isMemberExpression(checkExpr)) {
                        if (checkExpr.object === callPath.node) {
                          callIndex = i;
                          break;
                        }
                        checkExpr = checkExpr.object;
                      }
                      if (callIndex >= 0) break;
                    }
                  }
                }
                // 检查是否是变量声明，初始值是接口调用
                if (t.isVariableDeclaration(stmt)) {
                  for (const declarator of stmt.declarations) {
                    if (t.isCallExpression(declarator.init) && declarator.init === callPath.node) {
                      callIndex = i;
                      break;
                    }
                  }
                  if (callIndex >= 0) break;
                }
              }
              
              // 如果找到了接口调用的位置，检查调用前是否有 setLoading(true) 等调用
              if (callIndex >= 0) {
                let loadingVarName = null;
                // 检查接口调用前的语句
                for (let i = 0; i < callIndex; i++) {
                  const stmt = statements[i];
                  if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
                    const callee = stmt.expression.callee;
                    const args = stmt.expression.arguments;
                    if (t.isIdentifier(callee)) {
                      const funcName = callee.name;
                      const funcNameLower = funcName.toLowerCase();
                      // 检查是否是 setLoading, setPageLoading 等函数，且设置为 true
                      if ((funcNameLower.includes('setloading') || funcNameLower.includes('setsubmitting')) &&
                          args.length > 0 && t.isBooleanLiteral(args[0]) && args[0].value === true) {
                        // 从函数名中提取变量名：setPageLoading -> pageLoading, setLoading -> loading
                        const extractedName = funcName.replace(/^set/i, '');
                        // 首字母转为小写：PageLoading -> pageLoading
                        loadingVarName = extractedName.charAt(0).toLowerCase() + extractedName.slice(1);
                        break; // 找到接口调用前设置的loading，停止查找
                      }
                    }
                  }
                }
                
                // 如果找到了loading变量，检查是否在JSX中使用
                if (loadingVarName) {
                  const templateContent = template || content || '';
                  const fullContent = content || '';
                  const contentWithoutComments = fullContent
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/\/\/.*$/gm, '');
                  
                  const escapedVarName = loadingVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // 同时检查首字母大写和小写的情况（pageLoading 和 PageLoading）
                  const escapedVarNameUpper = loadingVarName.charAt(0).toUpperCase() + loadingVarName.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // 检查是否在JSX中使用（Spin、Table、Button等组件的loading属性）
                  const loadingUsagePatterns = [
                    new RegExp(`<Spin[^>]*spinning=\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`<Spin[^>]*spinning=\\{[^}]*\\b${escapedVarNameUpper}\\b[^}]*\\}`, 'i'),
                    new RegExp(`<Table[^>]*loading=\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`<Table[^>]*loading=\\{[^}]*\\b${escapedVarNameUpper}\\b[^}]*\\}`, 'i'),
                    new RegExp(`loading=\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`loading=\\{[^}]*\\b${escapedVarNameUpper}\\b[^}]*\\}`, 'i'),
                    new RegExp(`spinning=\\{[^}]*\\b${escapedVarName}\\b[^}]*\\}`, 'i'),
                    new RegExp(`spinning=\\{[^}]*\\b${escapedVarNameUpper}\\b[^}]*\\}`, 'i')
                  ];
                  
                  for (const pattern of loadingUsagePatterns) {
                    if (pattern.test(contentWithoutComments)) {
                      hasLoading = true;
                      break;
                    }
                  }
                }
              }
            }
          }
          
          // 检查是否使用了 declareRequest 定义的 loading
          if (!hasLoading) {
            const actionName = getActionNameFromCall(callPath);
            if (actionName) {
              // 首先尝试查找第一个参数为 'loading' 的接口
              const declareRequestInfo = findDeclareRequestLoading(actionName, filePath, ast);
              if (declareRequestInfo && declareRequestInfo.loadingName) {
                // 检查页面中是否使用了这个 loading
                // 对于 JSX 文件，template 可能是 undefined，使用 content
                // 规则2要求必须在 JSX 中实际使用（requireJSXUsage = true）
                const templateContent = template || content || '';
                if (checkDeclareRequestLoadingUsage(declareRequestInfo.loadingName, content, templateContent, true)) {
                  hasLoading = true;
                }
              } else {
                // 如果第一个参数不是 'loading'，查找接口定义（无论第一个参数是什么）
                const declareRequestInfoAny = findDeclareRequestInfo(actionName, filePath, ast);
                if (declareRequestInfoAny && declareRequestInfoAny.loadingName) {
                  // 检查页面中是否使用了这个 loading（即使第一个参数不是 'loading'）
                  // 对于 JSX 文件，template 可能是 undefined，使用 content
                  // 规则2要求必须在 JSX 中实际使用（requireJSXUsage = true）
                  const templateContent = template || content || '';
                  if (checkDeclareRequestLoadingUsage(declareRequestInfoAny.loadingName, content, templateContent, true)) {
                    hasLoading = true;
                  }
                }
              }
            }
          }
        }
      }
    });

    if (hasApiCallInEffect && !hasLoading) {
      errors.push({
        rule: 2,
        file: filePath,
        line: ast.loc?.start.line || 0,
        message: `新增${isListPage ? '列表页' : '详情页'}首次进入时调用了数据查询接口，但未实现有效的 loading 展示与隐藏逻辑`,
        suggestion: '1. 使用全局 loading 方法包裹接口调用；2. 增加页面级 Spin 组件，绑定 isLoading 状态'
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
      // 首先检查是否是接口调用
      if (!isApiCall(callPath)) {
        return;
      }

      const callee = callPath.node.callee;
      const methodName = getMethodName(callee);

      // 检查是否是 POST/PUT 请求
      // 排除常见的方法名误报（如 toString, includes, input, output 等）
      const lowerMethodName = methodName.toLowerCase();
      const excludePatterns = ['tostring', 'includes', 'input', 'output'];
      const isExcludedMethod = excludePatterns.some(pattern =>
        lowerMethodName === pattern ||
        lowerMethodName.endsWith('.' + pattern) ||
        lowerMethodName.includes('.' + pattern + '(')
      );

      // 如果方法名在排除列表中，跳过检查
      if (isExcludedMethod) {
        return;
      }

      const isPostPut =
        // 检查 http.post(), http.put(), axios.post() 等（方法名以 .post/.put/.delete 结尾）
        (methodName.toLowerCase().match(/\.(post|put|delete|patch)$/)) ||
        // 检查 ajax.post(), ajax.put() 等
        (methodName.includes('ajax.') && (
          methodName.toLowerCase().includes('.post') ||
          methodName.toLowerCase().includes('.put') ||
          methodName.toLowerCase().includes('.delete')
        )) ||
        // 检查 props.dispatch 中的 type 是否包含操作关键词
        (methodName.includes('dispatch') && callPath.node.arguments.some(arg => {
          if (t.isObjectExpression(arg)) {
            return arg.properties.some(prop => {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'type') {
                const value = prop.value;
                if (t.isStringLiteral(value)) {
                  const typeValue = value.value.toLowerCase();
                  // 检查 type 中是否包含操作关键词
                  return typeValue.includes('add') || typeValue.includes('create') ||
                    typeValue.includes('update') || typeValue.includes('edit') ||
                    typeValue.includes('delete') || typeValue.includes('remove') ||
                    typeValue.includes('submit') || typeValue.includes('save');
                }
              }
              return false;
            });
          }
          return false;
        })) ||
        // 检查 Action 方法名是否包含操作关键词
        (methodName.endsWith('Action') && (
          methodName.toLowerCase().includes('add') ||
          methodName.toLowerCase().includes('create') ||
          methodName.toLowerCase().includes('update') ||
          methodName.toLowerCase().includes('edit') ||
          methodName.toLowerCase().includes('delete') ||
          methodName.toLowerCase().includes('remove') ||
          methodName.toLowerCase().includes('submit') ||
          methodName.toLowerCase().includes('save') ||
          methodName.toLowerCase().includes('copy') ||
          methodName.toLowerCase().includes('post') ||
          methodName.toLowerCase().includes('put') ||
          // 只检查明确的 HTTP 方法名，避免误报（如 output.toString）
          methodName.toLowerCase().match(/\.(post|put)$/) ||
          methodName.toLowerCase().match(/^(post|put)/)
        )) ||
        // 检查 axios({ method: 'POST' }) 或 axios({ method: 'PUT' })
        (methodName.includes('axios') && callPath.node.arguments.some(arg => {
          if (t.isObjectExpression(arg)) {
            return arg.properties.some(prop => {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) &&
                (prop.key.name === 'method' || prop.key.name === 'type')) {
                const value = prop.value;
                if (t.isStringLiteral(value)) {
                  return value.value.toUpperCase() === 'POST' ||
                    value.value.toUpperCase() === 'PUT' ||
                    value.value.toUpperCase() === 'DELETE';
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
          if (memberExpr && memberExpr.parentPath && t.isCallExpression(memberExpr.parentPath.node)) {
            const thenCall = memberExpr.parentPath.node;
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
  // 使用AST检查，避免匹配注释和字符串
  const emptyComponents = config.rule4.customKeywords.emptyComponents || ['Empty', 'NoData', 'EmptyTip'];
  
  let hasEmptyState = false;
  
  // 检查模板中的空状态文本
  if (template) {
    const cleanTemplate = ASTUtils.removeCommentsAndStrings(template);
    hasEmptyState = cleanTemplate.includes('暂无数据') || 
                    cleanTemplate.includes('暂无') ||
                    cleanTemplate.includes('v-if="!') ||
                    cleanTemplate.includes('v-if="list.length === 0');
  }
  
  // 检查代码中的空状态
  if (!hasEmptyState) {
    // 检查空状态文本
    hasEmptyState = ASTUtils.hasKeyword(ast, content, ['暂无数据', '暂无']);
    
    // 检查空状态组件
    if (!hasEmptyState && ast) {
      emptyComponents.forEach(comp => {
        if (ASTUtils.hasJSXComponent(ast, comp)) {
          hasEmptyState = true;
        }
      });
    }
    
    // 检查长度判断
    if (!hasEmptyState) {
      hasEmptyState = ASTUtils.hasKeyword(ast, content, ['length === 0', 'length == 0', '!list', 'list.length === 0']);
    }
  }

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
 * 检查规则5：表单输入项默认提示检查
 */
function checkRule5(filePath, parsed, diff) {
  if (!config.rule5 || !config.rule5.enabled) return null;

  const errors = [];
  const { type, ast, template = '', content } = parsed;

  // 检查是否是新增文件或新增了表单输入组件
  const isNewFile = !diff || !diff.includes('---') || (diff && diff.split('\n').some(line => line.startsWith('+++') && !line.includes('---')));
  const hasNewInput = diff && (
    diff.includes('<Input') || diff.includes('<input') || diff.includes('<Select') ||
    diff.includes('<select') || diff.includes('<DatePicker') || diff.includes('<TimePicker') ||
    diff.includes('el-input') || diff.includes('el-select') || diff.includes('el-date-picker') ||
    diff.includes('<InputNumber') || diff.includes('<AutoComplete') || diff.includes('<Cascader') ||
    diff.includes('<TreeSelect') || diff.includes('<TextArea') || diff.includes('<textarea')
  );

  // 如果既不是新文件，也没有新增输入组件，则跳过检查
  if (!isNewFile && !hasNewInput) {
    return null;
  }

  // 获取配置
  const inputComponents = config.rule5.customKeywords.inputComponents || [
    'Input', 'Input.TextArea', 'Input.Password', 'Input.Search', 'Input.Group',
    'Select', 'DatePicker', 'RangePicker', 'TimePicker', 'InputNumber',
    'AutoComplete', 'Cascader', 'TreeSelect', 'Transfer', 'Upload', 'Rate',
    'el-input', 'el-select', 'el-date-picker', 'el-time-picker',
    'el-input-number', 'el-autocomplete', 'el-cascader', 'el-tree-select',
    'el-transfer', 'el-upload', 'el-rate',
    'input', 'select', 'textarea'
  ];
  const placeholderAttributes = config.rule5.customKeywords.placeholderAttributes || ['placeholder', 'placeholderText'];
  const whitelistKeywords = config.rule5.whitelist.keywords || [];

  // 对于 JSX/TSX 文件，使用 AST 进行更精确的检查
  if (ast && (type === 'js' || type === 'jsx' || type === 'ts' || type === 'tsx')) {
    traverse(ast, {
      JSXOpeningElement(path) {
        const elementName = path.node.name;
        let componentName = '';

        // 获取组件名
        if (t.isJSXIdentifier(elementName)) {
          componentName = elementName.name;
        } else if (t.isJSXMemberExpression(elementName)) {
          // 处理 Input.TextArea 这种情况
          const object = elementName.object;
          const property = elementName.property;
          if (t.isJSXIdentifier(object) && t.isJSXIdentifier(property)) {
            componentName = `${object.name}.${property.name}`;
          }
        }

        // 排除常见的子组件，这些组件不需要placeholder
        // 注意：Input.TextArea, Input.Password, Input.Search 等是真正的输入组件，需要placeholder，不应该排除
        // 只有容器组件、选项组件等子组件才需要排除
        const excludedSubComponents = [
          // Select 相关子组件
          'Select.Option', 'Select.OptGroup',
          // Input 容器组件（Input.Group 是容器，不需要placeholder）
          // 注意：Input.TextArea, Input.Password, Input.Search 不在排除列表中，因为它们需要placeholder
          'Input.Group',
          // Cascader 相关子组件
          'Cascader.Option',
          // TreeSelect 相关子组件
          'TreeSelect.TreeNode',
          // Form 相关子组件
          'Form.Item', 'Form.List', 'Form.Provider',
          // Upload 相关子组件
          'Upload.Dragger', 'Upload.Button',
          // Transfer 相关子组件
          'Transfer.List', 'Transfer.Search',
          // Table 相关子组件（虽然不在inputComponents中，但以防万一）
          'Table.Column', 'Table.ColumnGroup',
          // Radio 相关子组件
          'Radio.Group', 'Radio.Button',
          // Checkbox 相关子组件
          'Checkbox.Group',
          // Menu 相关子组件
          'Menu.Item', 'Menu.SubMenu', 'Menu.ItemGroup',
          // Dropdown 相关子组件
          'Dropdown.Button',
          // Steps 相关子组件
          'Steps.Step',
          // Tabs 相关子组件
          'Tabs.TabPane', 'Tabs.Tab',
          // Collapse 相关子组件
          'Collapse.Panel',
          // Timeline 相关子组件
          'Timeline.Item',
          // Breadcrumb 相关子组件
          'Breadcrumb.Item', 'Breadcrumb.Separator',
          // Anchor 相关子组件
          'Anchor.Link',
          // Pagination 相关子组件
          'Pagination.Item',
          // Rate 相关子组件
          'Rate.Character',
          // Slider 相关子组件
          'Slider.Marks', 'Slider.Mark',
          // DatePicker 和 TimePicker 的 RangePicker 是独立的输入组件，需要placeholder，不在排除列表中
        ];
        if (excludedSubComponents.includes(componentName)) {
          return; // 跳过子组件检查
        }

        // 检查是否是配置的输入组件
        const isInputComponent = inputComponents.some(comp => {
          if (comp.includes('.')) {
            // 对于带点的组件（如 Input.TextArea），必须精确匹配
            return comp === componentName;
          } else {
            // 对于不带点的组件（如 Select, Input），只检查最上层组件
            // 如果 componentName 包含点（如 Select.Option），需要进一步判断
            if (componentName.includes('.')) {
              // 检查是否是配置中明确允许的带点组件（如 Input.TextArea, Input.Password, Input.Search）
              const isExplicitlyAllowed = inputComponents.some(c => c.includes('.') && c === componentName);
              if (isExplicitlyAllowed) {
                return true; // 是配置中允许的带点输入组件，需要检查placeholder
              }
              return false; // 其他带点的都是子组件，不匹配
            }
            return comp === componentName || componentName.startsWith(comp);
          }
        });

        if (!isInputComponent) {
          return;
        }

        // 检查白名单
        const attributes = path.node.attributes || [];
        const hasWhitelistKeyword = attributes.some(attr => {
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
            const attrValue = attr.value;
            if (t.isStringLiteral(attrValue)) {
              return whitelistKeywords.some(keyword => attrValue.value.includes(keyword));
            }
          }
          return false;
        });

        if (hasWhitelistKeyword) {
          return;
        }

        // 检查是否有 placeholder 属性
        let hasPlaceholder = false;
        for (const attr of placeholderAttributes) {
          const hasAttr = attributes.some(attrNode => {
            if (t.isJSXAttribute(attrNode) && t.isJSXIdentifier(attrNode.name)) {
              return attrNode.name.name === attr || attrNode.name.name.toLowerCase() === attr.toLowerCase();
            }
            return false;
          });
          if (hasAttr) {
            hasPlaceholder = true;
            break;
          }
        }

        // 如果没有 placeholder，检查是否是新增的
        if (!hasPlaceholder) {
          const line = path.node.loc?.start.line || 0;
          
          // 检查是否是新增的（通过检查 diff）
          let isNewlyAdded = isNewFile;
          if (!isNewFile && diff) {
            const diffLines = diff.split('\n');
            for (let i = 0; i < diffLines.length; i++) {
              const line = diffLines[i];
              if (line.startsWith('+') && !line.startsWith('+++')) {
                if (line.includes(componentName) && line.includes('<')) {
                  isNewlyAdded = true;
                  break;
                }
              }
            }
          }

          if (isNewlyAdded) {
            errors.push({
              rule: 5,
              file: filePath,
              line: line,
              message: `新增的表单输入组件「${componentName}」缺少 placeholder 提示属性`,
              suggestion: `为 ${componentName} 组件添加 placeholder 属性，提升用户体验。例如：<${componentName} placeholder="请输入..." />`
            });
          }
        }
      }
    });
  } else {
    // 对于 Vue 和 HTML 文件，使用正则表达式检查
    const fullContent = content || '';
    const templateContent = template || '';
    const combinedContent = fullContent + '\n' + templateContent;

    // 移除注释内容，避免匹配到注释中的代码
    const contentWithoutComments = combinedContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* */ 注释
      .replace(/\/\/.*$/gm, ''); // 移除 // 注释

    // 检查每个输入组件
    for (const componentName of inputComponents) {
      // 构建匹配模式
      let componentPattern;
      if (componentName.includes('.')) {
        // 处理 Input.TextArea 这种形式
        const parts = componentName.split('.');
        componentPattern = new RegExp(`<${parts[0]}[^>]*\\.${parts[1]}[^>]*>`, 'gi');
      } else {
        // 处理普通组件名
        componentPattern = new RegExp(`<${componentName}[^>]*>`, 'gi');
      }

      // 查找所有匹配的组件
      let match;
      while ((match = componentPattern.exec(contentWithoutComments)) !== null) {
        const componentTag = match[0];
        const matchIndex = match.index;

        // 检查是否在白名单中
        if (whitelistKeywords.some(keyword => componentTag.includes(keyword))) {
          continue;
        }

        // 检查是否有 placeholder 属性
        let hasPlaceholder = false;
        for (const attr of placeholderAttributes) {
          // 检查 JSX 格式：placeholder="..." 或 placeholder={...}
          const jsxPattern = new RegExp(`${attr}\\s*=\\s*["'{]`, 'i');
          // 检查 Vue 格式：:placeholder="..." 或 placeholder="..." 或 v-bind:placeholder="..."
          const vuePattern = new RegExp(`[:]?${attr}\\s*=\\s*["'{]|v-bind:${attr}\\s*=\\s*["'{]`, 'i');
          
          if (jsxPattern.test(componentTag) || vuePattern.test(componentTag)) {
            hasPlaceholder = true;
            break;
          }
        }

        // 如果没有 placeholder，记录错误
        if (!hasPlaceholder) {
          // 计算行号
          const beforeMatch = contentWithoutComments.substring(0, matchIndex);
          const lineNum = beforeMatch.split('\n').length;

          // 检查是否是新增的（在 diff 中）
          let isNewlyAdded = isNewFile;
          if (!isNewFile && diff) {
            // 检查 diff 中是否包含这个组件
            const diffLines = diff.split('\n');
            for (let i = 0; i < diffLines.length; i++) {
              const line = diffLines[i];
              if (line.startsWith('+') && !line.startsWith('+++')) {
                if (line.includes(componentName) && (line.includes('<') || line.includes('<'))) {
                  isNewlyAdded = true;
                  break;
                }
              }
            }
          }

          // 只检查新增的组件
          if (isNewlyAdded) {
            errors.push({
              rule: 5,
              file: filePath,
              line: lineNum,
              message: `新增的表单输入组件「${componentName}」缺少 placeholder 提示属性`,
              suggestion: `为 ${componentName} 组件添加 placeholder 属性，提升用户体验。例如：<${componentName} placeholder="请输入..." />`
            });
          }
        }
      }
    }
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
 * 从接口调用中提取 Action 名称
 * 例如：props.GetLabelTypePullDownAction() -> GetLabelTypePullDownAction
 */
function getActionNameFromCall(callPath) {
  if (t.isMemberExpression(callPath.node.callee)) {
    const property = callPath.node.callee.property;
    if (t.isIdentifier(property) && property.name.endsWith('Action')) {
      return property.name;
    }
  }
  return null;
}

/**
 * 从文件中解析 namespace 导入，找到对应的接口文件路径
 * 例如：import { NS_COURSELIBRARY, NS_GLOBAL } from '~/enumerate/namespace';
 * 返回：namespace 到文件路径的映射
 */
function parseNamespaceImports(ast, filePath) {
  const namespaceMap = {};
  
  if (!ast) return namespaceMap;
  
  try {
    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        // 检查是否是 namespace 导入
        if (source.includes('namespace') || source.includes('enumerate')) {
          const specifiers = path.node.specifiers;
          for (const specifier of specifiers) {
            if (t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported)) {
              const namespaceName = specifier.imported.name;
              // 解析导入路径，找到对应的接口文件
              const namespaceFile = resolveNamespaceFile(source, filePath);
              if (namespaceFile) {
                namespaceMap[namespaceName] = namespaceFile;
              }
            }
          }
        }
      }
    });
  } catch (e) {
    // 解析失败，返回空映射
  }
  
  return namespaceMap;
}

/**
 * 解析 namespace 文件路径
 * 例如：'~/enumerate/namespace' -> 实际文件路径
 */
function resolveNamespaceFile(importPath, currentFilePath) {
  try {
    const projectRoot = process.cwd();
    
    // 处理 ~ 别名
    if (importPath.startsWith('~/')) {
      importPath = importPath.replace('~/', 'src/');
    }
    
    // 尝试多个可能的路径（包括 index.js）
    const possiblePaths = [
      // 直接文件路径：src/enumerate/namespace.js
      path.join(projectRoot, importPath + '.js'),
      path.join(projectRoot, importPath + '.ts'),
      path.join(projectRoot, importPath + '.jsx'),
      path.join(projectRoot, importPath + '.tsx'),
      // 目录下的 index 文件：src/enumerate/namespace/index.js
      path.join(projectRoot, importPath, 'index.js'),
      path.join(projectRoot, importPath, 'index.ts'),
      path.join(projectRoot, importPath, 'index.jsx'),
      path.join(projectRoot, importPath, 'index.tsx'),
      // 相对路径
      path.join(path.dirname(currentFilePath), importPath + '.js'),
      path.join(path.dirname(currentFilePath), importPath + '.ts'),
      path.join(path.dirname(currentFilePath), importPath, 'index.js'),
      path.join(path.dirname(currentFilePath), importPath, 'index.ts'),
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
    }
  } catch (e) {
    // 解析失败
  }
  
  return null;
}

/**
 * 从 namespace 文件中查找所有 namespace 的值
 * namespace 文件通常包含类似：export const NS_COURSELIBRARY = defineNamespace('courseLibrary');
 * 返回：{ NS_COURSELIBRARY: 'courseLibrary', NS_GLOBAL: 'global' }
 */
function parseNamespaceValues(namespaceFile) {
  const namespaceValues = {};
  
  if (!namespaceFile || !fs.existsSync(namespaceFile)) return namespaceValues;
  
  try {
    const content = fs.readFileSync(namespaceFile, 'utf-8');
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties']
    });
    
    traverse(ast, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id) && path.node.id.name.startsWith('NS_')) {
          // 处理字符串字面量：export const NS_COURSELIBRARY = 'courseLibrary';
          if (t.isStringLiteral(path.node.init)) {
            namespaceValues[path.node.id.name] = path.node.init.value;
          }
          // 处理 defineNamespace 调用：export const NS_COURSELIBRARY = defineNamespace('courseLibrary');
          else if (t.isCallExpression(path.node.init)) {
            const callee = path.node.init.callee;
            if (t.isIdentifier(callee) && callee.name === 'defineNamespace') {
              const args = path.node.init.arguments;
              if (args.length > 0 && t.isStringLiteral(args[0])) {
                namespaceValues[path.node.id.name] = args[0].value;
              }
            }
          }
        }
      }
    });
  } catch (e) {
    // 解析失败
  }
  
  return namespaceValues;
}

/**
 * 根据 namespace 值找到对应的接口文件路径
 * 例如：'global' -> 'src/api/global/index.js'
 *      'courseLibrary' -> 'src/api/courseLibrary/index.js'
 */
function getActionFilesFromNamespaceValues(namespaceValues) {
  const actionFiles = [];
  const projectRoot = process.cwd();
  
  for (const namespaceValue of Object.values(namespaceValues)) {
    // 根据示例，接口文件在 src/api/{namespaceValue}/index.js
    const possiblePaths = [
      path.join(projectRoot, 'src', 'api', namespaceValue, 'index.js'),
      path.join(projectRoot, 'src', 'api', namespaceValue, 'index.ts'),
      path.join(projectRoot, 'src', 'api', namespaceValue, 'index.jsx'),
      path.join(projectRoot, 'src', 'api', namespaceValue, 'index.tsx'),
      // 兼容其他可能的路径
      path.join(projectRoot, 'src', 'models', namespaceValue, 'index.js'),
      path.join(projectRoot, 'src', 'models', namespaceValue, 'index.ts'),
      path.join(projectRoot, 'src', 'services', namespaceValue, 'index.js'),
      path.join(projectRoot, 'src', 'services', namespaceValue, 'index.ts'),
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        actionFiles.push(possiblePath);
        break; // 找到一个就停止
      }
    }
  }
  
  return actionFiles;
}

/**
 * 从文件中查找 declareRequest 定义并提取 loading 名称（无论第一个参数是什么）
 * 例如：export const GetLabelTypePullDownAction = declareRequest('pageLoading', ...)
 * 返回：{ actionName: 'GetLabelTypePullDownAction', loadingName: 'pageLoading' }
 */
function findDeclareRequestInfo(actionName, filePath, ast) {
  if (!actionName) return null;
  
  try {
    // 首先尝试从当前文件的 namespace 导入中找到接口文件
    const namespaceMap = parseNamespaceImports(ast, filePath);
    const actionFiles = [];
    
    // 根据 namespace 找到接口文件
    // 1. 找到 namespace 文件（如 ~/enumerate/namespace）
    for (const [namespaceName, namespaceFile] of Object.entries(namespaceMap)) {
      if (namespaceFile && fs.existsSync(namespaceFile)) {
        // 2. 解析 namespace 文件，获取所有 namespace 的值
        const namespaceValues = parseNamespaceValues(namespaceFile);
        
        // 3. 根据 namespace 值找到对应的接口文件（如 src/api/global/index.js）
        const files = getActionFilesFromNamespaceValues(namespaceValues);
        actionFiles.push(...files);
      }
    }
    
    // 如果没找到，使用通用搜索
    if (actionFiles.length === 0) {
      const projectRoot = process.cwd();
      const searchPaths = [
        path.join(projectRoot, 'src/**/*.{js,jsx,ts,tsx}'),
        path.join(projectRoot, '**/action*.{js,jsx,ts,tsx}'),
        path.join(projectRoot, '**/api*.{js,jsx,ts,tsx}'),
        path.join(projectRoot, '**/service*.{js,jsx,ts,tsx}'),
      ];
      
      const currentDir = path.dirname(filePath);
      searchPaths.unshift(path.join(currentDir, '**/*.{js,jsx,ts,tsx}'));
      
      for (const pattern of searchPaths) {
        try {
          const matches = glob.sync(pattern, { ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'] });
          actionFiles.push(...matches);
        } catch (e) {
          // 忽略错误
        }
      }
    }
    
    // 去重
    const uniqueFiles = [...new Set(actionFiles)];
    
    // 遍历文件查找 declareRequest 定义
    for (const file of uniqueFiles) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf-8');
        
        // 检查是否包含目标 Action 名称
        if (!content.includes(actionName) || !content.includes('declareRequest')) {
          continue;
        }
        
        // 解析文件
        const fileAst = parser.parse(content, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties']
        });
        
        // 查找 declareRequest 调用
        let found = null;
        traverse(fileAst, {
          VariableDeclarator(path) {
            if (t.isIdentifier(path.node.id) && path.node.id.name === actionName) {
              if (t.isCallExpression(path.node.init)) {
                const callee = path.node.init.callee;
                if (t.isIdentifier(callee) && callee.name === 'declareRequest') {
                  // 提取第一个参数（loading 名称）
                  const args = path.node.init.arguments;
                  if (args.length > 0 && t.isStringLiteral(args[0])) {
                    const loadingName = args[0].value;
                    // 返回所有找到的接口定义（无论第一个参数是什么）
                    found = {
                      actionName: actionName,
                      loadingName: loadingName
                    };
                    path.stop();
                  }
                }
              }
            }
          },
          AssignmentExpression(path) {
            if (t.isMemberExpression(path.node.left)) {
              const property = path.node.left.property;
              if (t.isIdentifier(property) && property.name === actionName) {
                if (t.isCallExpression(path.node.right)) {
                  const callee = path.node.right.callee;
                  if (t.isIdentifier(callee) && callee.name === 'declareRequest') {
                    const args = path.node.right.arguments;
                    if (args.length > 0 && t.isStringLiteral(args[0])) {
                      const loadingName = args[0].value;
                      // 返回所有找到的接口定义（无论第一个参数是什么）
                      found = {
                        actionName: actionName,
                        loadingName: loadingName
                      };
                      path.stop();
                    }
                  }
                }
              }
            }
          }
        });
        
        if (found) {
          return found;
        }
      } catch (e) {
        // 解析失败，跳过该文件
        continue;
      }
    }
  } catch (e) {
    // 查找失败，返回 null
  }
  
  return null;
}

/**
 * 从文件中查找 declareRequest 定义并提取 loading 名称
 * 例如：export const GetLabelTypePullDownAction = declareRequest('loading', ...)
 * 返回：{ actionName: 'GetLabelTypePullDownAction', loadingName: 'loading' }
 * 
 * 注意：只有当第一个参数严格等于 'loading' 时，才返回 loading 信息
 * 如果第一个参数是其他值（如 'pageLoading'），则返回 null
 */
function findDeclareRequestLoading(actionName, filePath, ast) {
  // 调用 findDeclareRequestInfo 查找接口定义
  const info = findDeclareRequestInfo(actionName, filePath, ast);
  
  // 只有当第一个参数严格等于 'loading' 时，才返回 loading 信息
  if (info && info.loadingName === 'loading') {
    return info;
  }
  
  return null;
}

/**
 * 检查页面中是否使用了 declareRequest 定义的 loading
 * 例如：const { pageLoading } = props.global; 和 <Spin spinning={pageLoading}>
 * 
 * @param {string} loadingName - loading 名称
 * @param {string} content - 文件内容
 * @param {string} template - 模板内容（Vue 文件）
 * @param {boolean} requireJSXUsage - 是否要求在 JSX 中实际使用（规则2需要）
 */
function checkDeclareRequestLoadingUsage(loadingName, content, template = '', requireJSXUsage = false) {
  if (!loadingName) return false;
  
  // 合并 content 和 template 进行统一检查
  const fullContent = (content || '') + '\n' + (template || '');
  
  // 转义特殊字符
  const escapedLoadingName = loadingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 检查解构赋值：const { pageLoading } = props.global; 或 const { pageLoading, other } = props.global;
  const destructurePatterns = [
    new RegExp(`const\\s*\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}\\s*=\\s*props\\.(global|\\w+)`, 'i'),
    new RegExp(`let\\s*\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}\\s*=\\s*props\\.(global|\\w+)`, 'i'),
    new RegExp(`var\\s*\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}\\s*=\\s*props\\.(global|\\w+)`, 'i')
  ];
  
  let hasDestructure = false;
  for (const pattern of destructurePatterns) {
    if (pattern.test(fullContent)) {
      hasDestructure = true;
      break;
    }
  }
  
  // 如果要求 JSX 使用，则必须同时满足解构赋值和在 JSX 中使用
  if (requireJSXUsage) {
    if (!hasDestructure) {
      return false; // 没有解构赋值，直接返回 false
    }
    
    // 检查是否在 JSX 中实际使用（排除注释）
    // 移除注释内容，避免匹配到注释中的代码
    const contentWithoutComments = fullContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* */ 注释
      .replace(/\/\/.*$/gm, ''); // 移除 // 注释
    
    // 检查模板中使用：<Spin spinning={pageLoading}> 或 <Table loading={pageLoading}> 或 <Button loading={pageLoading}>
    const templatePatterns = [
      new RegExp(`<Spin[^>]*spinning=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
      new RegExp(`<Table[^>]*loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
      new RegExp(`<Button[^>]*loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
      new RegExp(`spinning=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
      new RegExp(`loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
      new RegExp(`spinning=\\{[^}]*${escapedLoadingName}[^}]*\\}`, 'i'),
      new RegExp(`loading=\\{[^}]*${escapedLoadingName}[^}]*\\}`, 'i')
    ];
    
    for (const pattern of templatePatterns) {
      if (pattern.test(contentWithoutComments)) {
        return true; // 有解构赋值且在 JSX 中使用
      }
    }
    
    return false; // 有解构赋值但没有在 JSX 中使用
  }
  
  // 不需要 JSX 使用的情况（规则1），只要有解构赋值或直接使用即可
  if (hasDestructure) {
    return true;
  }
  
  // 检查直接使用：props.global.pageLoading 或 props.xxx.pageLoading
  const directPattern = new RegExp(`props\\.(global|\\w+)\\.${escapedLoadingName}`, 'i');
  if (directPattern.test(fullContent)) {
    return true;
  }
  
  // 检查模板中使用：<Spin spinning={pageLoading}> 或 <Table loading={pageLoading}> 或 <Button loading={pageLoading}>
  const templatePatterns = [
    new RegExp(`<Spin[^>]*spinning=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
    new RegExp(`<Table[^>]*loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
    new RegExp(`<Button[^>]*loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
    new RegExp(`spinning=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
    new RegExp(`loading=\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i'),
    new RegExp(`spinning=\\{[^}]*${escapedLoadingName}[^}]*\\}`, 'i'),
    new RegExp(`loading=\\{[^}]*${escapedLoadingName}[^}]*\\}`, 'i')
  ];
  
  for (const pattern of templatePatterns) {
    if (pattern.test(fullContent)) {
      return true;
    }
  }
  
  // 检查变量直接使用：pageLoading（在 JSX 表达式中）
  const variablePattern = new RegExp(`\\b${escapedLoadingName}\\b`, 'i');
  if (variablePattern.test(fullContent)) {
    // 进一步检查是否在 JSX 表达式中使用（如 {pageLoading}）
    const jsxUsagePattern = new RegExp(`\\{[^}]*\\b${escapedLoadingName}\\b[^}]*\\}`, 'i');
    if (jsxUsagePattern.test(fullContent)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查是否是接口调用
 * 支持多种接口调用方式：
 * 1. declareRequest + Connect (通过 props 调用) - props.xxxAction()
 * 2. http.Post / http.Get - http.Post(), http.Get()
 * 3. axios - axios.post(), axios.get(), axios({})
 * 4. XMLHttpRequest - new XMLHttpRequest(), xhr.open(), xhr.send()
 * 5. props.dispatch - props.dispatch({ type: '...' })
 * 6. fetchDataApi - fetchDataApi(params)
 * 7. fetch - fetch()
 * 8. $http - this.$http.post(), this.$http.get()
 * 9. ajax - $.ajax(), jQuery.ajax()
 */
function isApiCall(callPath) {
  const callee = callPath.node.callee;
  const methodName = getMethodName(callee);

  // 获取配置的请求方法关键词
  const requestMethods = config.rule1?.customKeywords?.requestMethods ||
    config.rule2?.customKeywords?.requestMethods ||
    ['fetch', 'axios', 'request', 'http', 'api'];

  // 1. 检查常见的 HTTP 请求方法
  const httpMethods = ['post', 'get', 'put', 'delete', 'patch', 'request'];
  if (httpMethods.some(method => methodName.toLowerCase().includes(method))) {
    // 检查是否是接口调用（排除非接口调用的方法）
    const excludePatterns = ['console', 'log', 'warn', 'error', 'debug', 'info'];
    if (!excludePatterns.some(pattern => methodName.toLowerCase().includes(pattern))) {
      return true;
    }
  }

  // 2. 检查 props.xxxAction() 模式（dva-runtime declareRequest）
  if (t.isMemberExpression(callee)) {
    const object = callee.object;
    const property = callee.property;

    // props.xxxAction() 或 this.props.xxxAction()
    if (t.isIdentifier(object) && object.name === 'props') {
      if (t.isIdentifier(property) && property.name.endsWith('Action')) {
        return true;
      }
    }

    // this.props.xxxAction()
    if (t.isMemberExpression(object)) {
      // object 应该是 this.props，检查 object.object 是否是 this
      const isThisProps = (t.isThisExpression(object.object) ||
        (t.isIdentifier(object.object) && object.object.name === 'this')) &&
        t.isIdentifier(object.property) &&
        object.property.name === 'props';
      if (isThisProps && t.isIdentifier(property) && property.name.endsWith('Action')) {
        return true;
      }
    }

    // http.Post(), http.Get() 等
    if (t.isIdentifier(object) && object.name === 'http') {
      if (t.isIdentifier(property) && ['Post', 'Get', 'Put', 'Delete', 'Patch'].includes(property.name)) {
        return true;
      }
    }

    // this.$http.post(), this.$http.get() 等
    if (t.isMemberExpression(object) &&
      t.isIdentifier(object.property) && object.property.name === '$http') {
      if (t.isIdentifier(property) && httpMethods.includes(property.name.toLowerCase())) {
        return true;
      }
    }

    // $.ajax(), jQuery.ajax()
    if ((t.isIdentifier(object) && object.name === '$') ||
      (t.isIdentifier(object) && object.name === 'jQuery')) {
      if (t.isIdentifier(property) && property.name === 'ajax') {
        return true;
      }
    }

    // ajax.post(), ajax.get() 等（自定义 ajax 对象）
    if (t.isIdentifier(object) && object.name === 'ajax') {
      if (t.isIdentifier(property) && httpMethods.includes(property.name.toLowerCase())) {
        return true;
      }
    }
  }

  // 3. 检查 axios({}) 或 axios.post() 等
  if (t.isIdentifier(callee) && callee.name === 'axios') {
    return true;
  }

  // 4. 检查 fetch()
  if (t.isIdentifier(callee) && callee.name === 'fetch') {
    return true;
  }

  // 5. 检查 fetchDataApi()
  if (t.isIdentifier(callee) && callee.name === 'fetchDataApi') {
    return true;
  }

  // 6. 检查 props.dispatch()
  if (t.isMemberExpression(callee)) {
    const object = callee.object;
    const property = callee.property;

    if (t.isIdentifier(object) && object.name === 'props' &&
      t.isIdentifier(property) && property.name === 'dispatch') {
      // 检查 dispatch 的参数是否是对象，且包含 type 字段
      const args = callPath.node.arguments;
      if (args.length > 0 && t.isObjectExpression(args[0])) {
        const props = args[0].properties;
        const hasType = props.some(prop =>
          t.isObjectProperty(prop) &&
          t.isIdentifier(prop.key) &&
          prop.key.name === 'type'
        );
        if (hasType) {
          return true;
        }
      }
    }
  }

  // 7. 检查 XMLHttpRequest 相关调用
  if (t.isNewExpression(callee) &&
    t.isIdentifier(callee.callee) &&
    callee.callee.name === 'XMLHttpRequest') {
    return true;
  }

  // 检查 xhr.open(), xhr.send() 等方法调用
  if (t.isMemberExpression(callee)) {
    const property = callee.property;
    if (t.isIdentifier(property) && ['open', 'send', 'setRequestHeader'].includes(property.name)) {
      // 检查对象是否是 xhr 或 XMLHttpRequest 实例
      const object = callee.object;
      if (t.isIdentifier(object)) {
        // 简单检查：如果变量名包含 xhr 或 http，认为是 XMLHttpRequest
        if (object.name.toLowerCase().includes('xhr') ||
          object.name.toLowerCase().includes('http')) {
          return true;
        }
      }
    }
  }

  // 8. 检查配置中的自定义请求方法关键词
  if (requestMethods.some(method => methodName.toLowerCase().includes(method.toLowerCase()))) {
    // 排除非接口调用的方法
    const excludePatterns = ['console', 'log', 'warn', 'error', 'debug', 'info', 'parse', 'stringify'];
    if (!excludePatterns.some(pattern => methodName.toLowerCase().includes(pattern))) {
      return true;
    }
  }

  return false;
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

      // 执行5项规则检查
      try {
        const errors1 = checkRule1(file, parsed, diff);
        const errors2 = checkRule2(file, parsed, diff);
        const errors3 = checkRule3(file, parsed, diff);
        const errors4 = checkRule4(file, parsed, diff);
        const errors5 = checkRule5(file, parsed, diff);

        if (errors1) allErrors.push(...errors1);
        if (errors2) allErrors.push(...errors2);
        if (errors3) allErrors.push(...errors3);
        if (errors4) allErrors.push(...errors4);
        if (errors5) allErrors.push(...errors5);
      } catch (checkError) {
        // 如果检查规则时出错，记录错误但继续检查其他文件
        console.warn(chalk.yellow(`⚠️  检查文件 ${file} 的规则时出错: ${checkError.message}`));
        // 如果错误是严重的（如语法错误），可以考虑阻止提交
        if (checkError.message.includes('traverse') || checkError.message.includes('scope')) {
          console.error(chalk.red(`❌ 检查工具内部错误，请检查代码或联系维护人员`));
          // 不阻止提交，但记录错误
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  检查文件 ${file} 时出错: ${error.message}`));
      // 解析文件失败时，跳过该文件
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
    4: '非 Table 列表缺失自定义空状态',
    5: '表单输入项缺失 placeholder 提示'
  };
  return names[ruleNum] || '未知规则';
}

// 如果直接运行此文件，执行检查
if (require.main === module) {
  const success = runChecks();
  process.exit(success ? 0 : 1);
}

module.exports = { runChecks };

