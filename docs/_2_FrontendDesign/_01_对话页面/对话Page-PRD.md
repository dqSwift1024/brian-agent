# Brian Agent 对话页面产品需求文档 (PRD)

## 1. 文档概述

| 项目 | 内容 |
| :--- | :--- |
| **产品名称** | Brian Agent |
| **功能模块** | 对话交互页面 (Chat Interface) |
| **版本号** | V2.0 |
| **文档状态** | 正式发布 |
| **优先级** | P0 |

## 2. 功能目标
构建基于 Block-Native 架构的对话交互界面，实现内容数据与视觉展示的彻底解耦。通过标准化的块级渲染引擎支持异构内容（文本、思维链、工具调用、产物预览）的统一流式展示；结合 ChatMap 可视化与消息关联关系元数据，帮助用户理解 AI 思考链路及消息间的逻辑引用；提供高性能、可扩展、具备无障碍支持的会话管理与反馈机制。

## 3. 页面布局与结构

### 3.1 整体架构
-   **双栏自适应布局**：左侧 ChatMap 区（默认 40%）+ 右侧对话区（默认 60%）。
-   **分隔交互**：中间设置 `ResizableDivider`，支持鼠标拖拽调整左右宽度比例，最小宽度限制需防止内容挤压。

### 3.2 响应式规则
-   当窗口宽度 < 1024px 时，ChatMap 区默认折叠或转为悬浮面板模式。
-   对话输入区宽度始终占对话区宽度的 80%，居中显示。

## 4. 详细功能需求

### 4.1 对话输入区 (Input Zone)

| 字段/组件 | 类型 | 规则/逻辑 | 备注 |
| :--- | :--- | :--- | :--- |
| 输入框 | Textarea | 1. 占位符："输入消息..."2. 高度自适应，Max-height: 200px3. Enter 发送，Shift+Enter 换行 | 需防抖处理 |
| 引用标签 | Tag | 选中历史消息后在输入框上方显示摘要，支持点击 × 移除 | 多选时横向排列 |
| 发送按钮 | Icon Button | 1. 默认蓝色，空内容禁用(灰色)2. 发送中显示 Loading 动画 | 状态机管理 |
| 乐观更新 | - | 提交后立即构造临时 UserTextBlock 插入列表尾部，待服务端返回正式 Block ID 后替换 | 提升体感速度 |
| 会话初始化 | API | 发送前通过 `ensureSession()` 确保会话有效：若已有会话 ID，先调用 `getSessionDetail()` 校验其是否真实存在于后端（404 则视为失效并重新创建），否则调用 `createSession()` 在后端创建会话；禁止前端本地拼造 session_id（如 `session-${Date.now()}`），否则后端校验 session 不存在而报错 | 会话 ID 由后端 `IdGenerator.generate()` 生成 |
| TraceId | - | 每次发送消息前由前端生成 `trace_id`（`crypto.randomUUID()`），随请求体透传到后端，后端贯穿整条处理链路并回写到 SSE 事件（`connected`/`done`/`error`）；前端将本次对话的 trace_id 挂载到 FeedbackBlock/ErrorBlock 供复制 | 用于问题排查与日志检索 |
| 提交接口 | API | `submitWork(session_id, msg_content, citing_msg_ids, trace_id)`（流式走 `openChatStream` → `POST /api/chat/stream`） | 发送成功后清空输入框 |

### 4.2 ChatMap 可视化区

-   **渲染引擎**：基于 DOM + SVG 渲染，支持富交互（复选框、展开列表、钉住开关、连线与节点高亮选择）。
-   **排布算法**：
    -   问答回复 → 纵向堆叠（系统回答放在提问正下方，同一列）。
    -   引用关系 → 横向布局（X 轴偏移，引用方位于被引用方右侧，由左至右层级展开；层级同时经问答边传播，保证回答与提问同列）。
    -   行带对齐 → 引用方与被引用方的最下面的一个消息框适用相同的纵坐标（引用边连接的消息列归入同一行带，行带内共享底部行；行带间按时间先后堆叠并留出行间距）。
    -   连线与锚点规范：
        -   **回复关系**（QUESTION_ANSWER）：从提问方（REQUEST）底部中点 `(x + W/2, y + H)` 指向回答方（RESPONSE）顶部中点 `(x + W/2, y)`，箭头向下；
        -   **引用关系**（CITATION）：从**被引用方**右边中点 `(x + W, y + H/2)` 指向**引用方**左边中点 `(x, y + H/2)`，箭头向右进入引用方左侧；
        -   **同向连线唯一性**：两个消息展示框之间在同一方向上严格保持单一连线，当同时存在问答回复与引用关系时自动去重，杜绝重复多余连线。
-   **选中与联动高亮**：
    -   **选中消息展示框**：点击消息卡片使其高亮聚焦（`ring-2 ring-brian-blue`）；该节点关联的所有连线变色联动高亮（其发出的被引用连线显示为紫色 `#8b5cf6`，其接收的引用连线显示为天蓝色 `#0284c7`），其余无关连线半透明淡化；
    -   **选中连线**：点击任意连线（含 14px 隐形点击响应热区），仅当前被点击的连线加粗变色高亮（`#2563eb`），其他连线与节点保持原样；
    -   **取消选中**：点击画布空白区域重置所有选中态与高亮样式。
-   **消息框结构一致性**：ChatMap 区与对话区复用同一消息框组件（`MessageCard`），结构完全一致（顶部栏 = 时间/错误标识/复选框/钉住开关；内容区 = 摘要 + 原文双区；底部栏 = 引用/被引用胶囊、思考过程按钮、复制 TraceId、消息长度）。摘要与原文双区均支持折叠/展开，且均渲染 Markdown 内容；两区差异仅通过 `mode` 样式覆盖区分（字号、最大高度、配色）：
    -   **ChatMap 区**（`mode=map`）：默认展开**摘要**、折叠**原文**（折叠时仅显示标签行，可手动展开）；
    -   **对话区**（`mode=timeline`）：默认展开**原文（Markdown 全文）**、折叠**摘要**；
    -   **折叠/展开可交互**：用户可随时手动切换任意一区的展开状态，折叠状态由响应式状态保存，不受组件重渲染影响；摘要为空时回退原文展示，双区均为空时摘要区显示「(无内容)」。
