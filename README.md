<div align="center">

# Brian-Agent

**面向 C 端用户的智能个人 Agent 服务 —— 不是做一个"工具"，而是做一个"人"**

具备记忆、自我反思、内在动力与成长进化能力 · 支持单机交付，亦可改造为集中部署的 SaaS

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js&logoColor=white)

</div>

---

## ✨ 核心特性

### 1. ChatMap 可视化控制

只问答你关心的信息，摒弃无用的信息进入上下文：上下文的构建只采用**被引用的消息**，
不会加载无关消息，实现对话上下文的自主控制。

<div align="center">
  <img src="README/image.png" width="800" alt="ChatMap 可视化控制" />
</div>

### 2. Memory Pin 机制（强制模型注意力）

对话轮数过多、上下文过长时，重要信息可能被忽略或丢失。只需 **Pin 住消息**，
它就会永远留在上下文的关键位置，不被滑动窗口冲刷。

<div align="center">
  <img src="README/image-1.png" width="640" alt="Memory Pin 机制" />
</div>

### 3. 涌现图与关键词图（提升 Memory 质量）

**信息页面**（`/info`）提供两个基于**共现关系**的知识图谱，帮助用户发现记忆中的隐藏关联：

**涌现图（Tag Graph）** —— 基于时间线的信息大部分是重要的，但上下文长度有限、时间距离过远的信息容易损失。系统理解请求内容后，通过标签图谱搜索，选中与当前请求最相关的信息。

<div align="center">
  <img src="README/image-2.png" width="800" alt="涌现图（Tag Graph）" />
</div>

**关键词图（Keyword Graph）** —— 大脑中有些灵光一闪，是被某一个词激活的。通过关键词图的关联性搜索，重现这种"灵光一闪"。

<div align="center">
  <img src="README/image-3.png" width="800" alt="关键词图（Keyword Graph）" />
</div>

> 这两个图谱的价值在于：**自动发现记忆中的涌现模式**——用户可能从未意识到的标签/关键词之间的关联被自动挖掘并可视化，帮助用户理解和审视自己的知识结构。同时，这些图谱关系也反向服务于上下文构建（`TAG_RELATIVE` 和 `KEYWORD` 维度），让模型在检索时不仅依赖向量相似度，还能利用**结构化的共现关系**，提升检索质量。

### 4. 随机记忆（增强 Memory 多样性）

模拟人脑的**联想性/偶然性回忆**——有时最有价值的上下文恰恰来自看似无关的记忆。随机记忆防止上下文过于狭窄，为模型提供意外的灵感连接。

## 🚀 快速开始（开发模式）

```bash
git clone <repo-url> brian-agent && cd brian-agent

npm install          # 安装依赖（postinstall 自动就位原生模块）

./brian start        # 启动后端(:8000) + 前端(:5173)
./brian open         # 浏览器打开前端

# 常用
./brian start backend        # 仅启动后端
./brian serve                # 前台 headless 模式
./brian doctor               # 环境与依赖自检
./brian stop                 # 停止全部
```

后端默认监听 `http://127.0.0.1:8000`，前端 Vite(:5173) 代理 `/api` 与 `/ws`。
环境变量：`BRIAN_PORT`、`BRIAN_HOST`。日常管理详见 [docs/使用手册.md](docs/使用手册.md)。

> 首次启动后需在 `/config` 页面配置模型供应商与 API Key，即可开始对话
> （内置 13 家主流提供商目录：OpenAI / Anthropic / DeepSeek / 智谱 / 通义 / 火山引擎…）。

## 📦 打包分发与安装

把系统打成**自包含发行包**：内置 Node.js 运行时、全部原生依赖、前端页面与
Chrome for Testing（浏览器自动化用），目标机器**无需安装任何依赖**，解压即用。

### 一键打包（构建机执行）

```bash
# 全部 4 个目标 + .deb + SHA256SUMS（要求构建机为 Node 22）
python3 packaging/pack.py

# 常用变体
python3 packaging/pack.py --targets linux-x64,win32-x64   # 指定目标
python3 packaging/pack.py --skip-chromium                 # 不内置 Chrome（体积 -150MB/目标）
```

产物在 `dist-pack/`：Linux/macOS 为 `.tar.gz`，Windows 为 `.zip`，Linux 另有 `.deb`。

### 全局安装（推荐，Hermes 式体验）

任选其一，安装后即可在**任意目录**使用 `brian` 命令：

```bash
# 方式 A：npm 全局包（已有 Node 18+ 的机器；postinstall 自动下载对应平台运行时）
npm i -g brian-agent

# 方式 B：一键脚本（Linux/macOS，无需 Node；从 GitHub Releases 下载）
curl -fsSL https://raw.githubusercontent.com/zhaoxuan-inside/brian-agent/main/packaging/install.sh | bash
# Windows（PowerShell）:
iwr https://raw.githubusercontent.com/zhaoxuan-inside/brian-agent/main/packaging/install.ps1 -OutFile install.ps1; .\install.ps1

# 方式 C：离线安装（本地已有的发行包，Linux/macOS）
./packaging/install.sh --from dist-pack/brian-agent-linux-x64.tar.gz
```

