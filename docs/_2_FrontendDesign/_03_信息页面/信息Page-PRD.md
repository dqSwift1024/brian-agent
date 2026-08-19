# 信息展示页面产品需求文档 (PRD)

## 1. 文档概述
### 1.1 产品背景
构建一个系统级的信息可视化与知识管理面板，将离散的系统数据（问答记忆、本地资料、标签关联、关键词）通过结构化布局和可视化图表进行集中展示，帮助用户高效回顾历史工作、管理知识库并洞察知识间的深层联系。

### 1.2 核心目标
-   **记忆回溯**：基于三层ID模型，提供精准、可追溯的问答历史查看体验。
-   **知识管理**：安全、便捷地管理本地Markdown资料库。
-   **知识洞察**：通过图谱可视化揭示Tag与关键词的关联网络及权重分布。

## 2. 全局交互规范
-   **布局方式**：采用全屏Tab切换布局，包含“问答记忆”、“资料库”、“Tag关系图”、“关键词图”四个独立Tab页签。
-   **状态保持**：支持Tab切换时的状态缓存（如滚动位置、图谱缩放比例、展开/折叠状态）。
-   **空状态**：所有模块在无数据时展示引导性空状态插画及操作指引，禁止显示空白区域。
-   **响应式**：适配桌面端主流分辨率，Canvas图表支持鼠标滚轮缩放与拖拽平移。

## 3. 功能详细说明

### 3.1 Tab 1：用户问答信息（记忆）
以时间为维度倒序展示用户的所有问答内容，支持三级数据结构嵌套渲染。

#### 3.1.1 数据模型定义
| ID类型 | 业务含义 | UI映射 |
| :--- | :--- | :--- |
| `work_id` | 一次完整的工作/学习会话集合 | 时间轴节点 / 列表分组标题 |
| `interact_id` | 一轮完整的输入输出交互 | 列表中的对话卡片 |
| `msg_id` | 单条独立消息（用户/Agent/工具） | 卡片内的具体消息条目 |

#### 3.1.2 时间轴组件（左侧）
-   **节点粒度**：以 `work_id` 为最小节点单位。
-   **节点标签**：优先显示AI生成的Work摘要；若无摘要，取该Work下首条用户消息前20字；若仍无，显示创建时间。
-   **密集聚合**：同一天存在≥3个Work时，自动聚合为“N个工作”节点，点击展开子节点列表。
-   **交互**：支持鼠标拖动、点击定位；拖动时右侧列表实时联动更新，定位延迟≤300ms。

#### 3.1.3 列表展示区（右侧）
-   **三级嵌套结构**：
    -   **Level 1 (Work Group)**：显示Work摘要、起止时间、关联Tag；默认仅最新Work展开，历史Work折叠。
    -   **Level 2 (Interact Card)**：按 `interact_id` 分组，视觉上用卡片容器包裹一组Q&A。
    -   **Level 3 (Message Item)**：按 `msg_id` 逐条渲染，根据角色（User/Agent/Tool/System）区分样式。
-   **消息渲染规则**：
    -   Agent回复：完整渲染Markdown，支持代码高亮、公式、表格。
    -   工具调用结果：默认折叠，显示工具名称及执行状态图标，点击展开JSON详情。
    -   流式中断：标记“生成中断”状态，保留已生成内容。
-   **搜索与定位**：
    -   支持全文搜索，命中 `msg_id` 时自动展开其所属Interact和Work上下文。
    -   支持URL深链接定位：`?work_id=xxx&interact_id=yyy&msg_id=zzz`。

### 3.2 Tab 2：用户的资料库
以卡片网格形式管理本地Markdown知识库，支持路径配置、权限校验及内容预览。

#### 3.2.1 资料库卡片列表
-   **排序**：第一个固定为“添加资料库”卡片（虚线边框+加号图标），其余按添加时间倒序排列。
-   **卡片内容**：资料库名称、本地路径（脱敏显示）、文件数量、最后更新时间。
-   **删除操作**：右上角删除按钮，点击弹出二次确认弹窗，明确提示“仅移除引用，不删除本地文件”。

#### 3.2.2 添加/编辑资料库
-   **路径输入**：支持手动输入或系统文件夹选择器。
-   **异步校验**：输入路径后实时校验（防抖500ms），反馈状态：
    -   ✅ 路径有效且可读
    -   ❌ 路径不存在
    -   ❌ 无读取权限
    -   ⏳ 校验中