-   **节点内容**（与右侧对话列表内容一致）：消息产生时间、消息摘要、消息原文（默认折叠）、消息引用消息数量（胶囊内数字，点击展开引用消息摘要列表，可跳转到指定消息）、消息被引用消息数量（胶囊内数字，点击展开被引用消息摘要列表，可跳转）、钉住/解开钉住开关（右上角）、复选框（右上角钉住按钮旁，用于勾选指定本次问答的专属上下文，勾选后仅基于复选消息与钉住消息进行问答，问答完成后自动取消勾选）、消息长度。
-   **错误展示与引用关系**：
    -   **错误全域展示**：即使执行报错，错误回复也会保存并在 ChatMap 区（红色边框与警告标识）和对话区（ErrorBlock/错误卡片）完整展示；
    -   **问答引用关系**：一次问答天然构成一次引用和被引用关系（系统回复作为引用方自动引用用户的提问）；提问框下方的引用胶囊与 ChatMap 节点中的引用/被引用计数均如实计入并可双向跳转追溯。
-   **交互能力**：
    -   画布：支持 Pan (拖拽平移) + Zoom (滚轮缩放)。
    -   节点点击：右侧对话列表滚动定位到对应消息并居中；对话列表点击消息：ChatMap 平移使对应节点居中并高亮。
-   **数据联动**：ChatMap 节点与对话区消息基于同一套 `info_id` 体系进行双向同步。
-   **数据加载**：页面挂载（onMounted）时若有当前会话，自动调用 `getVisualizedMessageDAG`（`/api/visualization/message-dag`）加载消息关系图谱（一问一答 + 引用 + 引用/被引用计数 + 钉住状态）；每轮对话结束（done/error）后再次刷新。
-   **空态**：无节点时显示「暂无 ChatMap 数据」占位，提示发送消息后生成对话图谱。

### 4.3 对话内容展示层 (Block-Native Message Stream)

#### 4.3.1 展示架构原则
-   **块级原子化**：所有消息内容均抽象为标准 `Block` 对象序列进行渲染，禁止直接渲染原始 Markdown 字符串。
-   **数据视图解耦**：展示层仅消费符合《Block 数据消费契约》的标准化数据，不感知后端 Agent 编排逻辑。
-   **增量流式更新**：采用 SSE 事件驱动 Block 的插入、追加与状态变更，支持帧率缓冲合并，保障生成流畅度。

#### 4.3.2 消息容器与时间序展示
-   **虚拟化列表**：消息列表采用虚拟化滚动容器，仅渲染视口内及预加载区的 Block，支持动态高度测量与缓存，杜绝布局抖动。
-   **时间序列基准**：消息容器严格按 `timestamp` 升序排列 Block 组。每个消息组（Message Group）包含一个或多个语义相关的 Block。
-   **智能锚定**：
    -   当最新 Block 处于流式生成态且用户视口位于底部阈值内时，自动跟随滚动。
    -   用户主动上滑超出阈值后，立即解除自动跟随，直至手动回到底部。
-   **角色区分**：通过 Block 元数据中的 `role` 字段（user/assistant/system）驱动差异化容器样式（左对齐浅蓝底 / 右对齐白底），而非硬编码消息类型。
-   **消息复选框**：对话区和 ChatMap 区每一条消息展示框右上角（钉住消息按钮旁边）内置复选框。用户勾选任意消息后，本次提问仅以复选的消息和已钉住的消息作为上下文传给后端；输入区提示当前勾选条数；本次问答完成后，复选框自动取消勾选。

#### 4.3.3 关联关系展示规范
消息间的引用与关联关系通过 Block 数据契约中的关系字段进行可视化表达：

| 关联类型 | 数据载体 | 展示形式 | 交互行为 |
| :--- | :--- | :--- | :--- |
| 消息引用 | TextBlock.meta.citing_ids | 在文本块顶部渲染“引用标签条”，显示被引用消息摘要 | 点击跳转定位到被引用块 |
| 被引用计数 | Block.meta.cited_count | 在块左下角渲染计数徽章，数字 > 0 时可见 | Hover 显示引用来源列表 Tooltip |
| 思维链归属 | ThinkingBlock.meta.parent_msg_id | 以缩进+左侧边框样式吸附于父消息下方，默认折叠 | 展开/收起具备平滑过渡动画 |
| 工具调用关联 | ToolCallBlock.meta.related_block_id | 以卡片形式内联于消息流中，通过虚线连接相关文本块 | 点击卡片展开完整参数与返回值 |
| 跨消息线程 | RelationLineBlock | 独立的关系连线块，在消息列表中插入视觉分隔与引导线 | 点击可高亮关联的两端消息块 |

#### 4.3.4 内置 Block 类型应用规范

