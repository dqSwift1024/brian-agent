/**
 * @fileoverview Brian-Agent 单文件可执行（SEA）构建脚本。
 *
 * 流程：
 *   1. esbuild 打包后端（entry.ts）为单 CJS bundle，内联 JS，external 原生模块 .node
 *   2. 收集 4 个原生 .node 文件 + 前端静态文件作为 SEA assets
 *   3. node --experimental-sea-config 生成 blob
 *   4. postject 注入 node 副本 → 单文件可执行
 *
 * 用法（在目标平台上执行）：
 *   node packaging/build.mjs
 *
 * 平台/架构由当前构建环境决定（原生 .node 与 node 二进制均为平台特定，
 * 需分别在 Windows / Linux / macOS 上构建）。
 */

import { build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist-sea');

// ---------------------------------------------------------------------------
// 平台 / 架构 / libc 识别
// ---------------------------------------------------------------------------
const platform = process.platform; // linux | darwin | win32
const arch = process.arch; // x64 | arm64
const abi = process.versions.modules;

function isMusl() {
  if (platform !== 'linux') return false;
  const report = process.report?.getReport?.();
  return report?.header ? !report.header.glibcVersionRuntime : false;
}

const libc = isMusl() ? 'musl' : 'gnu';

// NAPI-RS platform 包命名（@node-rs / @lancedb 通用约定）
function napiPlatformSuffix() {
  if (platform === 'linux') return `linux-${arch}-${libc}`;
  if (platform === 'darwin') return `darwin-${arch}`;
  if (platform === 'win32') return `win32-${arch}-msvc`;
  throw new Error(`不支持的平台: ${platform}-${arch}`);
}
const suffix = napiPlatformSuffix();

// ---------------------------------------------------------------------------
// 原生 .node 文件路径解析（当前平台）
// ---------------------------------------------------------------------------
const NATIVE_FILES = {
  'better_sqlite3.node': path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  'isolated_vm.node': path.join(ROOT, 'brian-backend', 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm', 'out', 'isolated_vm.node'),
  'jieba.node': path.join(ROOT, 'node_modules', `@node-rs/jieba-${suffix}`, `jieba.${suffix}.node`),
  'lancedb.node': path.join(ROOT, 'node_modules', `@lancedb/lancedb-${suffix}`, `lancedb.${suffix}.node`),
};

// 可能位于 dist/ 的 lancedb（copy-prebuilt 复制位置）
if (!fs.existsSync(NATIVE_FILES['lancedb.node'])) {
  const alt = path.join(ROOT, 'node_modules', '@lancedb', 'lancedb', 'dist', `lancedb.${suffix}.node`);
  if (fs.existsSync(alt)) NATIVE_FILES['lancedb.node'] = alt;
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function run(cmd, cwd = ROOT) {
  console.log(`[build] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// Chrome for Testing 版本与平台目录
const CHROME_VERSION = process.env.CHROME_VERSION || '140.0.7339.80';

function chromePlatformDir() {
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (platform === 'win32') return 'win64';
  return 'linux64';
}

/** 下载当前平台的 Chrome for Testing（带本地缓存），返回 zip 路径或 null */
async function downloadChromium() {
  const dir = chromePlatformDir();
  const cachePath = path.join(DIST, 'chromium.zip');
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    console.log('[build] Chromium 已缓存，跳过下载');
    return cachePath;
  }
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${dir}/chrome-${dir}.zip`;
  console.log(`[build] 下载 Chromium: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[build] Chromium 下载失败 HTTP ${res.status}，跳过内置`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(cachePath, buf);
    console.log(`[build] Chromium 下载完成: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    return cachePath;
  } catch (e) {
    console.warn(`[build] Chromium 下载异常: ${e.message}，跳过内置`);
    return null;
  }
}

// jieba dict.txt / idf.txt 内联 plugin（打包后 __dirname 变化，改为内联 Buffer）
function jiebaDictPlugin() {
  return {
    name: 'jieba-dict',
    setup(build) {
      build.onResolve({ filter: /^@node-rs\/jieba\/dict$/ }, () => ({
        path: 'jieba-dict-virtual',
        namespace: 'jieba-dict',
      }));
      build.onLoad({ filter: /.*/, namespace: 'jieba-dict' }, async () => {
        const dict = await fs.promises.readFile(path.join(ROOT, 'node_modules', '@node-rs', 'jieba', 'dict.txt'));
        const idf = await fs.promises.readFile(path.join(ROOT, 'node_modules', '@node-rs', 'jieba', 'idf.txt'));
        return {
          contents: [
            `module.exports.dict = Buffer.from(${JSON.stringify(dict.toString('base64'))}, 'base64');`,
            `module.exports.idf = Buffer.from(${JSON.stringify(idf.toString('base64'))}, 'base64');`,
          ].join('\n'),
          loader: 'js',
        };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[build] 平台=${platform}-${arch} libc=${libc} ABI=${abi}`);
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // 校验原生文件
  for (const [key, p] of Object.entries(NATIVE_FILES)) {
    if (!fs.existsSync(p)) {
      console.error(`[build] 缺少原生模块: ${key} @ ${p}`);
      process.exit(1);
    }
    console.log(`[build] native ${key}: ${path.basename(p)}`);
  }

  // 1) esbuild 打包后端
  console.log('[build] esbuild 打包后端...');
  await esbuild({
    entryPoints: [path.join(__dirname, 'entry.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.join(DIST, 'bundle.cjs'),
    plugins: [jiebaDictPlugin()],
    external: [
      '*.node',
      '@node-rs/jieba-linux-*',
      '@node-rs/jieba-darwin-*',
      '@node-rs/jieba-win32-*',
      '@node-rs/jieba-android-*',
      '@node-rs/jieba-freebsd-*',
      '@lancedb/lancedb-linux-*',
      '@lancedb/lancedb-darwin-*',
      '@lancedb/lancedb-win32-*',
      '@lancedb/lancedb-android-*',
      '@lancedb/lancedb-freebsd-*',
    ],
    // node 内置模块自动 external；显式标记避免误打包
    logLevel: 'warning',
  });
  console.log('[build] bundle 完成:', path.join(DIST, 'bundle.cjs'));

  // 关键：SEA 的 require 默认只加载 built-in，需用 createRequire 恢复文件系统加载，
  // 否则原生 .node（绝对路径 require）会报 "No such built-in module"。
  // esbuild 的 banner 会吞掉 require 赋值，故在 bundle 生成后手动 prepend。
  {
    const bundlePath = path.join(DIST, 'bundle.cjs');
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const preamble = [
      '/* Brian-Agent SEA preamble */',
      'const { createRequire } = require("node:module");',
      'require = createRequire(process.execPath);',
      '',
    ].join('\n');
    fs.writeFileSync(bundlePath, preamble + bundle);
    console.log('[build] 已注入 createRequire preamble');
  }

  // 2) 生成 SEA 配置
  const assets = {};
  for (const [key, p] of Object.entries(NATIVE_FILES)) {
    assets[key] = p;
  }

  // 打包前端静态文件（base64 映射 → 单个 JSON asset）
  const frontendDist = path.join(ROOT, 'brian-frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    const files = {};
    const walk = (dir, prefix = '') => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const rel = prefix + name;
        if (fs.statSync(p).isDirectory()) walk(p, rel + '/');
        else files[rel] = fs.readFileSync(p).toString('base64');
      }
    };
    walk(frontendDist);
    const frontendJson = path.join(DIST, 'frontend.json');
    fs.writeFileSync(frontendJson, JSON.stringify(files));
    assets['frontend.json'] = frontendJson;
    console.log(`[build] 前端静态文件 ${Object.keys(files).length} 个已内联`);
  } else {
    console.warn('[build] 未找到前端 dist，跳过（纯后端模式）');
  }

  // 内置 Chromium（Chrome for Testing）—— 可用 --skip-chromium 跳过。
  // 注意：Chromium 体积过大（>100MB）会超出 postject 的 WASM 内存限制（256MB），
  // 故不作为 SEA asset 内嵌，而是在 postject 注入完成后 append 到可执行文件末尾
  // （ELF/PE 加载器会忽略尾部额外数据），运行时由 setup-chromium 从自身提取。
  let chromiumZipPath = null;
  if (!process.argv.includes('--skip-chromium')) {
    chromiumZipPath = await downloadChromium();
  } else {
    console.warn('[build] --skip-chromium：不内置 Chromium（CDT 回退到系统 Chrome）');
  }

  const seaConfig = {
    main: path.join(DIST, 'bundle.cjs'),
    output: path.join(DIST, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets,
  };
  const configPath = path.join(DIST, 'sea-config.json');
  fs.writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

  // 3) 生成 blob
  console.log('[build] 生成 SEA blob...');
  run(`"${process.execPath}" --experimental-sea-config ${configPath}`);

  // 4) 复制 node 二进制并注入 blob
  const exeName = platform === 'win32' ? 'brian.exe' : `brian-${platform}-${arch}`;
  const exePath = path.join(DIST, exeName);
  fs.copyFileSync(process.execPath, exePath);

  console.log('[build] 注入 blob（postject）...');
  const postjectArgs = [
    `"${exePath}"`, 'NODE_SEA_BLOB', `"${path.join(DIST, 'sea-prep.blob')}"`,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ];
  run(`npx --yes postject ${postjectArgs.join(' ')}`);

  // 5) append Chromium 到可执行文件末尾（footer: 8 字节 magic + 8 字节长度）
  if (chromiumZipPath) {
    const exeBuf = fs.readFileSync(exePath);
    const chromiumBuf = fs.readFileSync(chromiumZipPath);
    const footer = Buffer.alloc(16);
    footer.write('BRIANSEA', 0, 'ascii');
    footer.writeBigUInt64LE(BigInt(chromiumBuf.length), 8);
    fs.writeFileSync(exePath, Buffer.concat([exeBuf, chromiumBuf, footer]));
    console.log(`[build] Chromium 已追加到可执行文件末尾 (${(chromiumBuf.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(`\n[build] ✅ 完成: ${exePath}`);
  console.log(`[build] 运行: ${platform === 'win32' ? exePath : `./${exeName}`} (在 ${DIST} 目录)`);
}

main().catch((err) => {
  console.error('[build] 失败:', err);
  process.exit(1);
});