### 安装（免安装便携模式）

不安装直接使用也可以——解压即用，数据落在包内 `data/`：

```bash
tar -xzf brian-agent-linux-x64.tar.gz && cd brian-agent-linux-x64
./brian.sh start                     # Windows: brian.cmd start
```

| 平台 | 产物 | 便携模式启动 |
|------|------|-------------|
| Linux | `brian-agent-linux-x64.tar.gz` 或 `.deb` | 解压后 `./brian.sh start`；`.deb` 安装后直接用 `brian` 命令（/usr/bin/brian） |
| macOS（Intel/Apple Silicon） | `brian-agent-darwin-*.tar.gz` | 解压 → `xattr -dr com.apple.quarantine brian-agent-*` → `./brian.sh start` |
| Windows | `brian-agent-win32-x64.zip` | 解压 → `brian.cmd start`（前台：`brian.cmd serve`） |

启动后浏览器打开 **http://127.0.0.1:8000**。停止：`brian stop`（便携模式 `./brian.sh stop`）。对外监听：`BRIAN_HOST=0.0.0.0`。

Linux 可选 systemd 常驻：安装包内含 `systemd/brian-agent.service`（.deb 已装好，可用 `sudo systemctl enable --now brian-agent`）；一键脚本加 `--systemd` 参数自动安装。

### 首次运行须知

- 包内**不含数据库**：`data/` 在首次运行时自动创建（表结构与默认配置种子自动初始化）；
- **通用目录数据已随包预置**：模型提供商列表（OpenAI/Anthropic/DeepSeek/智谱/通义等 13 家）与 MCP 提供商列表（阿里云百炼/ModelScope/GitHub/Smithery 等）在首次运行时自动导入；
- **个人数据不打包**（API Key、对话、记忆等）：提供商目录不含 API Key，需在 `/config` 页选择提供商并填入自己的 Key 才能开始对话；
- 数据目录默认 `~/.brian-agent`（Windows `%APPDATA%\brian-agent`，`BRIAN_DATA_DIR` 可改，便携模式设为包内 `data/`）；端口 `BRIAN_PORT`（默认 8000）、监听地址 `BRIAN_HOST`（默认 127.0.0.1）；
- **升级/重装不影响数据**（程序与数据分离）；
- Windows 首次运行若被 SmartScreen 拦截，选择「仍要运行」。

详见 [packaging/README.md](packaging/README.md) 与 [docs/打包部署.md](docs/打包部署.md)。

## 🏗️ 架构一览

npm workspaces 单仓库，后端按 DDD 分为 5 个严格分层的包，依赖单向：
`base ← core ← agent ← orchestration ← application`；前端经 Vite 代理访问后端。

| 包 | 层级 | 职责 |
|----|------|------|
| `@brian-agent/base` | 基础构件层 | RelationDB(SQLite) / GraphDB / VectorDB(LanceDB) / LLM / MCP / MQ / Prompts / Skill 沙箱 / Soul / CDT / Cron |
| `@brian-agent/core` | 基础层 | InfoCore(记忆核心) / LLMCore / MCPCore / SkillCore / SoulCore / MQCore / CDTCore |
| `@brian-agent/agent` | Agent 层 | AgentLibrary / AgentBuilder / AgentContext / AgentExecution / PlannerAgent / WriterAgent / EvolutorAgent |
| `@brian-agent/orchestration` | 编排层 | OrchestrationEntry / Strategy / Execution / JSONNode / Visualization |
| `@brian-agent/application` | 应用层 | Chat / Config / SelfLearning / UserProfile / Visualization |
| `@brian-agent/frontend` | 前端 | Vue 3 + Pinia + Vite + Tailwind CSS（Apple 风格主题），Notion 式块渲染 |
| `@brian-agent/shared` | 共享 | Zod schema + TypeScript 类型 |

**技术栈**：TypeScript · 纯 `node:http` + `ws`（无 Web 框架）· better-sqlite3 / isolated-vm / LanceDB（离线预编译原生件）· Node 22。

## 🧪 质量与测试

```bash
npm run test          # 后端 5 层 vitest（1800+ 用例）
npm run typecheck     # 后端 5 层 tsc --noEmit
npm run lint          # 前端 ESLint
npm run lint:backend  # 后端 ESLint
npm run build         # 按依赖顺序构建全部（前端含 vue-tsc 类型检查）
```

## 📚 文档

| 文档 | 内容 |
|------|------|
| [docs/AgentThink.md](docs/_0_DesignPrinciples/AgentThink.md) | 设计哲学与 Agent 思考模型 |
| [docs/使用手册.md](docs/使用手册.md) | 日常启动/关闭与管理操作 |
| [docs/打包部署.md](docs/打包部署.md) | 打包原理与部署细节 |
| [docs/_01_TerminologyStandardization.md](docs/_01_TerminologyStandardization.md) | 术语标准化（msg_id / interact_id / work_id / session_id） |
| [docs/_1_DevStandards/DevStandards.md](docs/_1_DevStandards/DevStandards.md) | 开发强制规范（方法签名 / AOP / 分层） |
| [docs/TODO-List.md](docs/TODO-List.md) | 待开发功能清单 |

```