| Block 类型 | 应用场景 | 关键展示规则 |
| :--- | :--- | :--- |
| TextParagraph | 用户消息、Agent 最终回复 | 支持富文本行内样式；流式生成时末尾显示闪烁光标；完成后光标淡出；支持原生选中复制 |
| Heading | 长回复的结构化分段 | 支持多级字阶；点击生成锚点链接，支持 URL 分享定位 |
| CodeBlock | 代码生成、SQL、JSON 输出 | 语法高亮不阻塞主线程；流式生成时自动滚至最新行；提供一键复制与语言标签 |
| ThinkingChain | Agent 思考过程、规划步骤 | 对话区不直接展示（以弹窗形式呈现）；ChatMap/对话区消息框底部提供「思考过程」按钮，点击后先调用 `GET /api/chat/thinking` 从后端采集该消息对应 Work 的 Agent 执行轨迹，再以弹窗（ThinkingModal）展示；弹窗内默认折叠，仅显示摘要+时长；流式生成中显示活动指示器；支持切换查看 Context (用户画像/历史引用)、Input (任务 Prompt)、Steps (Think 推理 / Act 工具调用及参数结果 / Reflect 自我反思与 Pass 结论) 与 Output (节点产出)；刷新/加载历史记录时完整恢复对应 Work 的 Agent 执行 Blocks |
| ToolInvocation | 工具调用、API 请求 | 卡片式展示工具名+参数摘要+状态；加载中显示骨架屏；完成后支持展开详情 |
| ArtifactPreview | 生成的图表、文档、图片 | 带边框卡片+缩略图；资源加载中显示占位符；点击触发外部预览回调 |
| ErrorFallback | 生成失败、接口异常 | 警示样式+友好文案；Hover 显示原始错误码；支持重试按钮（若上游提供回调） |
| Unsupported | 未注册类型、数据异常 | 虚线边框+“不支持的内容类型”标签；开发环境可切换查看原始 JSON |

#### 4.3.5 流式协议与 Block 映射

* **事件驱动与无冗余占位**：发送消息时前端不再本地预插空白 `ThinkingChain` 块，所有 Block 均由后端 SSE `BrianSSEMessage` 结构化事件驱动按需生成，杜绝空状态与时序倒置；
* **流式与持久化平滑衔接**：流式过程中以打字机形式渲染 `TextParagraph` 与 `ThinkingChain`；对话结束（`done`）后拉取后端完整历史消息，平滑清理临时 `TextParagraph` 块，避免与官方 `MessageCard` 产生双份重复渲染。

| SSE Event | Block 操作 | 说明 |
| :--- | :--- | :--- |
| `connected` | Update(ConnectionState) | 确认 SSE 链路已建立 |
| `loading` | Insert(StatusBlock, state=loading) | 插入加载状态块，后续被实际内容块替换 |
| `plan_created` | Update(PlanningData.task_dag) | Planning 策略下 PlannerAgent 完成任务级拆解（Task DAG），弹窗展示子任务清单（领域/复杂度/优先级/依赖） |
| `agent_dag_created` | Update(PlanningData.agent_dag) | 任务级拆解映射为 Agent DAG（agent_nodes / agent_edges），弹窗内复用 AgentDagFlow 渲染工作节点网络 |
| `dag_node_start` | Update(PlanningData.execution_steps) | JSONNode 编排节点开始执行，追加 RUNNING 步骤 |
| `dag_node_end` | Update(PlanningData.execution_steps) | JSONNode 编排节点执行结束，更新步骤状态与耗时 |
| `agent_building` | Update(AgentSpec) | 提示 Agent 正在分析与装配 |
| `agent_built` | Update(ThinkingChainBlock, meta.agent_info) | 更新思维链块的 Agent 名称与类型元数据 |
| `agent_thinking` | Append(ThinkingChainBlock, content) | 向思维链块追加思考内容（以 2-5 字符打字机 chunk 渲染） |
| `agent_action` / `agent_status` | Insert/Update(ToolInvocationBlock) | 插入或更新工具调用块的执行状态与参数结果 |
| `text_chunk` / `text` | Append(TextParagraphBlock, delta) | 向文本块追加增量内容，以打字机 chunk 进行流畅渲染 |
| `citation` | Update(TextParagraphBlock, meta.citing_ids) | 更新文本块的引用关系元数据，触发引用标签条重渲染 |
| `done` | Finalize(BlockGroup) | 标记当前消息组所有 Block 为完成态，移除光标，加载官方 MessageCard 并清理临时文本块 |

#### 4.3.6 块级交互与反馈
-   **思考过程弹窗**：对话区与 ChatMap 区每条消息框底部提供「思考过程」按钮（紫色胶囊 + 大脑图标）。点击后：
    1. 立即打开 `ThinkingModal` 弹窗（含流式场景下 target 为空时实时展示当前流式思考块）；
    2. 并行调用 `GET /api/chat/thinking?info_id=...` 从后端采集该消息对应 Work 的 Agent 执行轨迹（ThinkingChain Blocks 与 Planning 策略拆解 Task/Agent DAG），返回后弹窗切换到历史思考块；
    3. 采集失败或反查不到 work_id 时展示「暂无思考过程」空态，不阻断弹窗关闭。
    弹窗顶部优先展示 **Planning 策略拆解**（`PlanningBreakdown`）：任务级拆解子任务清单（领域/复杂度/优先级/依赖）、任务→Agent 映射 DAG（复用 `AgentDagFlow`）、JSONNode 编排执行步骤（状态/耗时）；下方逐 Agent 展示思考块。流式期间拆解数据随 `plan_created` / `agent_dag_created` / `dag_node_start` / `dag_node_end` 事件实时填充。
    弹窗支持点击遮罩 / 右上角 X 关闭；流式对话进行中（`done` 事件前）弹窗自动弹出并实时展示思考块，`done`/`error` 事件后自动关闭。
-   **悬浮工具栏**：鼠标悬停 Block 区域 300ms 后浮现轻量操作栏（复制、引用、反馈）；移出后延迟 200ms 消失；移动端改为长按触发底部面板。
-   **本地视觉状态**：折叠/展开、详情展开等状态由独立本地状态管理，不与数据层混合，页面刷新后重置。
-   **反馈组件**：系统回复消息组底部渲染 FeedbackBlock，包含 1-5 星评分与点赞/点踩按钮，点击调用 `addFeedback(msg_id, score, type)`，触发即时视觉反馈；并渲染「复制 TraceId」按钮，点击将本次对话的 trace_id 写入剪贴板。
-   **错误展示**：对话失败时渲染 ErrorBlock，展示后端返回的真实 `error_message` 与 `error_code`（不再展示通用兜底文案），并附带 trace_id 复制按钮，便于日志检索定位。
-   **键盘与无障碍**：所有可交互 Block 支持 Tab 聚焦 + Enter/Space 触发；流式文本块声明 `aria-live="polite"`；折叠元素声明 `aria-expanded`；错误块使用 `role="alert"`。

