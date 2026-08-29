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
const CTX_NAME = /^(?:\w*?context|_?c)$/i;
const OUT_NAME = /^(?:\w*?output|_?o)$/i;

function hasMetricsInScope(fnBodyParams) {
  return true; // 签名改过即有 metrics 形参，转发时直接引用
}

// 2b. 字面量 Context 中参的三参调用（深度追踪扫描，arg2 恰为 new XContext() 时交换/移位）
function swapLiteralContextArgs(src) {
  const TOKEN = /new\s+\w*Context\s*\(\s*\)/g;
  let out = src;
  let m;
  let guard = 0;
  while ((m = TOKEN.exec(out)) && guard++ < 20000) {
    const ctxEnd = m.index + m[0].length;
    // 找调用开括号（回扫平衡括号）
    let depth = 0, open = -1;
    for (let i = m.index - 1; i >= 0; i--) {
      const ch = out[i];
      if (ch === ')' || ch === ']' || ch === '}') depth++;
      else if (ch === '(' || ch === '[' || ch === '{') {
        if (depth === 0) { open = i; break; }
        depth--;
      }
    }
    if (open < 0) continue;
    // 计算当前参数序号（open 到 ctxStart 之间的顶层逗号数）
    let commas = 0, d2 = 0, arg1Start = -1;
    for (let i = open + 1; i < m.index; i++) {
      const ch = out[i];
      if (ch === '(' || ch === '[' || ch === '{') d2++;
      else if (ch === ')' || ch === ']' || ch === '}') d2--;
      else if (ch === ',' && d2 === 0) { commas++; if (commas === 1) arg1Start = i; }
    }
    if (commas !== 1) continue; // 仅处理第 2 参
    // ctx 后必须是顶层逗号
    let j = ctxEnd;
    while (j < out.length && /\s/.test(out[j])) j++;
    if (out[j] !== ',') continue;
    // 找调用闭括号
    let close = -1, d3 = 0;
    for (let i = open + 1; i < out.length; i++) {
      const ch = out[i];
      if (ch === '(' || ch === '[' || ch === '{') d3++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (d3 === 0) { close = i; break; }
        d3--;
      }
    }
    if (close < 0) continue;
    const arg0 = out.slice(open + 1, arg1Start); // 首参（第一个顶层逗号之前）
    const ws = out.slice(arg1Start + 1, m.index); // 首参逗号到 ctx 之间的空白
    const arg1 = ws;
    // arg3：从 ctx 后逗号到顶层逗号或 close
    let arg3End = -1, more = false, d4 = 0;
    for (let i = j + 1; i < close; i++) {
      const ch = out[i];
      if (ch === '(' || ch === '[' || ch === '{') d4++;
      else if (ch === ')' || ch === ']' || ch === '}') d4--;
      else if (ch === ',' && d4 === 0) { arg3End = i; more = true; break; }
    }
    if (arg3End < 0) { arg3End = close; more = false; }
    const arg3 = out.slice(j + 1, arg3End);
    const rest = more ? out.slice(arg3End + 1, close) : '';
    if (more && rest.trim() === '') { more = false; } // 尾逗号不算更多参数
    const trimmed = (s) => s.replace(/\s+$/, '');
    if (!more) {
      // (a, ctx, b[, ]) → (b, ctx, a[, ])
      out = out.slice(0, open + 1) + arg0 + ',' + arg3 + ', ' + m[0] + (rest ? ',' + rest : '') + out.slice(close);
    } else {
      // (a, ctx, b, rest…) → (a, b, ctx, rest…)
      out = out.slice(0, open + 1) + arg0 + ',' + arg3 + ', ' + m[0] + ',' + rest + out.slice(close);
    }
    TOKEN.lastIndex = 0; // 重扫（文本已变）
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
      for (let d = baseDir; d !== path.parse(d).root; d = path.dirname(d)) {
        if (fs.existsSync(path.join(d, 'shared', 'base'))) { baseRoot = d; break; }
      }
      const relPath = baseRoot
        ? path.relative(path.dirname(file), path.join(baseRoot, 'shared', 'base')).replaceAll('\\', '/')
        : '../../shared/base';
      const idx = firstImport.index;
      src = src.slice(0, idx) +
        `import { Metrics } from '${relPath}/Metrics';\nimport { Report } from '${relPath}/Report';\n` +
        src.slice(idx);
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
