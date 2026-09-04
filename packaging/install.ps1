# ============================================================================
# Brian-Agent 一键安装脚本（Windows，PowerShell）
#
# 用法（管理员或普通 PowerShell）:
#   .\install.ps1                              # 从 GitHub Releases 安装最新版
#   .\install.ps1 -Version v1.0.0              # 指定版本
#   .\install.ps1 -From <brian-agent-win32-x64.zip 路径>   # 离线安装
#
# 行为: 解压到 %LOCALAPPDATA%\brian-agent → 写入用户 PATH（brian 全局命令）
#       → 数据目录 %APPDATA%\brian-agent
# 升级: 重新运行即可（覆盖程序，数据不受影响）
# ============================================================================
param(
  [string]$Version = "",
  [string]$Repo = "zhaoxuan-inside/brian-agent",
  [string]$From = ""
)

$ErrorActionPreference = "Stop"

function Info($msg)  { Write-Host "[install] $msg" }
function Die($msg)   { Write-Host "[install] x $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# 获取发行包
# ---------------------------------------------------------------------------
$tmp = Join-Path $env:TEMP ("brian-install-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

if ($From -ne "") {
  if (-not (Test-Path $From)) { Die "本地包不存在: $From" }
  $zipPath = $From
  Info "离线安装: $From"
} else {
  if ($Version -eq "") {
    Info "查询最新版本..."
    try {
      $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
      $Version = $rel.tag_name
    } catch { Die "无法获取最新版本（网络不可达？可用 -Version 指定）: $_" }
  }
  $url = "https://github.com/$Repo/releases/download/$Version/brian-agent-win32-x64.zip"
  $zipPath = Join-Path $tmp "brian-agent-win32-x64.zip"
  Info "下载 $url"
  try {
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  } catch { Die "下载失败: $_" }
}

# ---------------------------------------------------------------------------
# 解压安装
# ---------------------------------------------------------------------------
$installDir = Join-Path $env:LOCALAPPDATA "brian-agent"
Info "安装到 $installDir"

if (Test-Path $installDir) {
  Remove-Item -Recurse -Force (Join-Path $installDir "*") -ErrorAction SilentlyContinue
} else {
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}
Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
$src = Get-ChildItem -Directory $tmp | Where-Object Name -like "brian-agent-*" | Select-Object -First 1
if (-not $src) { Die "压缩包内未找到 brian-agent-* 目录" }
Copy-Item -Path (Join-Path $src.FullName "*") -Destination $installDir -Recurse -Force

# ---------------------------------------------------------------------------
# 写入用户 PATH（brian 全局命令）
# ---------------------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
  Info "已将 $installDir 加入用户 PATH（新开的终端生效；当前终端可手动刷新）"
}

# ---------------------------------------------------------------------------
# 数据目录
# ---------------------------------------------------------------------------
$dataDir = if ($env:BRIAN_DATA_DIR) { $env:BRIAN_DATA_DIR } else { Join-Path $env:APPDATA "brian-agent" }
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Info "数据目录: $dataDir"

Info "OK 安装完成"
Write-Host ""
Write-Host "  启动:   brian start      # 后台启动，浏览器打开 http://127.0.0.1:8000"
Write-Host "  状态:   brian status     # 日志: brian logs   停止: brian stop"
Write-Host "  首次使用: 在 /config 页选择模型提供商并填入 API Key"
Write-Host "  升级:   重新运行本脚本"
Write-Host "  卸载:   brian stop 后删除 $installDir 与 $dataDir"
