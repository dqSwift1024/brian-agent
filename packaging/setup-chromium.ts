/**
 * @fileoverview SEA 打包用的内置 Chromium 加载器。
 *
 * Chrome for Testing 在构建时下载并作为 SEA asset（chromium.zip）内嵌，
 * 运行时解压到临时目录（带缓存），并设置 BRIAN_CHROME_PATH 供 CDTService 使用。
 * 未打包 Chromium 时静默跳过（CDT 回退到系统 Chrome）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// zip 内顶层目录名（Chrome for Testing 固定结构）
function chromeDirName(platform: string, arch: string): string {
  if (platform === 'darwin') return arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
  if (platform === 'win32') return 'chrome-win64';
  return 'chrome-linux64';
}

// chrome 可执行文件相对路径（相对解压目录）
function chromeExeRel(platform: string, arch: string): string {
  if (platform === 'darwin') {
    return path.join(chromeDirName(platform, arch), 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
  }
  if (platform === 'win32') return path.join(chromeDirName(platform, arch), 'chrome.exe');
  return path.join(chromeDirName(platform, arch), 'chrome');
}

/** 安全访问 node:sea */
function getSea(): { isSea(): boolean; getRawAsset(key: string): ArrayBuffer } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:sea') as { isSea(): boolean; getRawAsset(key: string): ArrayBuffer };
  } catch {
    return null;
  }
}

/** 从可执行文件自身末尾提取 Chromium zip（footer: 8 字节 magic + 8 字节长度） */
function readChromiumFromSelf(): Buffer | null {
  try {
    const exePath = process.execPath;
    const fd = fs.openSync(exePath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      if (stat.size < 16) return null;
      const footer = Buffer.alloc(16);
      fs.readSync(fd, footer, 0, 16, stat.size - 16);
      if (footer.toString('ascii', 0, 8) !== 'BRIANSEA') return null;
      const len = Number(footer.readBigUInt64LE(8));
      if (len <= 0 || len > stat.size - 16) return null;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, stat.size - 16 - len);
      return buf;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * 安装内置 Chromium。
 * 必须在 CDTService 首次启动（spawn chrome）之前调用。
 *
 * 两种来源：
 * - SEA 单文件：Chromium zip 追加在可执行文件末尾（BRIANSEA footer）；
 * - 便携目录包（BRIAN_PORTABLE=1）：<包根>/chrome/chrome.zip。
 */
export function installChromium(): void {
  const sea = getSea();
  const isSeaEnv = !!sea && typeof sea.isSea === 'function' && sea.isSea();

  let buf: Buffer | null = null;
  if (isSeaEnv) {
    buf = readChromiumFromSelf();
  } else if (process.env.BRIAN_PORTABLE === '1' && process.env.BRIAN_DATA_DIR) {
    // 便携包根 = data 目录的上级
    const zipPath = process.env.BRIAN_CHROME_ZIP
      || path.join(path.dirname(process.env.BRIAN_DATA_DIR), 'chrome', 'chrome.zip');
    try {
      if (fs.existsSync(zipPath)) buf = fs.readFileSync(zipPath);
    } catch { /* 读取失败按未内置处理 */ }
  }
  if (!buf) return; // 未内置 Chromium

  try {
    const platform = process.platform;
    const arch = process.arch;
    const dir = path.join(os.tmpdir(), 'brian-agent-chromium', `${platform}-${arch}`);
    const exeRel = chromeExeRel(platform, arch);
    const exeAbs = path.join(dir, exeRel);

    // 已解压则直接复用（缓存）
    if (fs.existsSync(exeAbs)) {
      process.env.BRIAN_CHROME_PATH = exeAbs;
      return;
    }

    fs.mkdirSync(dir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buf);
    zip.extractAllTo(dir, true);

    // Linux/macOS 解压后需恢复可执行权限
    if (platform !== 'win32' && fs.existsSync(exeAbs)) {
      fs.chmodSync(exeAbs, 0o755);
    }

    if (fs.existsSync(exeAbs)) {
      process.env.BRIAN_CHROME_PATH = exeAbs;
      // eslint-disable-next-line no-console
      console.log(`[chromium] 内置 Chromium 已就绪: ${exeAbs}`);
    }
  } catch (e) {
    // 未内置 Chromium 或解压失败：回退到系统 Chrome
    // eslint-disable-next-line no-console
    console.warn(`[chromium] 内置 Chromium 不可用，将回退到系统 Chrome: ${(e as Error).message}`);
  }
}
