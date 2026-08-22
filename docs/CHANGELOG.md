# 代码变更记录 (CHANGELOG)

## [2026-08-22] 模型启用状态布尔化与保存误禁用修复

**变更原因**：
1. `PUT /api/config/model/:id` 无条件执行 `enable = (data.enable ?? data.enabled) ? 1 : 0`，前端保存模型时未携带 `enable`，导致每次编辑模型（如"一键补全"后保存）都会把 `llm_available.enable` 静默重置为 0，默认模型被误禁用，后续对话报 `LLM xxx 已禁用`；
2. 前端模型卡片对默认模型只显示"默认"角标、不显示启停状态，且无启停开关，用户无法发现也无法恢复；
3. 模型启用状态以字符串 `status: 'active'/'inactive'` 表达，语义不统一。

**修改的方法与模块**：
- `dev-server.ts` — `GET /api/config/model` 与 `GET /api/config/model/:id` 返回布尔 `enable`（替代 `status` 字符串）；`PUT /api/config/model/:id` 改为部分更新语义，仅当显式携带 `enable`/`enabled` 时更新启用状态，否则保留原值；
- 前端 `api/types.ts` — `ModelInfo.status` 改为 `enable: boolean`；
- 前端 `ConfigView.vue` — `BackendModel` 用 `enable?: boolean`；`submitModelForm` 保存时携带 `enable`；新增 `handleToggleModel`，模型卡片增加启用/停用 toggle 开关与状态圆点（默认模型也展示）。

**影响的端点**：
- `GET /api/config/model` / `GET /api/config/model/:id` — 返回结构由 `status` 改为 `enable`；
- `PUT /api/config/model/:id` — 未传 `enable` 时不再修改启用状态；
- 前端配置页 `/config` 模型管理视图。

**可能存在的问题/风险点**：
- `enable` 布尔化后，若存在依赖旧 `status` 字符串的前端/第三方消费方需同步（已全局排查，仅模型卡片使用，已改）；
- 存量数据中已误禁用的模型需手动重新启用（本次已恢复默认模型 `deepseek-v4-flash-260425`）。

## [2026-08-22] 思考过程 Prompt 去重与空维度渲染修复

**变更原因**：
1. 「需求理解 Agent」输入 Prompt 在无某类消息时仍渲染该维度标题与「（无历史上下文）/（无固定钉住信息）/（无显式引用消息）」等占位文案；
2. 「general-专业编码与研究助手」等 WorkAgent 的输入 Prompt 中 `<时间线消息>` 包含了本次问答输入（与 `task_content` 重复）；
3. `</上下文信息>` 标签之后额外拼接了原始任务内容，出现「什么是 AI]]>」等异常重复内容；
4. 「模型的完整回复 (LLM Response)」在取不到 raw_response 时回退到了用户输入（content/inputQuery）。

**修改的方法与模块**：
- `PromptsService.execPrompt` / `PromptCatalog.renderTemplate` — 新增 `{{#if var}}...{{/if}}` 条件块渲染（空变量整块移除），并新增 `stripEmptyConditionalBlocks` 共用函数；
- `PromptCatalog` — `intentUnderstanding` 模板改用 `{{#if}}` 条件块包裹可选维度；`think`/`reflect` 模板新增 `Task: {{task_content}}` 行；
- `IntentAgentService.understandRequirement` — 空消息类型不再传占位文案，改为空字符串；
- `InfoCoreProvider.context` — 时间线最新一条消息拆出为 `CURRENT` 类型（新增 `CollectionSource.CURRENT`），不再进入时间线/弱相关维度；`ContextInfoCategories`/`category_ids`/`sources_summary` 增加 `current` 字段；
- `AgentExecutionService.execAgent` / `think` / `reflect` — `context_data` 不再拼接 `task_content`，任务内容经 `task_content` 变量单独注入 Think/Reflect/Answer；
- `dev-server.buildThinkingBlocksAndDag` — `fullRawResponse` 回退仅允许 `outputAnswer`，禁止回退到 content/inputQuery；
- 前端 `ThinkingBlock.vue` — 「模型的完整回复」不再回退到 `block.content`。

**影响的端点**：
- `POST /api/chat/stream` — WorkAgent 各阶段 Prompt 不再重复携带本次输入；
- `GET /api/chat/thinking` — 「模型的完整回复」不再误显示为用户输入；
- 后端 InfoCore `context` 相关调用（`buildWorkContext` / `execAgent` 内部）。

**可能存在的问题/风险点**：
- `think`/`reflect` 模板新增 `task_content` 依赖，需确保 `ThinkInput`/`ReflectInput` 均传入 `task_content`（已同步）；
- `CURRENT` 为新增 CollectionSource 枚举值，老数据 `info_context_source` 表中无该来源，属正常（历史记录不受影响）。

## [2026-08-20] 系统核心功能增强与模版编排重构

**变更原因**：
1. 增强意图理解与问答上下文匹配度评估，新增 IntentAgent 模块与 Base 层 PromptCatalog 单一真相源；
2. 优化会话标题生成逻辑（自动截断首条消息前 50 字）与新增手动修改标题接口；
3. 升级 Planning / Simple 编排策略的思考过程展示（ThinkingModal），将 DAG 重构并抽离至弹窗视图，提升主对话区视觉体验；
4. 修复 WriterAgent 结果字段映射问题以及 AgentDAG 构建中跨 Plan 复用 Agent 的唯一索引冲突 Bug；
5. 调整配置划分，将 Agent 重新评估概率配置 `regen_rate` 归属由 `agent_builder` 统一迁移至 `agent_library`。

**修改的方法与模块**：
- `IntentAgentService.understandRequirement` — 新增内置意图识别 Agent；
- `PromptCatalog` — Base 层新增集中式 Prompt 模版管理 Catalog 与稳定 ID 注册机制；
- `ChatService.updateSessionTitle` — 支持手动修改会话标题与首条消息自动提取生成；
- `OrchestrationExecutionService` & `JSONNodeService` — 优化 Agent 复用、思考过程透传与 DAG 节点映射；
- `WriterAgentService` — 修复结果映射与格式化流程。

**影响的端点**：
- `POST /api/chat/session/title` — 修改会话标题端点；
- `POST /api/chat/stream` — 增强 SSE 事件与 Thinking 思考过程流；
- `GET /api/chat/thinking` — 获取思考过程与 DAG 数据；
- `POST /api/config/update` — 配置更新路由及属性归属。

**可能存在的问题/风险点**：
- 高并发复杂任务场景下，多 Agent 级联推理耗时仍受 LLM 响应速度影响，已提高默认 DAG 超时配置进行防护。