#### 4.3.7 性能与降级要求
-   **渲染帧率**：文本流式生成峰值 ≥ 55fps；千块规模滚动 ≥ 58fps。
-   **首屏性能**：百块规模 FCP ≤ 800ms。
-   **布局稳定**：流式生成期间 CLS ≤ 0.05。
-   **内存控制**：两千块规模内存占用 ≤ 150MB。
-   **降级可靠性**：未知块类型或异常数据 100% 渲染 Fallback Block，严禁白屏或崩溃。

### 4.4 会话管理侧边栏

-   **触发方式**：右上角按钮 Hover 显示，Click 展开（宽度 300px，右侧滑入覆盖层）。
-   **核心操作**：
    -   搜索：调用 `searchSession(keyword)`，支持模糊匹配（匹配会话名称 `sessionTitle` 与消息内容）。
    -   新建：调用 `createSession()`，成功后自动切换并关闭面板。
    -   删除：单条删除或批量勾选删除，需二次确认。
    -   重命名：会话条目提供编辑按钮（Edit3 图标），点击进入内联编辑，回车或点击确认（Check）调用 `chatApi.updateTitle`（`PUT /api/chat/session/:sessionId/title`）保存，X 取消。名称优先展示 `sessionTitle`，为空回退 `lastMessage` 或「新会话」。
-   **溢出保护**：切换会话前调用 `checkSessionOverflow()`，超限则 Toast 提示并阻断操作。
-   **会话切换清理**：切换会话时，清空当前 Block 列表并重新初始化流解析器，避免跨会话 Block 状态污染。
-   **刷新恢复**：页面挂载（onMounted）时，若 localStorage 存在当前会话 ID，自动调用 `getChatHistory`（`GET /api/chat/history`）恢复历史消息，并调用 `getVisualizedMessageDAG`（`GET /api/visualization/message-dag`）恢复 ChatMap 消息关系图谱，刷新后不丢失对话。

### 4.5 Agent 编排 DAG 弹窗

-   **触发**：ChatMap 卡片上的 DAG 按钮。
-   **展示内容**：全屏遮罩弹窗 (800×600)，Canvas 绘制 Agent 执行链路。
-   **节点信息**：Planner → Work → Writer → Evolutor。
-   **详情查看**：点击节点弹出 Tooltip/侧边详情，展示 Input/Output/Token/Duration。其中“输出”字段复用 Block 渲染组件进行展示，保持视觉一致性。
-   **数据源**：`getAgentChain(session_id, msg_id)`。

## 5. 接口清单

| 接口名称 | 方法 | 用途 | 关键参数 |
| :--- | :--- | :--- | :--- |
| submitWork | POST | 发送消息 | session_id, msg_content, citing_msg_ids |
| getBlockStream | GET | 历史消息 Block 结构化回溯 | session_id, msg_id |
| searchSession | GET | 搜索/获取会话列表 | keyword, page, size |
| createSession | POST | 创建新会话 | - |
| deleteSession | DELETE | 删除会话 | session_ids[] |
| checkSessionOverflow | GET | 检查会话上限 | user_id |
| getAgentChain | GET | 获取 Agent 执行链路 | session_id, msg_id |
| addFeedback | POST | 提交反馈 | msg_id, score, type |

## 6. 非功能性需求

-   **兼容性**：支持 Chrome 90+, Safari 15+, Edge 90+ 最新两个大版本；不支持的特性需提供优雅降级方案。
-   **主题支持**：所有视觉样式通过 CSS 变量驱动，支持运行时主题切换且不引发额外重绘。
-   **状态持久化**：刷新页面后保持当前会话 ID 及 ChatMap 视图位置；Block 本地视觉状态不持久化。
-   **移动端适配**：针对触摸操作、横向溢出、工具栏触发方式做专项适配。

## 7. 变更记录

### [2026-08-21] 修复刷新后系统回复重复展示与移除冗余 exchanges 请求
- **变更原因**：刷新对话页面后，对话区将系统回复消息展示两次——一次经 `MessageCard`（正确消息框结构），另一次经 `loadChatHistory` 中为 blocks 为空消息构造的 `TextParagraph` 兜底块（纯文本段落，非消息框结构），不符合「对话结束拉取历史消息后应避免与官方 MessageCard 产生双份重复渲染」的要求；同时页面挂载/切换会话时发起了无实际用途的 `/api/chat/exchanges` 请求（结果被丢弃）。
- **功能变更**：
  1. **移除兜底 TextParagraph 块**：`session.ts` 的 `loadChatHistory` 不再为 blocks 为空的 assistant 消息构造 `TextParagraph` 兜底块（原代码注释保留为参考）。系统回复内容统一由 `messages` 经 `MessageCard` 渲染；`blocks` 仅用于承载后端下发的 ThinkingChain 等思考块（供「思考过程」弹窗采集，对话区不直接展示）。
  2. **移除冗余 exchanges 请求**：删除 `session.ts` 的 `loadExchanges`、`api/index.ts` 的 `chatApi.exchanges` 及 `ChatView.vue` 中的两处调用（原代码注释保留为参考）。页面刷新/切换会话仅保留 `GET /api/chat/history` 与 `GET /api/visualization/message-dag` 两个必要接口。
- **行为差异**：
  - 修改前：刷新后系统回复在对话区出现两次，其中一次为非消息框结构的纯文本段落；页面刷新会额外发起 `/api/chat/exchanges` 请求。
  - 修改后：系统回复在对话区仅经 `MessageCard` 展示一次；页面刷新仅发起历史消息与消息图谱两个必要接口。
