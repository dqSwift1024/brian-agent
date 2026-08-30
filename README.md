# Brian-Agent

面向 C 端用户的 C/S 架构 Agent 服务，核心理念是做"一个人"而非"一个工具"——具备记忆、自我反思、内在动力与成长进化能力。支持单机部署，也可改造为集中部署的 SaaS 服务。

## 快速开始

```bash

git clone 

# 安装依赖
npm install

# 启动后端 + 前端
./brian start

# 仅启动后端（端口 8000）
./brian start backend

# 仅启动前端（端口 5173）
npm run dev -w @brian-agent/frontend

# 构建
npm run build

# 运行测试
npm run test

# 类型检查
npm run typecheck
```

后端服务默认监听 `http://127.0.0.1:8000`，前端通过 Vite 代理转发 `/api` 和 `/ws` 请求。环境变量可通过 `BRIAN_PORT` 和 `BRIAN_HOST` 配置。

## 打包分发与安装

把系统打成**自包含发行包**：内置 Node.js 运行时、全部原生依赖、前端页面与 Chrome for Testing（浏览器自动化用），目标机器**无需安装任何依赖**，解压即用。

### 一键打包（构建机执行）

```bash
# 全部 4 个目标 + .deb + SHA256SUMS（要求构建机为 Node 22）
python3 packaging/pack.py

# 常用变体
python3 packaging/pack.py --targets linux-x64,win32-x64   # 指定目标
python3 packaging/pack.py --skip-chromium                 # 不内置 Chrome（体积 -150MB/目标）
```

产物在 `dist-pack/`：Linux/macOS 为 `.tar.gz`，Windows 为 `.zip`，Linux 另有 `.deb`。

### 安装（目标机器）

| 平台 | 产物 | 安装与启动 |
|------|------|-----------|
| Linux | `brian-agent-linux-x64.tar.gz` 或 `.deb` | tar 解压后 `./brian.sh start`；或 `sudo dpkg -i brian-agent_*.deb`，之后用 `brian` 命令（start/stop/status/logs） |
| macOS（Intel/Apple Silicon） | `brian-agent-darwin-*.tar.gz` | 解压 → `xattr -dr com.apple.quarantine brian-agent-*` → `./brian.sh start` |
| Windows | `brian-agent-win32-x64.zip` | 解压 → `brian.cmd start`（前台：`brian.cmd serve`） |

启动后浏览器打开 **http://127.0.0.1:8000**。停止：`./brian.sh stop`（Windows `brian.cmd stop`）。对外监听：`BRIAN_HOST=0.0.0.0`。

Linux 可选 systemd 常驻：`sudo cp systemd/brian-agent.service /etc/systemd/system/ && sudo systemctl enable --now brian-agent`。

### 首次运行须知

- 包内**不含数据库**：`data/` 在首次运行时自动创建（表结构与默认配置种子自动初始化）；
- **通用目录数据已随包预置**：模型提供商列表（OpenAI/Anthropic/DeepSeek/智谱/通义等 13 家）与 MCP 提供商列表（阿里云百炼/ModelScope/GitHub/Smithery 等）在首次运行时自动导入；
- **个人数据不打包**（API Key、对话、记忆等）：提供商目录不含 API Key，需在 `/config` 页选择提供商并填入自己的 Key 才能开始对话；
- 数据目录默认为包内 `data/`（`BRIAN_DATA_DIR` 可改）；端口 `BRIAN_PORT`（默认 8000）、监听地址 `BRIAN_HOST`（默认 127.0.0.1）；
- Windows 首次运行若被 SmartScreen 拦截，选择「仍要运行」。

详见 [packaging/README.md](packaging/README.md)。

## 核心特性

### 1. ChatMap 可视化控制

只问答你关心的信息，摒弃无用的信息进入上下文；
上下文的构建只会采用引用的消息，不会去加载没有引用的消息，实现自主控制上下文；

![alt text](image.png)

### 2. Memory Pin 机制（强制模型注意力）

对话的论数过多，或者上下文太长，上下文可能会不加载或者忽略掉重要的信息，同步哦pin住消息，就可以让重要的信息，永远留在上下文的重要位置；

![alt text](image-1.png)

### 3. 涌现图与关键词图（提升 Memory 质量）

**信息页面**（`/info`）提供两个基于**共现关系**的知识图谱，帮助用户发现记忆中的隐藏关联：

#### 涌现图（Tag Graph）

基于时间线的信息大部分是重要的信息，但是因为上下文长度问题，可能会导致时间距离过远的信息损失，理解请求的内容，通过标签的形式通过图搜索，选中和当前请求最相关的信息；

![alt text](image-2.png)

#### 关键词图（Keyword Graph）

大脑中有些灵光一闪，就是被某一个词给激活的，通过关键词图的相关性搜索，来实现这样的灵光一闪；

![alt text](image-3.png)

这两个图的价值在于：**自动发现记忆中的涌现模式**——用户可能从未意识到的标签/关键词之间的关联被自动挖掘并可视化，帮助用户理解和审视自己的知识结构。同时，这些图谱关系也反向服务于上下文构建（`TAG_RELATIVE` 和 `KEYWORD` 维度），让模型在检索时不仅依赖向量相似度，还能利用**结构化的共现关系**，提升检索质量。

### 4. 随机记忆（增强 Memory 多样性）

设计理念：模拟人脑的**联想性/偶然性回忆**——有时最有价值的上下文恰恰来自看似无关的记忆。随机记忆防止上下文过于狭窄，为模型提供意外的灵感连接。
