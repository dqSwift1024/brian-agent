/**
 * @fileoverview SEA 打包用的原生模块加载器。
 *
 * 在单文件可执行（Single Executable Application）运行时，
 * 4 个原生模块（better-sqlite3 / isolated-vm / @node-rs/jieba / @lancedb/lancedb）
 * 的 .node 文件被内嵌为 SEA asset，启动时解压到临时目录，
 * 并覆盖 Module._resolveFilename 将 .node 请求重定向到解压文件。
 *
 * 开发模式（非 SEA）下不做任何处理，原生模块照常从 node_modules 加载。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';

/** SEA 内嵌 asset 的解压目标文件名（统一命名，跨平台通用） */
interface NativeAssetSpec {
  /** SEA asset key */
  assetKey: string;
  /** 解压后的文件名 */
  fileName: string;
}

const NATIVE_ASSETS: NativeAssetSpec[] = [
  { assetKey: 'better_sqlite3.node', fileName: 'better_sqlite3.node' },
  { assetKey: 'isolated_vm.node', fileName: 'isolated_vm.node' },
  { assetKey: 'jieba.node', fileName: 'jieba.node' },
  { assetKey: 'lancedb.node', fileName: 'lancedb.node' },
];

let nativeDir = '';
let hooked = false;

/** 安全地访问 node:sea（非 SEA 环境会抛错） */
function getSea(): { isSea(): boolean; getRawAsset(key: string): ArrayBuffer } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:sea') as { isSea(): boolean; getRawAsset(key: string): ArrayBuffer };
  } catch {
    return null;
  }
}

/** 解压目录：优先环境变量，其次系统临时目录下的固定位置 */
function getNativeDir(): string {
  if (nativeDir) return nativeDir;
  const base = process.env.BRIAN_NATIVE_DIR || path.join(os.tmpdir(), 'brian-agent-native');
  // 导出给 isolated-vm.js 等自定义加载器使用
  process.env.BRIAN_NATIVE_DIR = base;
  nativeDir = path.join(base, `${process.platform}-${process.arch}`);
  fs.mkdirSync(nativeDir, { recursive: true });
  return nativeDir;
}

/** 从 SEA asset 解压所有原生模块到临时目录（带缓存：文件存在且非空则跳过） */
function extractNativeAssets(sea: { getRawAsset(key: string): ArrayBuffer }): string {
  const dir = getNativeDir();
  for (const spec of NATIVE_ASSETS) {
    const dest = path.join(dir, spec.fileName);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
    try {
      const buf = sea.getRawAsset(spec.assetKey);
      fs.writeFileSync(dest, Buffer.from(buf));
    } catch (e) {
      // 该 asset 未打包（可能是可选模块），跳过
      // eslint-disable-next-line no-console
      console.warn(`[native-loader] 解压 ${spec.assetKey} 失败: ${(e as Error).message}`);
    }
  }
  return dir;
}

/** 将模块请求重定向到解压后的 .node 文件；未命中返回 null */
function resolveNative(request: string): string | null {
  const dir = nativeDir;
  if (!dir) return null;
  if (typeof request !== 'string') return null;

  // 1) NAPI-RS platform 包名（@node-rs/jieba-*、@lancedb/lancedb-*）
  if (/^@node-rs\/jieba-/.test(request)) return path.join(dir, 'jieba.node');
  if (/^@lancedb\/lancedb-/.test(request)) return path.join(dir, 'lancedb.node');

  // 2) .node 绝对/相对路径的 basename（bindings、isolated-vm、NAPI-RS 本地查找）
  if (request.endsWith('.node')) {
    const base = path.basename(request);
    if (base === 'better_sqlite3.node') return path.join(dir, 'better_sqlite3.node');
    if (base === 'isolated_vm.node') return path.join(dir, 'isolated_vm.node');
    if (/^jieba\./.test(base)) return path.join(dir, 'jieba.node');
    if (/^lancedb\./.test(base)) return path.join(dir, 'lancedb.node');
  }
  return null;
}

/**
 * 安装原生模块加载拦截。
 * 必须在任何 require 原生模块之前调用。
 */
export function installNativeLoader(): void {
  if (hooked) return;
  hooked = true;

  const sea = getSea();
  const isSeaEnv = !!sea && typeof sea.isSea === 'function' && sea.isSea();
  if (!isSeaEnv) return; // 开发模式：原生模块正常加载

  extractNativeAssets(sea as { getRawAsset(key: string): ArrayBuffer });

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (this: unknown, request: string, ...args: unknown[]): string {
    const hit = resolveNative(request);
    if (hit && fs.existsSync(hit)) return hit;
    return origResolve.call(this, request, ...(args as [never, never, never]));
  };
}