- **新增边界条件**：后端 `/api/chat/exchanges` 路由保留（供 e2e 测试与后续扩展使用），仅前端不再调用。

### [2026-08-19] 对话区不展示 Planning 策略拆解
- **变更原因**：用户要求对话区只保留 REQUEST/RESPONSE 消息的清爽展示，"Planning 策略拆解"卡片不应混入消息流。
- **功能变更**：`ChatArea.vue` 对话区消息流移除 `AgentDagFlow` 渲染（原代码注释保留为参考），长程多 Agent DAG 网络不再在对话区展示；Planning 策略拆解仅保留在"思考过程"弹窗（`PlanningBreakdown`）内展示。
- **行为差异**：
  - 修改前：RESPONSE 消息上方渲染"Planning 策略拆解"DAG 网络卡片（`AgentDagFlow`）。
  - 修改后：对话区仅展示 REQUEST/RESPONSE 消息卡片与交互块，不再展示拆解 DAG 卡片；拆解详情通过消息框底部「思考过程」按钮在弹窗内查看。
- **新增边界条件**：无（纯前端展示移除，`/api/chat/history` 仍返回 `agentDag` 字段，兼容弹窗/信息页后续消费）。

### [2026-08-19] Planning 策略拆解加入"思考过程"弹窗
- **变更原因**：此前"思考过程"弹窗仅展示各 Agent 的 ThinkingChain 思考块，未包含 Planning 策略下的任务分解与 Agent DAG，复杂任务看不到"如何被拆解"的全貌。
- **功能变更**：
  1. **后端数据采集**：`dev-server.ts` 的 `buildThinkingBlocksAndDag` 解析 `agent_plan.task_dag` 得到 Planner 任务级拆解（Task DAG），随 `workDagMap` 一并下发；`GET /api/chat/thinking` 响应新增 `dag` 字段（`planId` / `totalCount` / `taskDag` / `nodes` / `edges`）。
  2. **流式实时拆解**：`ChatArea.vue` 的 `handleStreamEvent` 新增 `plan_created`（记录 Task DAG）、`agent_dag_created`（记录 Agent DAG）、`dag_node_start` / `dag_node_end`（记录 JSONNode 编排执行步骤）四个事件处理，实时写入 `sessionStore.planning`。
  3. **弹窗展示**：新增 `PlanningBreakdown.vue`，弹窗顶部展示任务拆解清单（领域/复杂度/优先级/依赖）、任务→Agent 映射 DAG（复用 `AgentDagFlow`）、编排执行步骤（状态/耗时）；`ThinkingModal.vue` 依据 target 是否为流式自动选择实时拆解或接口采集拆解数据。
  4. **前端类型**：`types.ts` 新增 `TaskDagNode` / `TaskDagEdge` / `TaskDagData` / `DagNodeItem` / `DagEdgeItem` / `AgentDagData` / `DagExecutionStep` / `PlanningData`；`session.ts` 新增 `planning` / `thinkingDag` 状态及 `resetPlanning` / `updatePlanning` 操作。
- **行为差异**：
  - 修改前：弹窗仅显示 Agent 思考块；点击"思考过程"仅返回 ThinkingChain Blocks。
  - 修改后：弹窗顶部展示 Planning 策略拆解（任务拆解 → Agent DAG → 编排执行步骤），流式期间实时填充，历史消息点击按钮从后端采集完整拆解数据。
- **新增边界条件**：Simple 策略或无拆解数据时不渲染拆解区块；接口反查不到 task_dag / agent_dag 时 `dag` 为 `null`，弹窗仅展示思考块。

### [2026-08-19] ChatMap 布局：回答正下方 + 引用底部对齐
- **变更原因**：用户提出 ChatMap 区两条布局要求——① 系统回答应放在提问的正下方；② 引用方与被引用方的最下面的一个消息框纵坐标一致。
- **功能变更**（`session.ts` 的 `loadDag` 布局算法）：
  1. **回答正下方**：层级传播不再只针对 CITATION 边，QUESTION_ANSWER 边同样参与（回答方层级 = 提问方层级），保证每条问答同列、回答位于提问正下方一行。
  2. **引用底部对齐**：问答边连接的 REQUEST+RESPONSE 归为「消息列」（party）；引用边将引用方与被引用方的消息列归入同一「行带」，行带内所有消息列共享底部行（最下面的消息框纵坐标一致）。
  3. **行带排布**：行带按节点最早时间先后排序依次分配底部行索引，行带之间留一行间距。
- **行为差异**：
  - 修改前：y 仅按消息时间序号线性递增，x 仅按引用层级；若回答被后续引用，回答方与提问方可能不同列（回答不在提问正下方）。
  - 修改后：回答必在提问正下方；引用关系两端消息列的最下面的消息框纵坐标对齐；无引用关系的独立话题按时间纵向分离并留出行间距。
- **新增边界条件**：提问尚无回答（流式进行中）时，该提问作为单消息列放在行带底部行，与所引用的被引用方底部对齐。

### [2026-08-19] 消息框摘要/原文双区统一折叠与 Markdown 渲染
- **变更原因**：ChatMap 区消息框此前摘要/原文均为纯文本展示（未渲染 Markdown），且摘要区与原文区由两套不同分支实现，不符合「ChatMap 与对话区消息框结构统一、差异仅靠样式覆盖」的要求。
- **功能变更**：
  1. **双区结构统一**：`MessageCard.vue` 内容区改为「摘要 + 原文」双区统一 `<details>` 结构（均支持折叠/展开，均渲染 Markdown）：
     - 摘要区：新增 `renderedSummary`，走 `marked` + `DOMPurify` 渲染 Markdown，无摘要时回退原文（再为空显示「(无内容)」）；
     - 原文区：`renderedContent` 走 `marked` + `DOMPurify` 渲染 Markdown（原有能力）。
  2. **默认展开态**：ChatMap（`mode=map`）默认展开摘要、折叠原文；对话区（`mode=timeline`）默认展开原文、折叠摘要；差异仅由 mode 样式覆盖（字号、最大高度、配色）区分，不再使用两套模板分支。
  3. **折叠状态可交互且持久**：折叠/展开状态由响应式 ref（`summaryOpen`/`contentOpen`）管理，经 `@toggle` 同步；用户手动切换后不因组件重渲染重置为默认态；隐藏原生 `<details>` 箭头，改用旋转 `▸` 指示符。
