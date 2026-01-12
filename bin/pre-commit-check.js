#!/usr/bin/env node

/**
 * Pre-commit Check CLI 入口文件
 * 
 * 此文件作为 npm 包的 bin 入口，可以直接执行检查逻辑
 */

const path = require('path');
const { runChecks } = require('../commit-check-core.js');

// 执行检查
const success = runChecks();
process.exit(success ? 0 : 1);