-   **确认提交**：仅在校验通过状态下允许点击确认按钮。

#### 3.2.3 资料库详情页
-   **入口**：点击资料库卡片进入。
-   **文件列表**：以卡片/列表视图展示该目录下所有 `.md` 文件，支持按名称/修改时间排序。
-   **Markdown预览**：
    -   点击文件打开右侧抽屉或新Tab渲染内容。
    -   渲染引擎支持GFM标准、代码高亮、KaTeX数学公式、Mermaid图表。
    -   防范XSS攻击，禁用内联脚本执行。
    -   支持从MD内容中点击 `work_id` 引用链接跳转至问答记忆Tab对应位置。

### 3.3 Tab 3：Tag关系图
通过Canvas力导向图展示系统中所有Tag及其关联关系，支持交互式探索。

#### 3.3.1 图谱渲染规则
-   **节点大小**：由Tag激活次数决定，采用对数缩放算法：$Radius = R_{min} + (R_{max} - R_{min}) \times \frac{\log(count)}{\log(max\_count)}$，确保大小和谐，最大最小半径比不超过5:1。
-   **边线**：连线粗细/透明度映射关联权重；鼠标悬停边线时显示Tooltip，内容为“关联权重: X.XX”。
-   **性能保障**：
    -   节点数＞300时启用LOD（多细节层次），隐藏低权重节点及文字标签。
    -   静态时停止物理模拟计算，FPS≥30。
    -   支持鼠标滚轮缩放、拖拽画布平移。

#### 3.3.2 交互行为
-   **Hover节点**：高亮该节点及其直接相连的边与邻居节点，其余元素降低透明度。
-   **点击节点**：
    -   图谱平滑居中动画（≤500ms）。
    -   右侧弹出抽屉，列出该Tag关联的 `work_id` 列表（非零散msg），点击可跳转至问答记忆Tab。
-   **双击节点**：锁定/解锁该节点位置，便于手动调整布局。

### 3.4 Tab 4：关键词图
通过Canvas圆形打包图（Circle Packing）展示关键词频次分布，支持钻取查看关联信息。

#### 3.4.1 图谱渲染规则
-   **布局算法**：采用Circle Packing算法，圆形之间无严重重叠，整体呈紧凑圆形分布。
-   **圆形大小**：由关键词激活次数决定，同样采用对数缩放。
-   **颜色编码**：可按关键词类型（实体词/动作词/主题词）或聚类结果分配色系，增强语义区分度。
-   **自适应**：窗口Resize时图谱自动重排，保持居中与完整可见。

#### 3.4.2 交互行为
-   **Hover**：显示关键词全称及激活次数Tooltip。
-   **点击**：
    -   高亮选中关键词。
    -   右侧弹出抽屉，展示关联信息列表；每条信息以完整的 `interact_id` 卡片形式呈现，避免断章取义。
    -   点击卡片可跳转至问答记忆Tab对应位置。

## 4. 跨模块联动机制
| 源模块 | 触发操作 | 目标模块 | 联动行为 |
| :--- | :--- | :--- | :--- |
| Tag关系图 | 点击Tag | 问答记忆 | 自动筛选并展示关联Work列表 |
| 关键词图 | 点击关键词 | 问答记忆 | 定位并高亮匹配的Interact卡片 |
| 资料库 | 点击MD中的work_id链接 | 问答记忆 | 跳转至指定Work并展开 |
| 问答记忆 | 点击消息中的Tag/关键词 | Tag图/关键词图 | 切换Tab并高亮对应节点 |

## 5. 非功能性需求
-   **性能**：问答列表虚拟滚动，万级消息渲染流畅；Canvas图谱300节点+1000边下拖拽FPS≥30。
-   **安全**：本地路径前端脱敏展示；Markdown渲染严格过滤XSS；资料库删除仅移除引用。
-   **容错**：所有API请求失败时展示友好错误提示及重试按钮；Canvas渲染异常时降级为列表视图。
-   **无障碍**：Tab页签支持键盘导航；图谱支持键盘焦点遍历；颜色对比度符合WCAG AA标准。