- **行为差异**：
  - 修改前：ChatMap 消息框摘要为单行纯文本截断、原文为纯文本（`whitespace-pre-wrap`），均不渲染 Markdown；对话区仅原文渲染 Markdown。
  - 修改后：ChatMap 与对话区消息框结构一致，摘要与原文双区均渲染 Markdown，均支持折叠/展开，仅默认展开态不同。
- **新增边界条件**：摘要为空时回退原文展示；摘要与原文均为空时摘要区显示「(无内容)」。

### [2026-08-19] 消息框摘要统一生成与无截断展示
- **变更原因**：解决消息框摘要被后端（50字原文截断）与前端（20字截断）多重截断的问题，同时收拢 LLM 摘要生成逻辑至 SummaryAgent。
- **功能变更**：
  1. **前端摘要取消 20 字截断**：`session.ts` 移除 `.slice(0, 20)`，保留完整的 `info_summary` 数据。
  2. **后端摘要使用真实 AI 摘要**：`VisualizationService.getVisualizedMessageDAG` (`GET /api/visualization/message-dag`) 改从 `info_summary` 表读取真实 AI 摘要，不再对原文做 50 字截断。
- **行为差异**：对话区与 ChatMap 消息框展示完整的 AI 生成摘要（超阈值内容不被截断，≤100字短内容展示完整原文作为摘要）。

### [2026-08-20] "思考过程"弹窗：PromptProvider完整Prompt与引用消息采集分类统计

- **变更原因**：确保"思考过程"弹窗中展示的"Agent 发送给 LLM 的完整 Prompt"全量使用 PromptProvider 渲染返回的完整 Prompt（涵盖 System Soul、提示词模板、对话历史与变量），同时按消息采集方式对"引用的消息"进行精确分类与数量统计。
- **功能变更**：
  1. **PromptProvider 完整 Prompt 全链路贯通**：
     - 在 Agent 层（`AgentExecutionService.ts`、`IntentAgentService.ts`、`PlannerAgentService.ts` 等）将 `promptsAccess.execPrompt` / `PromptProvider` 返回的 `prompt` 完整保存至执行 Trace 记录、`IntentAgentOutput` 与 Work 元数据。
     - 在实时流式 SSE 事件（`agent_thinking`、`agent_reflection`、`intent_agent_result`、`agent_output`）中全量透传 `prompt` 属性，确保前端流式期间即能完整获取 PromptProvider 渲染的完整 Prompt。
     - 前端 `ThinkingBlock.vue` 明确标记并优先渲染 PromptProvider 返回的完整 Prompt（含系统提示词与上下文渲染变量）。
  2. **“引用的消息”按采集方式分类及数量统计**：
     - 前端 `ThinkingContext.vue` 与 `ChatArea.vue` 解析完整 `context_categories`（含有显式引用 CITING、时间线 TIMELINE、钉住关注 PINNED、语义相似 SIMILARITY、标签相关 TAG_RELATIVE、关键词匹配 KEYWORD、随机采样 RANDOM、手动勾选 SELECTED）及分类 ID 映射。
     - `ThinkingContext.vue` 提供顶部**采集方式分类与数量统计网格**（如显式引用: 2条 | 时间线: 5条 | ...）与引用消息总计徽章，并在下方按采集方式分类列出所有引用的消息列表。
- **行为差异**：
  - 修改前：思考弹窗中 Prompt 在流式阶段容易降级为当前发送消息 Query；引用的消息二选一展示且缺乏采集方式的数量统计分类。
  - 修改后：思考弹窗全程展示 PromptProvider 返回的完整 Prompt；引用的消息按 8 种采集方式分类列出并进行数量统计。

### [2026-08-20] "思考过程"弹窗上下文丰富度提升、Prompt脱敏非内容属性、复制跨平台与Markdown渲染修复
- **变更原因**：修复"思考过程"弹窗中运行与对话上下文环境展示不足、Agent 发送给 LLM 的 Prompt 混入 work_context 等非内容 JSON 属性、输入/输出 Token 显示为 0、Prompt 与回复复制未跨平台写入系统剪贴板以及 LLM 回复未正确渲染 Markdown 的问题。
- **功能变更**：
  1. **上下文环境全分类数据透传**：`JSONNodeService.ts` 的 `context_built` SSE 事件与 `dev-server.ts` 的 `/api/chat/thinking` 端点完整解析并透传 `context_categories`（含有引用消息、时间线消息、钉住消息、语义相似消息、标签相关消息、关键词相关消息、随机消息）与 `context_category_ids` 映射表，使 `ThinkingContext.vue` 能展示完整的问答上下文。
  2. **Prompt 剥离非内容 JSON 属性**：在 Agent 层 (`AgentExecutionService.ts`) 调用 `PromptProvider` 前以及后端重建思考块时，调用 `parseTaskContentAndContext` 自动剥离 `work_context` JSON 前缀，确保 Prompt 变量仅包含干净的用户 Query / Task Content，消除非内容 JSON 属性。
  3. **输入与输出 Token 统计修复**：在 trace 追踪与单步 answer 执行时完整记录 `prompt`、`raw_response`、`input_tokens` 与 `output_tokens`；`agent_output` SSE 事件中透传 Token 细项，并在前端 `ChatArea.vue` 和 `dev-server.ts` 中完成准确计算与回填。
  4. **跨平台剪贴板复制 (Windows/Linux/macOS)**：`ThinkingBlock.vue` 复制 Prompt 与复制回复按钮重构为使用 `@/utils/clipboard` 中的 `copyToClipboard`，支持现代 Clipboard API 与 `document.execCommand('copy')` 双重降级，彻底解决非安全上下文/跨 OS 剪贴板失效问题。
  5. **模型完整回复 Markdown 渲染**：`ThinkingBlock.vue` 中“模型的完整回复 (LLM Response)”改用 `marked` 解析并经 `DOMPurify` 过滤后渲染 Markdown HTML，配合 `.markdown-body` 样式展现丰富的标题、代码块、列表与表格。

