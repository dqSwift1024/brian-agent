# docs 目录是系统的文档存放目录；

## 子目录说明

### _1_DevStandards

#### DevStandards.md

个人开发习惯；开发优先采纳个人开发习惯，其次需要遵守 google 的 js 开发规范；

### _2_FrontendDesign

前端设计文档存放目录

#### _0_DesignPrinciples 

系统的整体设计思想目录

##### AgentThink.md

是个人对 Agent 的思考，用来指导本系统的设计的最底层思想；

#### _1_DevelopmentStandards 

开发规范存放目录

##### DevStandards.md

个人开发习惯文档；
优先遵守个人开发习惯文档，其次遵守 google 的 js 开发规范；

#### _2_FrontendDesign

前端的设计文档保存目录

##### FrontendTechStackChoice.md

是前端技术选型文档

##### 整体页面-PRD.md

是前端页面的整体UI设计

##### _00_内容块展示

内容块展示的设计文档存放目录

###### 内容块展示.md

内容块展示设计文档

##### _01_对话页面

对话页面的设计文档存放目录

###### 对话Page-PRD.md

对话页面的设计文档

##### _02_配置页面

配置页面的设计文档存放目录

###### 配置Page-PRD.md

配置页面的设计文档

##### _03_信息页面

信息展示页面的设计文档存放目录

###### 信息Page-PRD.md

信息展示页面的设计文档

###### 画像展示-PRD.md

用户画像展示页面的设计文档（画像总结、维度、置信度/稳定性、历史版本追溯）

##### _04_学习页面

学习进度展示页面的设计文档存放目录

###### 学习Page-PRD.md

学习进度展示页面的设计文档

##### _05_监控页面

系统监控展示页面的设计文档存放目录

###### 监控Page-PRD.md

系统监控展示页面的设计文档


### _3_BackendDesign

后端设计文档存放目录

#### _00_BackendDesign.md

这是后端的分层总体设计

#### _01_Base

后端 Base 层，系统的最底层能力
目录下的子目录是Base层的子模块，*-PRD.md 是子模块的PRD文件

#### _02_Core

后端 Core 层，构建在 Base 层上面的分层
目录下的子目录是Core层的子模块，*-PRD.md 是子模块的PRD文件

#### _03_Agent

后端 Agent 层，构建在 Base 层和 Core 层上面的分层
目录下的子目录是Agent层的子模块，*-PRD.md 是子模块的PRD文件

#### _04_Orchestration

后端 Orchestration 层，构建在 Base 层和 Core 层和 Agent 层上面的分层
目录下的子目录是Orchestration层的子模块，*-PRD.md 是子模块的PRD文件

#### _05_Application

后端 Application 层，构建在 Base 层和 Core 层和 Agent 层和 Orchestration 层上面的分层
目录下的子目录是Orchestration层的子模块，*-PRD.md 是子模块的PRD文件

---

### 使用手册.md

系统的启动、关闭与日常管理操作方法手册；对应根目录下的 `brian` 命令行管理脚本（参考 OpenCode CLI 的启动/关闭方式设计）。内容包括环境要求、快速开始、命令参考（后台守护式 `start`/`stop` 与前台模式 `dev`/`serve`）、端口与配置、常见问题等。

### 打包部署.md

将整个系统打包为单文件可执行的说明文档。采用 Node 官方 SEA（Single Executable Application）+ esbuild，将后端 5 层、前端、4 个原生模块（better-sqlite3 / isolated-vm / @node-rs/jieba / @lancedb/lancedb）与内置 Chromium（Chrome for Testing）集成为一个可执行文件，支持 Windows / Linux / macOS 三平台。对应 `packaging/` 目录下的打包脚本（`build.mjs` / `entry.ts` / `setup-native.ts` / `setup-chromium.ts`）。
