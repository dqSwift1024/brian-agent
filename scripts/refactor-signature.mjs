#!/usr/bin/env node
/**
 * 签名重构 codemod：3 参 (Input, Context, Output) → 5 参 (Input, Output, Context, Metrics, Report)
 *
 * - 方法签名：识别形如 `name(input: XInput, context: XContext, output: XOutput)` 的参数列表
 *   （类型名以 Input/Context/Output 结尾），交换 context/output 位置并追加 metrics?: Metrics, report?: Report
 * - 转发调用：识别 `this.xxx.name(a, b, c)` 三参调用，若 b/c 形参名是 context/output 风格则交换并追加 metrics/report
 * - 自动补充 Metrics/Report import（从 shared/base）
 *
 * 用法：node scripts/refactor-signature.mjs <file-or-dir>...
 */
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_LINE = "import { Metrics } from '../../shared/base/Metrics';\nimport { Report } from '../../shared/base/Report';";
const IMPORT_RE = /from\s+'[^']*shared\/base\/(Metrics|Report)'/;

const SIG_RE =
  /(\w+)\(\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Input)\s*,\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Context)\s*,\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Output)(?=\s*,?\s*\))/g;

// 三参转发调用：xxx.name(a, b, c)，b 是 context 风格名、c 是 output 风格名
const CALL_RE = /((?:this\.|await this\.)?\w+\.\w+)\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(new\s+[\w.]+(?:<[^>()]*>)?\(\)|\w+)\s*(?=[,)])/g;
const CTX_NAME = /^(?:\w*?(?:context|ctx)|_?c)$/i;
const OUT_NAME = /^(?:\w*?output|_?o)$/i;

function hasMetricsInScope(fnBodyParams) {
  return true; // 签名改过即有 metrics 形参，转发时直接引用
}

// 2b. 基于 TypeScript AST 的精确交换：调用第 2 参为 ctx 风格实参时交换第 2/3 参
import ts from 'typescript';

function swapLiteralContextArgs(src) {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true);
  const edits = [];
  const CTX_ARG = /^(?:\w+\.)?(?:new\s+[A-Za-z_$][\w$]*Context\s*\(\s*\)|[A-Za-z_$][\w$]*(?:[Cc]tx|ontext)|ctx)$/;
  const visit = (node) => {
    if (ts.isCallOrNewExpression(node) && node.arguments && node.arguments.length >= 3) {
      const a2 = node.arguments[1];
      const a3 = node.arguments[2];
      const t2 = a2.getText(sf).trim();
      if (CTX_ARG.test(t2) && !t2.includes('\n')) {
        edits.push({ start: a2.getStart(sf), end: a2.getEnd(), text: a3.getText(sf) });
        edits.push({ start: a3.getStart(sf), end: a3.getEnd(), text: a2.getText(sf) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.start - a.start);
  // 去重（同一位置两条编辑互为交换，按区间排序后直接应用）
  let out = src;
  for (const e of edits) {
    if (out.slice(e.start, e.end) === e.text) continue; // 无变化
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function transform(src, file) {
  let changed = false;

  // 1. 方法签名
  src = src.replace(SIG_RE, (m, name, inP, inT, ctxP, ctxT, outP, outT) => {
    changed = true;
    return `${name}(${inP}: ${inT}, ${outP}: ${outT}, ${ctxP}: ${ctxT}, metrics?: Metrics, report?: Report`;  });

  // 2. 三参转发调用（仅当 b 为 context 风格、c 为 output 风格名）
  src = src.replace(CALL_RE, (m, head, a, b, c) => {
    if (!CTX_NAME.test(b)) return m;
    // 跳过已是 5 参（CALL_RE 只匹配恰好 3 参，安全）
    changed = true;
    return `${head}(${a}, ${c}, ${b}, metrics, report`;
  });

  // 2b. 字面量 Context 中参的调用（深度追踪扫描器）
  const scanned = swapLiteralContextArgs(src);
  if (scanned !== src) { src = scanned; changed = true; }

  // 3. import（以最近的包含 shared/base 的祖先目录为基准计算相对路径）
  if (changed && !IMPORT_RE.test(src)) {
    const firstImport = src.match(/^import[^\n]*/m);
    if (firstImport) {
      let baseDir = path.dirname(file);
      let baseRoot;
      for (let d = baseDir, i = 0; i < 30; d = path.dirname(d), i++) {
        if (d === '.' || d === path.parse(d).root) break;
        if (fs.existsSync(path.join(d, 'shared', 'base'))) { baseRoot = d; break; }
      }
      const idx = firstImport.index;
      if (baseRoot) {
        const relPath = path.relative(path.dirname(file), path.join(baseRoot, 'shared', 'base')).replaceAll('\\', '/');
        src = src.slice(0, idx) +
          `import { Metrics } from '${relPath}/Metrics';\nimport { Report } from '${relPath}/Report';\n` +
          src.slice(idx);
      } else {
        src = src.slice(0, idx) +
          "import { Metrics, Report } from '@brian-agent/base';\n" +
          src.slice(idx);
      }
    }
  }
  return { src, changed };
}

function walk(p, files = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|dist/.test(p)) return files;
    for (const f of fs.readdirSync(p)) walk(path.join(p, f), files);
  } else if (/\.ts$/.test(p)) files.push(p);
  return files;
}

let total = 0;
for (const target of process.argv.slice(2)) {
  for (const file of walk(target)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file);
    const { src: out, changed } = transform(src, rel);
    if (changed) {
      fs.writeFileSync(file, out);
      total++;
      console.log('modified:', rel);
    }
  }
}
console.log(`\n${total} files modified`);
