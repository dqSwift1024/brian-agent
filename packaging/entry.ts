/**
 * @fileoverview SEA 打包入口。
 *
 * 顺序至关重要：
 * 1. 先安装原生模块加载拦截（覆盖 Module._resolveFilename）
 * 2. 打包模式下配置数据目录（可执行文件旁，可用 BRIAN_DATA_DIR 覆盖）
 *    并解包内联的前端静态文件映射（供 dev-server 静态 serve）
 * 3. 再加载后端入口（dev-server.ts 顶层会调用 main() 启动服务）
 *
 * 使用动态 import 确保原生模块拦截在任何 require 原生模块之前生效。
 */
import path from 'node:path';
import { installNativeLoader } from './setup-native';
import { installChromium } from './setup-chromium';

installNativeLoader();
installChromium();

// 打包模式：配置运行时资源
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sea = require('node:sea') as {
    isSea(): boolean;
    getRawAsset(key: string): ArrayBuffer;
  };
  if (sea && typeof sea.isSea === 'function' && sea.isSea()) {
    if (!process.env.BRIAN_DATA_DIR) {
      process.env.BRIAN_DATA_DIR = path.join(path.dirname(process.execPath), 'data');
    }
    try {
      const buf = sea.getRawAsset('frontend.json');
      const files = JSON.parse(Buffer.from(buf).toString('utf8')) as Record<string, string>;
      (globalThis as Record<string, unknown>).__BRIAN_FRONTEND__ = files;
    } catch {
      /* 未打包前端资源（纯后端模式） */
    }
  }
} catch {
  /* 非 SEA 环境，忽略 */
}

// 动态加载后端入口（dev-server.ts 顶层 main() 自启动）
import('../brian-backend/dev-server');
