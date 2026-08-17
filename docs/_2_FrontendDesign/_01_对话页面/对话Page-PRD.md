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

-   **渲染引擎**：基于 DOM + SVG 渲染，支持富交互（复选框、展开列表、钉住开关）。
-   **排布算法**：
    -   时间 → 纵向布局（Y 轴递增，问答按时间从上到下）
    -   引用关系 → 横向布局（X 轴偏移，被引用消息位于引用消息右侧）
    -   连线：横平竖直的正交连线；回复关系为「箭头向下」，引用关系为「从左指向右」，通过连线方向与节点位置反映关系。
-   **节点内容**（与右侧对话列表内容一致）：消息产生时间、消息摘要、消息原文（默认折叠）、消息引用消息数量（胶囊内数字，点击展开引用消息摘要列表，可跳转到指定消息）、消息被引用消息数量（胶囊内数字，点击展开被引用消息摘要列表，可跳转）、钉住/解开钉住开关（右上角）、复选框（引用模式选择消息进行问答，问答完成后自动撤销）、消息长度。
-   **交互能力**：
    -   画布：支持 Pan (拖拽平移) + Zoom (滚轮缩放)。
    -   节点点击：右侧对话列表滚动定位到对应消息并居中；对话列表点击消息：ChatMap 平移使对应节点居中。
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
| ThinkingChain | Agent 思考过程、规划步骤 | 默认折叠，仅显示摘要+时长；流式生成中显示活动指示器；展开后自动滚入可视区 |
| ToolInvocation | 工具调用、API 请求 | 卡片式展示工具名+参数摘要+状态；加载中显示骨架屏；完成后支持展开详情 |
| ArtifactPreview | 生成的图表、文档、图片 | 带边框卡片+缩略图；资源加载中显示占位符；点击触发外部预览回调 |
| ErrorFallback | 生成失败、接口异常 | 警示样式+友好文案；Hover 显示原始错误码；支持重试按钮（若上游提供回调） |
| Unsupported | 未注册类型、数据异常 | 虚线边框+“不支持的内容类型”标签；开发环境可切换查看原始 JSON |

#### 4.3.5 流式协议与 Block 映射

| SSE Event | Block 操作 | 说明 |
| :--- | :--- | :--- |
| `loading` | Insert(StatusBlock, state=loading) | 插入加载状态块，后续被实际内容块替换 |
| `agent_thinking` | Append(ThinkingChainBlock, content) | 向思维链块追加内容，触发折叠态活动指示器 |
| `agent_created` | Update(ThinkingChainBlock, meta.agent_info) | 更新思维链块的 Agent 名称与类型元数据 |
| `agent_status` | Update(ToolInvocationBlock, status) | 更新工具调用块的执行状态（running/success/error） |
| `agent_output` | Insert/Append(ArtifactPreviewBlock) | 插入或更新产物预览块 |
| `text` | Append(TextParagraphBlock, delta) | 向文本块追加增量内容，经帧率缓冲后渲染 |
| `citation` | Update(TextParagraphBlock, meta.citing_ids) | 更新文本块的引用关系元数据，触发引用标签条重渲染 |
| `done` | Finalize(BlockGroup) | 标记当前消息组所有 Block 为完成态，移除光标与加载指示器，启用反馈组件 |

#### 4.3.6 块级交互与反馈
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
    -   搜索：调用 `searchSession(keyword)`，支持模糊匹配。
    -   新建：调用 `createSession()`，成功后自动切换并关闭面板。
    -   删除：单条删除或批量勾选删除，需二次确认。
-   **溢出保护**：切换会话前调用 `checkSessionOverflow()`，超限则 Toast 提示并阻断操作。
-   **会话切换清理**：切换会话时，清空当前 Block 列表并重新初始化流解析器，避免跨会话 Block 状态污染。
-   **刷新恢复**：页面挂载（onMounted）时，若 localStorage 存在当前会话 ID，自动调用 `getChatHistory` / `getAgentChain` / `loadExchanges` 恢复历史消息与 ChatMap，刷新后不丢失对话。

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