## 6. 验收标准
1.  问答记忆Tab：时间轴拖动定位≤300ms；三级嵌套渲染正确；搜索结果自动展开上下文；URL深链接可直达指定消息。
2.  资料库Tab：路径校验反馈实时准确；删除操作有二次确认且不删本地文件；MD渲染支持GFM/公式/图表且无XSS风险。
3.  Tag关系图：节点大小对数缩放合理；悬停边显示权重；点击节点居中≤500ms并弹出关联Work列表；300节点下FPS≥30。
4.  关键词图：圆形无严重重叠；点击关键词弹出关联Interact卡片；窗口Resize自适应重排。
5.  跨模块联动：所有跳转、高亮、筛选操作准确无误，状态同步延迟≤200ms。

---

## 7. 历史会话 Tab（前端实现，对应 `/info` 的「历史」页签）

信息页面实际包含「历史 / 记忆 / 资料库 / Tag图 / 关键词图 / 画像 / 消息图」七个页签。其中「历史」页签管理会话列表，行为如下：

### 7.1 展示

- 数据来源：`GET /api/chat/list?userId=...&keyword=...&start_time=...&end_time=...`（后端 `ChatService.searchSession`），按 `lastTime`（最后一条消息时间戳）倒序渲染。
- 每条会话展示：最后消息时间（`lastTime`）、会话名称（`sessionTitle`）、最后一条消息内容预览（`lastMessage`）、消息数（`messageCount`）。
- 后端返回字段为 camelCase（`sessionId / sessionTitle / lastMessage / lastTime / messageCount`），由 `/api/chat/list` 路由统一转换（后端 `searchSession` 内部仍为 snake_case）。
- 「历史」页签以**会话（session）**为单位展示，会话内容来自 `info_raw` 表中的消息记录（`info_type` 含 REQUEST / RESPONSE / THINK / SKILL / MCP / ACT / REFLECT，其中用户问答即 REQUEST + RESPONSE）；「记忆」页签则以**单条 info** 为单位展示。

### 7.1.1 会话名称（自动生成 + 手动修改）

- **自动生成**：用户在某会话发送第一条消息时，若该会话名称为默认占位名（空或「新会话」），后端自动将第一条消息截断前 50 个字符作为会话名称。
- **锁名规则**：会话已存在特定名称（自动生成或用户手动设置）时，后续消息不会自动覆盖或重新生成名称。
- **手动修改**：历史 Tab 每条会话卡片提供编辑按钮（Edit3 图标），点击进入内联编辑输入框，回车或点击确认（Check）调用 `PUT /api/chat/session/:sessionId/title` 保存；提供取消（X）退出编辑。
- **展示优先级**：名称优先显示 `sessionTitle`，为空时回退显示 `lastMessage` 或「新会话」；会话名称下另行展示最后一条消息内容摘要。

### 7.2 搜索

- **后端全文搜索**：输入防抖 300ms 后携带 `keyword` 重新请求 `GET /api/chat/list`。
- 命中规则：`session_title` 或该会话任意 `info_raw.info`（消息内容）包含关键字即命中；无命中返回空列表。
- 后端 `searchSession` 通过 `UNION` 合并标题命中与会话内容命中的 `session_id`，再以 `IN` 条件过滤。
- **按时间搜索**：支持「开始时间 / 结束时间」两个 `datetime-local` 输入，前端转为毫秒时间戳后经 `start_time` / `end_time` 参数回传。
- 时间命中规则：按**消息时间**（`info_raw.created`）过滤，命中在该时间段内存在消息（REQUEST / RESPONSE 等）的会话；关键字与时间范围为 **AND**（交集）关系，任一条件无命中即返回空列表。

### 7.3 删除

- **二次确认**：单个删除与批量删除均弹出确认弹窗，提示将同步清理关联数据且不可恢复。
- **级联删除**（后端 `ChatService.deleteSession`）：删除 `chat_session`、`info_raw`、`info_graph`，并按会话下 `info_id` 级联清理 `info_tag`、`info_summary`、`info_keyword`、`info_vector`。
- **不删除** `info_tag_vector`（全局标签向量，跨会话共享，由 `orphan_tag_check` 定时任务负责清理孤立标签）。
- **批量删除健壮性**：批量删除采用 `Promise.allSettled`，单条失败不影响其余会话删除。

---

## 8. 变更记录

