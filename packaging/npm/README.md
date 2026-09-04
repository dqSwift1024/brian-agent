# brian-agent（npm 全局命令）

`npm i -g brian-agent` 之后即可在任意目录使用 `brian` 命令管理 Brian-Agent 服务：

```bash
brian start        # 后台启动（首次自动从 GitHub Releases 下载对应平台的自包含运行时）
brian status       # 状态 / brian logs 日志 / brian stop 停止
brian serve        # 前台运行
```

- `postinstall` 自动检测平台（linux-x64 / darwin-x64 / darwin-arm64 / win32-x64），
  从 GitHub Releases 下载自包含发行包（内置 Node 运行时与全部原生依赖），
  安装到 `/opt/brian-agent`（root）或 `~/.local/share/brian-agent`（Windows `%LOCALAPPDATA%\brian-agent`）。
- 数据目录默认 `~/.brian-agent`（Windows `%APPDATA%\brian-agent`），升级/重装不影响数据。
- 下载失败不阻断 npm 安装，稍后 `npm rebuild -g brian-agent` 重试即可。

## 发布流程（维护者）

1. 打包产物：`python3 packaging/pack.py`（同时生成 `dist-pack/npm/`，其中
   已注入版本号与仓库地址）
2. 创建 GitHub Release（tag = `v<version>`），上传 `dist-pack/` 下的
   4 个平台压缩包——npm postinstall 从 Release 资产下载，二者版本必须一致
3. 发布 npm 包：`cd dist-pack/npm && npm publish`

> 若 npm 上 `brian-agent` 名称被占用，改用 scope 包名（如 `@brian-agent/cli`），
> `bin` 中的命令名 `brian` 不受影响；同步修改 `packaging/npm/package.json` 后重新打包。