### [2026-08-20] "思考过程"弹窗上下文全维度增强、Prompt与回复完整展示及Token/思考方式升级
- **变更原因**：满足"思考过程"弹窗全维度上下文展示、问答上下文 ID 分类保存、完整 Prompt 与模型回复展示、思考方式标签 (CoT/ReACT) 保留与移除 Canvas 图，以及输入/输出 Token 分别展示的需求。
- **功能变更**：
  1. **全维度上下文环境展示 (ThinkingContext.vue)**：展示完整的上下文类型：① 会话内：基于时间线的信息 或 引用的消息（二选一）；② 会话内：钉住的消息；③ 全系统：语义相似消息；④ 全系统：标签相关性消息；⑤ 全系统：关键词相关消息；⑥ 会话内：随机消息（受配置中心 `random_max_percent` 上限约束，默认 ≤20%）。
  2. **问答上下文 ID 列表分类保存**：`InfoCoreService.ts` 与 `ContextInfoOutput` 输出 `category_ids` 映射表，保存并透传一次问答按选择方式（timeline, citing, pinned, similarity, tag_relative, keyword, random）分类的消息 ID 列表；并在弹窗 Context 区提供可视化分类 ID 列表。
  3. **完整 Prompt 与 模型完整回复 (ThinkingBlock.vue)**：Agent 展示区块中新增完整 Prompt 区域（提供一键复制与字符统计）与 LLM 模型完整回复区域。
  4. **思考方式标签与 Canvas 优化**：移除 `CanvasReActFlow` 图形渲染，顶部标栏保留思考方式标签（如 `CoT`、`ReACT`）。
  5. **Token 用量分别展示**：顶部与用量面板中分别展示 `输入 Token` 和 `输出 Token`（如 `输入: 120 | 输出: 45 (共 165)`）。
- **行为差异**：
  - 修改前：上下文仅展示部分引用/画像；思考块展示 CanvasReActFlow 图；Token 仅显示总数。
  - 修改后：上下文全维度精准分类并显示 ID 列表；单独展示 Prompt 和完整回复；显示 CoT/ReACT 思考方式标签并移除 Canvas 图；Token 拆分展示输入与输出。

### [2026-08-20] "思考过程"弹窗独立模块加载与动态加载态升级
- **变更原因**：解决打开思考过程弹窗时展示静态"暂无思考过程"空白弹窗的问题，实现弹窗内各模块（上下文、DAG编排、Agent节点输出）独立按需加载，提升响应速度与交互体验。
- **功能变更**：
  1. **"正在加载思考过程..."动态加载态**：`session.ts` 新增 `thinkingLoading`、`dagLoading`、`blocksLoading` 状态；`ThinkingModal.vue` 弹窗打开时显示标题与居中动画"正在加载思考过程..."，避免静态空白或"暂无思考过程"提示。
  2. **模块独立并发加载**：`dev-server.ts` 的 `/api/chat/thinking` 端点支持 `module=dag` / `module=blocks` / `module=all` 参数；`ChatArea.vue` 与 `ChatMap.vue` 并发调用 DAG 与 Blocks 模块接口，实现 DAG 编排图与 Agent 节点输出独立更新展示。
  3. **模块级 Skeleton/加载骨架屏**：`ThinkingModal.vue` 为 DAG 模块与 Agent 节点输出模块分别提供独立的 Loading 骨架提示，各模块数据就绪后即刻渲染展示。
- **行为差异**：
  - 修改前：弹窗打开时同步等待整包数据，数据未返回时展示静态"暂无思考过程"；
  - 修改后：弹窗打开即展示"正在加载思考过程..."，各模块独立加载并渐进式渲染。

### [2026-08-19] 思考过程弹窗与 ChatMap/对话区消息框结构统一
- **变更原因**：用户需要点击「思考过程」按钮以弹窗形式查看 Agent 思考过程；同时要求 ChatMap 区与对话区消息框结构一致，仅默认展开态不同（ChatMap 默认展示摘要折叠详情，对话区默认展示详情折叠摘要）。
- **功能变更**：
  1. **思考过程按钮**：`MessageCard.vue` 底部栏新增带文字标签的「思考过程」按钮（紫色胶囊 + 大脑图标），点击后先调用 `GET /api/chat/thinking` 采集指定消息对应 Work 的 Agent 执行轨迹，再打开 `ThinkingModal.vue` 弹窗展示（流式期间 target 为空时实时展示当前流式思考块，`done`/`error` 自动关闭）。
  2. **消息框结构统一**：`MessageCard.vue` 内容区重构为「摘要 + 详情」双区统一结构（顶部栏 / 摘要区 / 详情区 / 底部栏两区完全一致）：
     - ChatMap（`mode=map`）：默认展开摘要、折叠「原文」详情；
     - 对话区（`mode=timeline`）：默认展开详情（Markdown 全文）、折叠「摘要」，无摘要数据时不渲染摘要区。
  3. **对话区摘要数据来源**：`ChatArea.vue` 为对话区消息卡传递 `summary`，取自 ChatMap 节点（`info_summary`），保证两区摘要一致。
- **行为差异**：
  - 修改前：思考过程仅大脑图标按钮（无文字），且对话区消息框不展示摘要、仅有全文。
  - 修改后：按钮明确标注「思考过程」，对话区消息框新增可折叠摘要区，与 ChatMap 结构一致，仅默认展开态不同。
