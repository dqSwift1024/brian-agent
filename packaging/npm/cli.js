#!/usr/bin/env node
/**
 * Brian-Agent 全局命令分发器（npm i -g brian-agent 后的 `brian` 命令）。
 *
 * 职责仅一件事：找到已安装的便携包，把参数原样转交给包内启动器
 * （brian.sh / brian.cmd —— 进程管理、内置 Node、bundle 全在那里）。
 *
 * 安装目录查找顺序：
 *   1. BRIAN_INSTALL_DIR 环境变量
 *   2. /opt/brian-agent（.deb / root 安装）
 *   3. ~/.local/share/brian-agent（install.sh / npm postinstall 普通用户安装）
 * 若均未找到，提示如何安装。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = '__BRIAN_REPO__';
const VERSION = '__BRIAN_VERSION__';

function isInstalled(dir) {
  return fs.existsSync(path.join(dir, 'server', 'brian-server.cjs'));
}

function findInstallDir() {
  const candidates = [];
  if (process.env.BRIAN_INSTALL_DIR) candidates.push(process.env.BRIAN_INSTALL_DIR);
  candidates.push('/opt/brian-agent');
  candidates.push(path.join(os.homedir(), '.local', 'share', 'brian-agent'));
  for (const dir of candidates) {
    if (isInstalled(dir)) return dir;
  }
  return null;
}

function main() {
  const dir = findInstallDir();
  if (!dir) {
    console.error(`[brian] 尚未安装 Brian-Agent 运行时 (${VERSION})。`);
    console.error('');
    console.error('  安装方式（任选其一）:');
    console.error('    1. 重跑安装器:     npm rebuild -g brian-agent');
    console.error(`    2. 一键脚本:       curl -fsSL https://raw.githubusercontent.com/${REPO}/main/packaging/install.sh | bash`);
    console.error('    3. 手动下载:       https://github.com/' + REPO + '/releases  解压后设 BRIAN_INSTALL_DIR');
    process.exit(1);
  }

  const isWin = process.platform === 'win32';
  const launcher = path.join(dir, isWin ? 'brian.cmd' : 'brian.sh');
  if (!fs.existsSync(launcher)) {
    console.error(`[brian] 安装目录异常（缺少启动器）: ${dir}，请重装: npm rebuild -g brian-agent`);
    process.exit(1);
  }

  // 告知启动器真实安装位置（数据目录默认仍为 ~/.brian-agent，由启动器负责）
  const env = { ...process.env, BRIAN_INSTALL_DIR: dir };
  const result = spawnSync(launcher, process.argv.slice(2), {
    stdio: 'inherit',
    shell: isWin,
    env,
  });

  if (result.error) {
    console.error(`[brian] 启动失败: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

main();