### [2026-08-19] 历史会话 Tab：会话名称自动生成（50 字截断）与手动修改

**变更原因**：使每个会话能以第一条消息前 50 个字符作为初始名称，支持用户手动修改会话名称，且已有名称时系统不再自动覆盖生成。

**修改的方法**：
- `ChatService.submitWork` / `ChatService.openChatStream` — 用户提交首条消息后触发 `autoGenerateSessionTitleIfEmpty`：仅当 `session_title` 为空或「新会话」时，取 `msgContent.trim().slice(0, 50)` 更新；已有名称不覆盖。
- `dev-server.ts` — `GET /api/chat/list` 透传 `sessionTitle`（及 `session_title`）字段；新增 `PUT/POST /api/chat/session/:sessionId/title` 路由，调用 `chatAccess.updateSessionTitle`。
- 前端 `InfoView.vue` — 历史 Tab 会话卡片展示会话名称（`sessionTitle` 优先，回退 `lastMessage`/「新会话」），新增内联编辑（Edit3 图标）与保存（Check）/取消（X）。
- 前端 `ChatView.vue` — 会话管理侧边栏支持同一套名称展示与内联重命名。
- 前端 `api/types.ts` — `ChatSession` 增加 `sessionTitle?` 字段；`api/index.ts` 增加 `chatApi.updateTitle`。

**影响的端点**：
- `GET /api/chat/list` — 返回新增 `sessionTitle` 字段。
- `POST /api/chat/send` / `POST /api/chat/stream` — 首条消息时自动设置会话名称。
- `PUT /api/chat/session/:sessionId/title` — 新增修改会话名称接口。

**可能存在的问题**：
- 自动命名以用户消息原文截断，不含 AI 提炼摘要，长句截断处可能不完整。

### [2026-08-17] 历史会话 Tab：搜索与删除增强

**变更原因**：历史 Tab 原为前端本地过滤（仅匹配最后一条消息）且删除未清理派生表，存在功能局限与孤儿数据问题。

**修改的方法**：
- `ChatService.searchSession` — 由「仅 `session_title` 模糊匹配」改为「标题 + 消息内容全文搜索」，命中会话以 `IN` 条件过滤。
- `ChatService.deleteSession` — 由「仅删 `chat_session`/`info_raw`/`info_graph`」改为「级联清理 `info_tag`/`info_summary`/`info_keyword`/`info_vector`」。
- 前端 `InfoView.vue` — 搜索改为后端搜索 + 300ms 防抖；删除增加二次确认弹窗；批量删除改用 `Promise.allSettled`。
- 前端 `api/index.ts` — `chatApi.list` 增加 `keyword` 参数。

**影响的端点**：
- `GET /api/chat/list` — 支持 `keyword` 全文搜索，返回 camelCase 字段。
- `DELETE /api/chat/session/:id` — 删除会话时级联清理派生表。

**可能存在的问题**：
- `info_keyword` 为 FTS5 虚拟表，级联删除依赖其普通列条件删除能力（已用 better-sqlite3 验证可行）。
- 全文搜索在会话数量极大时 `IN` 条件可能超长，但单机场景会话量有限。

### [2026-08-17] 历史会话 Tab：按时间搜索

**变更原因**：历史 Tab 仅支持关键字搜索，缺少按时间范围回溯对话的能力。

**修改的方法**：
- `ChatService.searchSession` — 时间过滤由「会话创建时间 `chat_session.created`」改为「消息时间 `info_raw.created`」，命中该时间段内存在消息的会话。
- `dev-server.ts` `/api/chat/list` — 增加 `start_time` / `end_time` 查询参数解析。
- 前端 `InfoView.vue` — 增加「开始时间 / 结束时间」`datetime-local` 输入，随关键字一起防抖 300ms 触发搜索。
- 前端 `api/index.ts` — `chatApi.list` 增加 `startTime` / `endTime` 参数。

**影响的端点**：
- `GET /api/chat/list` — 新增 `start_time` / `end_time` 查询参数，与 `keyword` 为 AND 关系。

**可能存在的问题**：
- `datetime-local` 按浏览器本地时区解析，前后端同机部署时区一致，跨时区部署需注意换算。

### [2026-08-17] 记忆 Tab：按时间 / 按标签搜索

**变更原因**：记忆 Tab 原为前端本地过滤，且不支持按时间与按标签搜索。