- **新增边界条件**：反查不到 work_id 或采集失败时弹窗展示「暂无思考过程」空态；对话区无摘要数据时不渲染折叠摘要区。

### [2026-08-19] "思考过程"弹窗重构：独立 Agent 思考中状态 + Canvas 式 DAG 展示
- **变更原因**：原弹窗按"Planning 拆解 + 思考块"展示，未按 上下文→TaskDAG→AgentDAG→工作 Agent→Writer 的顺序组织；各 Agent "思考中"状态不独立（依赖整块 streaming 标志）；AgentDAG 无执行状态着色，也无法与下方 Agent 执行联动。
- **功能变更**：
  1. **每个 Agent 独立的"思考中"状态**：`session.ts` 新增 `agentExecutions`（key=agent_id 的运行时状态表）与 `setAgentStatus/resetAgentStatus`；`ChatArea.vue` 在 `agent_building/agent_built`、`agent_thinking`、`agent_reflection` 置为 RUNNING（思考中/黄色），`agent_output` 置为 SUCCESS（成功/绿色）并回填 `tokenUsage`/`durationMs`，`agent_error`/`error` 置为 ERROR（失败/红色）。`ThinkingBlock.vue` 标题栏展示独立状态徽标（思考中/已完成/执行失败）。
  2. **整体"思考中"状态**：`ThinkingModal.vue` 顶部若任一 Agent 处于 RUNNING 或存在流式思考块则整体显示"思考中..."。
  3. **展示顺序重构**：`ThinkingModal.vue` 按 ① 上下文 `ThinkingContext.vue`（聚合用户画像/引用历史/最近工作/记忆知识/策略）→ ② TaskDAG Canvas 图 `TaskDagFlow.vue`（分层 DAG + 依赖箭头）→ ③ AgentDAG Canvas 图 `AgentDagFlow.vue`（Agent 名称 + 状态着色 + 点击定位下方对应 Agent）→ ④ 工作 Agent（每个独立展示 CoT/ReAct Canvas、Prompt、模型输出、Token 用量与耗时）→ ⑤ Writer Agent 的顺序展示。
  4. **AgentDAG 与 Agent 执行联动**：`AgentDagFlow.vue` 重写为分层 DAG（`dagLayout.ts` 最长路径分层布局），节点未执行灰色 / 执行中黄色 / 成功绿色 / 失败红色，含图例；点击节点触发 `focusAgent` 滚动并高亮下方对应 Agent 卡片（`agent-focus-ring`）。
  5. **后端 Agent 执行完成事件**：`OrchestrationExecutionService.execSingleAgent` 在成功/失败时推送 `agent_output` / `agent_error` SSE 事件（含 `agent_id`、`answer`、`elapsed_ms`、`token_usage`），使流式期间 AgentDAG 能实时由黄转绿/红；`dev-server.ts` DI 装配 `streamAccess` 传入。
  6. **历史 AgentDAG 状态回填**：`dev-server.ts` 的 `buildThinkingBlocksAndDag` 按 `orchestration_agent_execution.status` 回填 DAG 节点状态（COMPLETED 成功 / EXEC_FAILED 失败 / CANCELLED·PENDING 未执行），历史任务重看时 AgentDAG 颜色准确。
- **行为差异**：
  - 修改前：弹窗为"Planning 拆解（列表式 Task DAG + 链式 AgentDAG）+ 思考块"；Agent "思考中"依赖整块 streaming 标志（不独立）；AgentDAG 无执行状态与联动。
  - 修改后：弹窗严格按 上下文 → TaskDAG → AgentDAG → 工作 Agent → Writer 顺序展示；每个 Agent 独立"思考中"状态；AgentDAG 为 Canvas 式分层图并实时状态着色、可点击联动下方 Agent。
- **新增边界条件**：无 AgentDAG/TaskDAG 数据（Simple 策略）时仅展示上下文 + 工作 Agent；AgentDAG 节点点击但下方无对应 Agent 卡片时无副作用；`agent_output` 事件缺失（旧后端）时 Agent 保持 RUNNING 直至 `done`。

### [2026-08-18] Agent 思考过程、上下文与输入输出完整展示升级
- **变更原因**：针对原本“思考过程信息不全，未展示上下文及各个 Agent 输入输出”的问题进行全链路重构。
- **功能变更**：
  1. **ThinkingBlock.vue 重构**：新增 Agent 身份规范标签（LLM 模型 ID、Soul 品格、技能/MCP 工具数），新增 Tab 导航与分块结构，支持展示 Agent 上下文 Context (用户画像/引用消息)、任务输入 Input、步骤步骤 (Think 推理 / Act 工具调用及参数结果 / Reflect 自我反思与通过结论) 以及节点输出 Output。
  2. **SSE 流式解析增强**：`ChatArea.vue` 在对话流推进中，完整解析并归集 `context_built`, `agent_building`, `agent_built`, `agent_thinking`, `agent_action`, `agent_reflection`, `agent_output` 等事件。
  3. **历史会话恢复**：后端 `/api/chat/history` 在查询会话记录时，从 `orchestration_agent_execution` 及 `agent_execution_trace` 聚合各 Work 的 Agent 执行轨迹，为回答组装对应的 ThinkingBlocks，前端 `sessionStore.ts` 载入会话时自动恢复，实现刷新页面后思考过程与上下文不丢失。
  4. **Agent 相似度匹配算法升级**：重构 `simpleSimilarity` 为 Bigram + 中文字符级 Jaccard 算法（包含去标点归一化与领域隔离），彻底解决相同或相似提问下因传统空格切词失效而无法复用 Agent 的问题。
  5. **思考 Blocks 严格时间序**：重构 `ChatArea.vue` 时间线排序，确保多 Agent 思考块严格按 `createdAt` 升序及消息角色优先关系无倒置呈现。