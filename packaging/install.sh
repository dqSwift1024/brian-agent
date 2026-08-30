#!/usr/bin/env bash
# ============================================================================
# Brian-Agent 一键安装脚本（Linux / macOS）
#
# 在线安装（GitHub Releases）:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/packaging/install.sh | bash
# 指定版本:
#   ./install.sh --version v1.0.0
# 离线安装（本地 tar.gz）:
#   ./install.sh --from dist-pack/brian-agent-linux-x64.tar.gz
#
# 行为: 检测平台/架构 → 下载(或取本地)发行包 → 安装到
#   /opt/brian-agent（root）或 ~/.local/share/brian-agent（普通用户）
#   → 写全局命令 brian（/usr/local/bin 或 ~/.local/bin）
#   → 数据目录 ~/.brian-agent（BRIAN_DATA_DIR 可覆盖）
#   → --systemd 时安装 systemd 常驻单元
#
# 升级: 重新执行本脚本即可（覆盖安装目录，数据不受影响）。
# 卸载: 删除安装目录 + brian 软链 + 数据目录。
# ============================================================================
set -euo pipefail

REPO="zhaoxuan-inside/brian-agent"
VERSION=""          # 空 = latest
FROM=""             # 本地 tarball 路径（离线安装）
INSTALL_DIR=""      # 空 = 自动（root→/opt/brian-agent，否则 ~/.local/share/brian-agent）
WANT_SYSTEMD=0
NO_BIN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --version)  VERSION="$2"; shift 2 ;;
    --repo)     REPO="$2"; shift 2 ;;
    --from)     FROM="$2"; shift 2 ;;
    --dir)      INSTALL_DIR="$2"; shift 2 ;;
    --systemd)  WANT_SYSTEMD=1; shift ;;
    --no-bin)   NO_BIN=1; shift ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,2\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

log()  { echo "[install] $1"; }
die()  { echo "[install] ✗ $1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 平台/架构检测
# ---------------------------------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) die "不支持的架构: $ARCH" ;;
esac
case "$OS" in
  Linux) TARGET="linux-$ARCH" ;;
  Darwin) TARGET="darwin-$ARCH" ;;
  *) die "本脚本支持 Linux/macOS；Windows 请使用 packaging/install.ps1" ;;
esac

# ---------------------------------------------------------------------------
# 获取发行包（本地 or GitHub Releases）
# ---------------------------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "$FROM" ]; then
  [ -f "$FROM" ] || die "本地包不存在: $FROM"
  TGZ="$FROM"
  log "离线安装: $FROM"
else
  if [ -z "$VERSION" ]; then
    log "查询最新版本..."
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
    [ -n "$VERSION" ] || die "无法获取最新版本号（网络/仓库不可达？可用 --version 指定）"
  fi
  TGZ="$TMP/brian-agent-$TARGET.tar.gz"
  URL="https://github.com/$REPO/releases/download/$VERSION/brian-agent-$TARGET.tar.gz"
  log "下载 $URL"
  curl -fSL --progress-bar "$URL" -o "$TGZ" || die "下载失败: $URL"
fi

# ---------------------------------------------------------------------------
# 解压安装
# ---------------------------------------------------------------------------
if [ -z "$INSTALL_DIR" ]; then
  if [ "$(id -u)" = "0" ]; then INSTALL_DIR="/opt/brian-agent"; else INSTALL_DIR="$HOME/.local/share/brian-agent"; fi
fi
log "安装到 $INSTALL_DIR"

STAGE="$TMP/unpack"
mkdir -p "$STAGE"
tar -xzf "$TGZ" -C "$STAGE"
SRC_DIR="$(find "$STAGE" -maxdepth 1 -type d -name 'brian-agent-*' | head -1)"
[ -n "$SRC_DIR" ] || die "压缩包内未找到 brian-agent-* 目录"

mkdir -p "$INSTALL_DIR"
# 覆盖安装（升级）：先删旧内容但保留数据不在安装目录（数据在 ~/.brian-agent / /var/lib）
rm -rf "$INSTALL_DIR/bin" "$INSTALL_DIR/server" "$INSTALL_DIR/web" "$INSTALL_DIR/chrome" "$INSTALL_DIR/systemd"
cp -R "$SRC_DIR/." "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/bin/node" "$INSTALL_DIR/brian.sh" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 全局命令 brian
# ---------------------------------------------------------------------------
if [ "$NO_BIN" = "0" ]; then
  BIN_DIR="/usr/local/bin"
  if [ ! -w "$BIN_DIR" ] && [ "$(id -u)" != "0" ]; then
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
  fi
  ln -sf "$INSTALL_DIR/brian.sh" "$BIN_DIR/brian"
  log "全局命令: $BIN_DIR/brian → $INSTALL_DIR/brian.sh"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) log "⚠ $BIN_DIR 不在 PATH 中，请将其加入 PATH 后重开终端" ;;
  esac
fi

# ---------------------------------------------------------------------------
# 数据目录
# ---------------------------------------------------------------------------
DATA_DIR="${BRIAN_DATA_DIR:-$HOME/.brian-agent}"
mkdir -p "$DATA_DIR"
log "数据目录: $DATA_DIR"

# ---------------------------------------------------------------------------
# 可选：systemd 常驻
# ---------------------------------------------------------------------------
if [ "$WANT_SYSTEMD" = "1" ]; then
  if [ ! -d /run/systemd/system ]; then
    log "⚠ 未检测到 systemd，跳过服务安装"
  else
    UNIT_SRC="$INSTALL_DIR/systemd/brian-agent.service"
    [ -f "$UNIT_SRC" ] || die "包内未找到 systemd 单元文件"
    sed -e "s|/opt/brian-agent|$INSTALL_DIR|g" "$UNIT_SRC" > /etc/systemd/system/brian-agent.service
    systemctl daemon-reload
    systemctl enable --now brian-agent
    log "systemd 服务已启动（brian-agent）"
  fi
fi

# ---------------------------------------------------------------------------
# 完成
# ---------------------------------------------------------------------------
log "✅ 安装完成"
echo "
  启动:   brian start        # 后台启动，浏览器打开 http://127.0.0.1:8000
  状态:   brian status        # 日志: brian logs    停止: brian stop
  首次使用: 在 /config 页选择模型提供商并填入 API Key
  数据:   $DATA_DIR
  升级:   重新运行本脚本
  卸载:   brian stop && rm -rf $INSTALL_DIR $DATA_DIR $( [ "$NO_BIN" = "0" ] && echo "以及 brian 软链" )
"