**修改的方法**：
- `dev-server.ts` `/api/memory/search` — 新增 `tag`（精确标签）、`start_time` / `end_time`（消息时间）过滤条件，`limit` 上限由 200 提升至 500。
- 前端 `api/index.ts` — `memoryApi.search` 改为对象参数（`keyword` / `type` / `tag` / `startTime` / `endTime` / `limit`）。
- 前端 `InfoView.vue` — 记忆 Tab 增加「按标签」「开始时间 / 结束时间」输入，搜索改为后端搜索 + 300ms 防抖。

**影响的端点**：
- `GET /api/memory/search` — 新增 `tag` / `start_time` / `end_time` 查询参数，与 `keyword` / `type` 为 AND 关系。

**可能存在的问题**：
- 标签为精确匹配（`=`），如需模糊匹配可扩展为 `LIKE`。

### [2026-08-17] 记忆 Tab：滚动加载（游标分页）+ 日期导航优化

**变更原因**：记忆 Tab 原为一次性加载最多 500 条，超量记忆无法查看；日期导航列在日期过多时被视口截断，丢失导航入口。

**修改的方法**：
- `dev-server.ts` `/api/memory/list`、`/api/memory/search` — 改为**游标分页**：`cursor`（格式 `created:id`，`id` 为 `info_raw.id` 作 tiebreaker）+ `limit`；排序 `ORDER BY created DESC, id DESC`；返回 `{ memories, has_more, next_cursor }`。
- 前端 `api/index.ts` — `memoryApi.list` / `memoryApi.search` 返回 `MemoryPage`（`memories / has_more / next_cursor`），支持 `cursor` 参数。
- 前端 `InfoView.vue` — 记忆列表改为 `IntersectionObserver` + sentinel 无限滚动，滚动到底部用 `next_cursor` 追加加载；日期导航容器加 `max-h + overflow-y-auto` 内部滚动，并随加载动态增长；scroll-spy 自动高亮当前日期。

**影响的端点**：
- `GET /api/memory/list`、`GET /api/memory/search` — 新增 `cursor` 查询参数，返回结构含 `has_more` / `next_cursor`。

**可能存在的问题**：
- 游标以 `created` 时间戳为序，同一毫秒内多条记录靠 `id`（uuid 字典序）区分，逻辑自洽但需保证 `ORDER BY` 与游标比较规则一致（均为 `created DESC, id DESC`）。
- 追加加载期间若新增消息，可能出现边界重复/遗漏（时间序分页的固有问题），单机单用户场景影响可忽略。

### [2026-08-17] 资料库入口统一

**变更原因**：「资料库」Tab（信息页）与「配置中心 > 应用配置 > 文档目录」功能重复，均为同一后端 `/library/*`（SelfLearning 资料库管理）的前端入口。

**修改的方法**：
- 前端 `ConfigView.vue` — 移除「应用配置 > 文档目录」菜单项、其管理逻辑与实体管理视图模板，仅保留「资料库」Tab 作为唯一入口。

**影响的端点**：
- 无（后端 `/library/*` 接口保留，资料库 Tab 继续使用）。

**可能存在的问题**：
- 无。资料库路径处理（`path.resolve` / `path.join` / `fs.*`）为 Node.js 跨平台 API，支持 Windows / Linux / macOS；HTTP 路由的 `split('/')` 为 URL 解析，与操作系统无关。

### [2026-08-17] 资料库 Tab：启用开关 + 文件树浏览 + 游标分页

**变更原因**：资料库 Tab 原先仅有添加/删除，卡片无启用状态，详情页为占位；不支持浏览目录文件、层级结构与文件内容。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — `self_learning_file` 表新增 `relative_path` / `parent_path` / `is_directory` 字段。
- 后端 `SelfLearningService`：
  - `addLibrary` 改为递归扫描，记录目录（`is_directory=1`）与所有文件（含层级 `relative_path` / `parent_path`），`id` / `file_id` 均由 `IdGenerator.generate()`（Base/ToolProvider，UUID v4）生成。
  - 新增 `setLibraryEnabled`：切换 `enable_self_learning`，启用时重新扫描目录刷新文件数据。
  - `getLibraryFiles` 支持 `directory`（目录过滤）、`keyword`（文件名搜索）、游标分页（`cursor=created:file_id` + `limit`）。
  - 新增 `getLibraryTree`：按 `parent_path` 构建目录树。
