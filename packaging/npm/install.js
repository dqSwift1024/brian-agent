#!/usr/bin/env node
/**
 * Brian-Agent npm postinstall：按当前平台从 GitHub Releases 下载便携包并
 * 解压到安装目录。幂等（同版本已安装则跳过）；下载失败不阻断 npm 安装，
 * 仅打印警告（之后可 npm rebuild -g brian-agent 重试）。
 *
 * 安装目录：
 *   Windows   %LOCALAPPDATA%\brian-agent
 *   root      /opt/brian-agent
 *   普通用户  ~/.local/share/brian-agent
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = '__BRIAN_REPO__';
const VERSION = '__BRIAN_VERSION__'.replace(/^v/, '');

const PLATFORMS = {
  'linux-x64': { ext: 'tar.gz', distOs: 'linux' },
  'darwin-x64': { ext: 'tar.gz', distOs: 'darwin' },
  'darwin-arm64': { ext: 'tar.gz', distOs: 'darwin' },
  'win32-x64': { ext: 'zip', distOs: 'win' },
};

function log(msg) { console.log(`[brian-agent] ${msg}`); }
function warn(msg) { console.warn(`[brian-agent] ⚠ ${msg}`); }

function installDir() {
  if (process.env.BRIAN_INSTALL_DIR) return process.env.BRIAN_INSTALL_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'brian-agent');
  }
  if (process.getuid && process.getuid() === 0) return '/opt/brian-agent';
  return path.join(os.homedir(), '.local', 'share', 'brian-agent');
}

function targetKey() {
  if (process.platform === 'win32') return process.arch === 'x64' ? 'win32-x64' : null;
  if (process.platform !== 'linux' && process.platform !== 'darwin') return null;
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null;
  return arch ? `${process.platform}-${arch}` : null;
}

function markerVersion(dir) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(dir, 'server', 'portable.marker'), 'utf8'));
    return marker.version || '';
  } catch { return ''; }
}

function download(url, dest) {
  // curl 在三大平台均常见（win10+ 内置）；失败直接抛出
  const r = spawnSync('curl', ['-fSL', '--progress-bar', url, '-o', dest], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`下载失败 (curl exit ${r.status}): ${url}`);
}

function extract(archive, destDir) {
  // Windows 10+ / Linux / macOS 均自带 bsdtar（zip 与 tar.gz 通吃）
  fs.mkdirSync(destDir, { recursive: true });
  const r = spawnSync('tar', ['-xf', archive, '-C', destDir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`解压失败: tar -xf ${archive}`);
}

const SERVICE = 'brian-agent.service';

/** systemd user 服务可用且未被禁用时返回 true（Windows/容器环境返回 false） */
function systemdUserAvailable() {
  if (process.platform === 'win32') return false;
  if (process.env.BRIAN_NO_SERVICE === '1') return false;
  const r = spawnSync('systemctl', ['--user', 'is-system-running'], { encoding: 'utf8' });
  return r.status === 0 || /degraded/.test(r.stdout || '');
}

/**
 * 安装/刷新用户级 systemd 服务（brian-agent.service）：
 * 独立于终端会话，被杀 2 秒自动拉起（Restart=always），死亡原因进 journald。
 * 无需 root；失败仅告警，不阻断 npm 安装。
 */
function ensureUserSystemdService(dir) {
  if (!systemdUserAvailable()) {
    log('systemd user 服务不可用，使用包内 brian.sh/brian.cmd 直接管理');
    return false;
  }
  try {
    const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
    const port = process.env.BRIAN_PORT || '8000';
    const host = process.env.BRIAN_HOST || '127.0.0.1';
    const dataDir = process.env.BRIAN_DATA_DIR || path.join(os.homedir(), '.brian-agent');
    const unit = [
      '[Unit]',
      'Description=Brian-Agent service (self-contained runtime)',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      `ExecStart=${dir}/bin/node ${dir}/server/brian-server.cjs`,
      'Environment=BRIAN_PORTABLE=1',
      `Environment=BRIAN_DATA_DIR=${dataDir}`,
      `Environment=BRIAN_NATIVE_DIR=${dir}/server/native`,
      `Environment=BRIAN_PORT=${port}`,
      `Environment=BRIAN_HOST=${host}`,
      'Restart=always',
      'RestartSec=2',
      'StandardOutput=journal',
      'StandardError=journal',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, SERVICE), unit);
    spawnSync('systemctl', ['--user', 'daemon-reload']);
    const en = spawnSync('systemctl', ['--user', 'enable', '--now', SERVICE], { encoding: 'utf8' });
    if (en.status !== 0) {
      warn(`systemd 服务启用失败（端口占用？可调 BRIAN_PORT 后重试）: ${(en.stderr || '').trim()}`);
      return false;
    }
    log(`systemd 服务已安装并启动: systemctl --user status brian-agent（数据: ${dataDir}）`);
    return true;
  } catch (e) {
    warn(`systemd 服务安装失败（不阻断）: ${e.message}`);
    return false;
  }
}

function main() {
  const key = targetKey();
  if (!key) {
    warn(`当前平台 ${process.platform}-${process.arch} 暂无预构建发行包，跳过自动安装。`);
    warn('可从 https://github.com/' + REPO + '/releases 查看支持列表。');
    return;
  }

  const dir = installDir();
  // 幂等：同版本已装则跳过下载，但仍确保 systemd 服务就位
  if (markerVersion(dir) === VERSION && fs.existsSync(path.join(dir, 'server', 'brian-server.cjs'))) {
    log(`v${VERSION} 已安装在 ${dir}，跳过下载`);
    ensureUserSystemdService(dir);
    return;
  }

  const ext = PLATFORMS[key].ext;
  const distOs = PLATFORMS[key].distOs;
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/brian-agent-${key}.${ext}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-npm-'));
  const archive = path.join(tmp, `brian-agent-${key}.${ext}`);

  log(`下载 Brian-Agent v${VERSION} (${key})...`);
  log(url);
  try {
    download(url, archive);

    // 覆盖升级：清空程序目录（数据在 ~/.brian-agent / /var/lib/brian-agent，不受影响）
    const stage = path.join(tmp, 'unpack');
    extract(archive, stage);
    const inner = fs.readdirSync(stage).find((n) => n.startsWith('brian-agent-'));
    if (!inner) throw new Error('压缩包内未找到 brian-agent-* 目录');
    const srcDir = path.join(stage, inner);

    fs.mkdirSync(dir, { recursive: true });
    for (const entry of ['bin', 'server', 'web', 'chrome', 'systemd', 'brian.sh', 'brian.cmd', 'README.txt']) {
      const from = path.join(srcDir, entry);
      if (!fs.existsSync(from)) continue;
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      fs.cpSync(from, path.join(dir, entry), { recursive: true });
    }
    if (process.platform !== 'win32') {
      fs.chmodSync(path.join(dir, 'bin', 'node'), 0o755);
      fs.chmodSync(path.join(dir, 'brian.sh'), 0o755);
    }
    const served = ensureUserSystemdService(dir);
    log(served
      ? `✅ 已安装到 ${dir}，服务由 systemd 托管（brian start/status/stop，被杀自动拉起）。`
      : `✅ 已安装到 ${dir}。运行 brian start 启动（数据目录 ~/.brian-agent）。`);
  } catch (e) {
    warn(`自动安装失败: ${e.message}`);
    warn('npm 全局命令已就绪；运行时安装可稍后重试: npm rebuild -g brian-agent');
    warn(`或使用一键脚本: curl -fsSL https://raw.githubusercontent.com/${REPO}/main/packaging/install.sh | bash`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
