# IntentAgent (意图理解 Agent)

## 1. 设计目标

1. 负责对用户的最新输入、历史沟通对话、固定钉住信息（Pinned Info）以及引用的特定消息进行深度分析与意图推断；
2. 准确归算并生成结构化的"理解需求"（understood_requirement）；
3. 计算原始用户输入与推理需求的匹配度分数（match_score，0-100），当匹配分数低于设定阈值（默认为 80）时标识 `should_modify_query = true`，用于指导下游编排策略（如改写或追问）；
4. 作为系统级内置内置 Agent 之一（与 PlannerAgent、WriterAgent、EvolutorAgent、SummaryAgent 并列）。

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
3. 使用系统内置的 `INTENT_SOUL`（"内置需求理解与意图比对专家"）并结合 PromptCatalog / LLMCore 构造 prompt；
4. 调用 LLM 进行需求意图提取与匹配评分，解析 JSON 结构化输出；
5. 将 `understood_requirement`、`match_score`、`reasoning`、`should_modify_query` 填充至 `output` 返回。

## 3. 系统集成与关联

- **OrchestrationEntry / JSONNode**：在 Simple / Planning 编排策略准备阶段可选触发 IntentAgent 对模糊或复杂提问进行意图推算；
- **System Agents 预装载**：系统启动时通过 dev-server 在 AgentLibrary 中自动预先注册/建立 IntentAgent 关联。