- 后端 `dev-server.ts` — 新增 `PUT /api/library/paths/:id/enabled`、`GET /api/library/paths/:id/files`、`GET /api/library/paths/:id/tree`、`GET /api/library/files/:fileId/content` 路由。
- 前端 `api/index.ts` / `types.ts` — `libraryApi` 新增 `setEnabled` / `files` / `tree` / `fileContent`。
- 前端 `InfoView.vue` + 新增 `components/LibraryTreeItem.vue` — 资料库卡片增加启用/禁用开关；详情页支持面包屑路径、目录树跳转、文件名搜索、文件列表无限滚动（IntersectionObserver + sentinel）、文件内容查看。

**影响的端点**：
- `GET/POST/DELETE /api/library/paths`（既有）+ 新增 `PUT .../enabled`、`GET .../files`、`GET .../tree`、`GET /api/library/files/:fileId/content`。

**可能存在的问题**：
- 递归扫描对超大型目录逐条 `insert`，性能一般，可后续优化为批量插入。
- `self_learning_library` 的 `total_files` 统计含目录记录，语义上应区分文件与目录计数。

### [2026-08-17] 资料库 Tab：文档弹窗 + 选中解释 + 文档阅读配置

**变更原因**：文档内容原先内嵌展示；不支持选中内容调用 LLM 解释，也缺少文档阅读所用的 Prompt/LLM 配置。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — `self_learning_config` 表新增 `document_query_prompt_template_id` / `document_query_llm_id` 字段。
- 后端 `SelfLearningService` — 新增 `queryDocument`：读取配置的 Prompt 模板（`promptsAccess.execPrompt`）与 LLM（配置或 `llmCore.matchLLM` 自动匹配），调用 `llmAccess.execLLM` 对选中内容解释；构造函数新增 `llmAccess` / `promptsAccess` 依赖。
- 后端 `Config` — `configRegistrations.ts` 新增「文档阅读 Prompt / 文档阅读 LLM」配置项；`ConfigService` 的 `self_learning` 读写映射补全这两个字段。
- 后端 `dev-server.ts` — `SelfLearningAccess` 装配传入 `llmAccess` / `promptsAccess`；新增 `POST /api/library/query` 路由。
- 前端 `InfoView.vue` — 文件内容改为弹窗展示（内容两侧 `px-8` 留白）；文档内容支持选中，右键弹出「解释选中内容」菜单，调用 `POST /api/library/query` 并在弹窗内展示解释结果。

**影响的端点**：
- 新增 `POST /api/library/query`（body: `{ content }` → `{ result, llm_id }`）。

**可能存在的问题**：
- `queryDocument` 的 LLM 自动匹配依赖 `llm_core` 匹配规则，未配置模型时返回提示而非报错。

### [2026-08-17] 资料库 Tab：文档页面展示区 + 咨询卡片持久化

**变更原因**：文档内容由弹窗改为页面展示区；咨询卡片与选中内容的关联关系需要持久化，重新打开文件时能恢复。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — 新增 `document_annotation` 表（`file_id` / `selection_text` / `selection_start` / `selection_end` / `question` / `result` / `llm_id`），保存咨询卡片与原始内容的关联。
- 后端 `SelfLearningService` — 新增 `saveAnnotation`（保存咨询卡片）、`getFileAnnotations`（按 `file_id` 查询）。
- 后端 `dev-server.ts` — 新增 `POST /api/library/annotations`、`GET /api/library/files/:fileId/annotations`。
- 前端 `InfoView.vue` — 文档展示区改为三栏（左章节 / 内容 markdown / 右咨询卡片）；`submitAsk` 咨询后调用 `saveAnnotation` 持久化；`openFile` 加载该文件历史注释并恢复卡片与下划线；连线改为横平竖直正交线，连接卡片左边缘中间点；点击卡片高亮其连线。

**影响的端点**：
- 新增 `POST /api/library/annotations`、`GET /api/library/files/:fileId/annotations`。

**可能存在的问题**：
- 恢复下划线依赖 `selection_text` 在渲染后 DOM 的文本节点中匹配，跨节点选中无法恢复下划线（卡片仍正常恢复）。