# IntentAgent (意图理解 Agent)

## 1. 设计目标

1. 负责对用户的最新输入、历史沟通对话、固定钉住信息（Pinned Info）以及引用的特定消息进行深度分析与意图推断；
2. 准确归算并生成结构化的"理解需求"（understood_requirement），该需求必须是**可直接交付执行 Agent 的明确具体任务描述**（含目标、范围与产出形式），而非分析结论；
3. 计算原始用户输入与推理需求的匹配度分数（match_score，0-100），当匹配分数低于设定阈值（默认为 80）时标识 `should_modify_query = true`，用于指导下游编排策略（如改写或追问）；
4. 作为系统级内置内置 Agent 之一（与 PlannerAgent、WriterAgent、EvolutorAgent、SummaryAgent 并列）。

## 1.1. 需求理解质量要求（2026-08-24 新增）

`understood_requirement` 必须满足以下质量要求，避免确认弹窗形同虚设：

- **可执行性**：是可直接执行的任务描述，禁止出现「可能」「尚不明确」「需进一步确认」等模糊表述；
- **完整性**：包含目标、范围与产出形式。例如输入「研究 Agent」应改写为「请全面调研 AI Agent 的定义、核心架构、主流框架、应用场景与前沿挑战，输出一份结构化的技术研究报告」；
- **评分一致性**：当用户输入极度模糊且无上下文可推断出具体任务时，`match_score` 应显著低于阈值；当输入虽简短但可合理推断出完整任务时，给出较高 `match_score` 并输出具体任务描述。

## 2. 功能设计

### 2.1. 需求理解与匹配评估（understandRequirement）

**功能**：分析用户提问及相关上下文，提炼核心需求并评估理解匹配度
**入参**：
- `input`: `UnderstandRequirementInput`
  - `session_id`: 会话 ID（必填）
  - `user_query`: 原始用户提问（必填）
  - `citing_msg_ids`: 引用消息 ID 列表（可选）
  - `selected_msg_ids`: 选择/钉住消息 ID 列表（可选）
  - `interact_id`: 交互 ID（可选）
- `context`: `IntentAgentContext`（继承 Context）
- `output`: `UnderstandRequirementOutput`
  - `understood_requirement`: 提炼并重构后的明确意图描述
  - `match_score`: 匹配打分（0-100）
  - `reasoning`: 匹配打分与需求推断推导分析
  - `should_modify_query`: 是否建议优化/改写用户 Query（当 `match_score < threshold_score` 时为 `true`）
  - `threshold_score`: 阈值设定（默认 80）
  - `prompt`: PromptProvider 渲染返回的完整 Prompt（供"思考过程"弹窗展示）
  - `input_tokens`: 本次 LLM 调用的输入 Token 数
  - `output_tokens`: 本次 LLM 调用的输出 Token 数

**处理流程**：
1. 校验入参 `session_id` 与 `user_query` 非空；
2. 从 InfoCore 中装载关联会话的最近历史对话以及用户选定/引用的消息内容；
3. 使用系统内置的 `INTENT_SOUL`（"内置需求理解与意图比对专家"）并结合 PromptCatalog / LLMCore 构造 prompt（历史上下文 / 钉住信息 / 引用消息在为空时不传入占位文案，由模板 `{{#if}}` 条件块整块隐藏对应维度）；
4. 调用 LLM 进行需求意图提取与匹配评分，解析 JSON 结构化输出；
5. 将 `understood_requirement`、`match_score`、`reasoning`、`should_modify_query` 填充至 `output` 返回。

## 3. 系统集成与关联

- **OrchestrationEntry / JSONNode**：在 Simple / Planning 编排策略准备阶段可选触发 IntentAgent 对模糊或复杂提问进行意图推算；
- **System Agents 预装载**：系统启动时通过 dev-server 在 AgentLibrary 中自动预先注册/建立 IntentAgent 关联。

## 4. 变更记录

### [2026-08-22] 空消息类型不再渲染维度与占位文案

**变更原因**：无历史上下文 / 无钉住信息 / 无引用消息时，Prompt 仍渲染对应维度标题与「（无历史上下文）/（无固定钉住信息）/（无显式引用消息）」占位文案。

**修改的方法**：
- `IntentAgentService.understandRequirement()` — 原始代码为 `historyText || '（无历史上下文）'` 等兜底文案；改为直接传空字符串 `historyText` / `pinnedText` / `citingText`，由 PromptCatalog `builtin.intent_understanding` 的 `{{#if}}` 条件块整块隐藏空维度。

**影响的端点**：
- `POST /api/chat/stream` 中 IntentAgent 的 Prompt 组装（「思考过程」弹窗展示的 Prompt）。

**可能存在的问题**：
- 依赖 PromptsProvider 与 PromptCatalog 的 `{{#if}}` 条件块渲染能力（已同步实现）。

### [2026-08-24] 需求理解改写为可执行任务描述 + 确认流程前后端同步替换

**变更原因**：IntentAgent 输出的 `understood_requirement` 仍带「具体研究方向不明确」等模糊表述，导致需求确认 APPROVE 后 Planner 仍拆出「明确方向」类元任务，确认弹窗形同虚设；且 APPROVE 后仅本地替换用户消息，后端 info_raw 未同步。

**修改的方法**：
- `PromptCatalog builtin.intent_understanding` — 要求 `understood_requirement` 改写为可直接交付执行 Agent 的任务描述（禁止模糊表述），并补充关键规则。
- `IntentAgentService INTENT_SOUL_CONTENT` — 更新为「将模糊或不完整的用户需求改写为明确、具体、可直接交付执行 Agent 的任务描述」。

**影响的端点**：
- `POST /api/chat/stream` 与 `POST /api/chat/confirm-intent`（需求理解与确认流程）。

**可能存在的问题**：
- LLM 输出质量依赖模型能力；若模型未按规则输出可执行任务，`match_score` 仍会偏低触发确认弹窗，形成兜底。
