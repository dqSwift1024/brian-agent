# PromptCatalog (内置提示词目录)

## 1. 设计目标

1. 作为全系统内置 Prompt 模板的唯一真相源（Single Source of Truth），避免分散在各个 Agent/Core 代码中的硬编码 Prompt 模版；
2. 定义全系统统一的稳定 ID 机制（如 `builtin.think`, `builtin.intent_understanding`, `strategy_selector_prompt` 等）；
3. 自动同步/seed 播种内置 Prompt 模板至数据库表 `prompt_template`，并提供内存兜底渲染器 `renderTemplate`；
4. 规范跨模块变量命名（如 `task_content`, `context_data`, `user_query`, `recent_history`, `pinned_info`, `citing_messages` 等）。

## 2. 功能设计

### 2.1. 目录定义与稳定 ID 管理

已注册内置 Prompt 包含但不限于：
- `builtin.think`：Worker Think 阶段思考 Prompt
- `builtin.reflect`：Worker Reflect 阶段反思 Prompt
- `builtin.answer`：Worker Answer 阶段回答 Prompt
- `builtin.writer`：WriterAgent 结果汇总 Prompt
- `builtin.planner`：PlannerAgent 任务拆解 Prompt
- `builtin.eval_work`：EvolutorAgent WorkAgent 评估 Prompt
- `builtin.eval_write`：EvolutorAgent WriterAgent 评估 Prompt
- `builtin.agent_match`：AgentLibrary 第二层 LLM 匹配评估 Prompt
- `builtin.skill_match`：SkillCore 匹配排序 Prompt
- `builtin.mcp_match`：MCPCore 推荐 Prompt
- `builtin.llm_match` / `builtin.soul_match`：模型/角色匹配 Prompt
- `strategy_selector_prompt`：编排策略选择 Prompt
- `builtin.summary`：摘要生成 Prompt
- `builtin.intent_understanding`：IntentAgent 需求理解与意图比对 Prompt
- `builtin.llm_attr_gen`：LLMProvider 一键补全模型属性（生成简介与模型用途）Prompt

### 2.2. 种子数据播种（seed）

**功能**：初始化时将所有内置 Prompt 定义写入 `prompt_template` 表
**流程**：
1. 遍历 `BUILTIN_PROMPTS` 列表；
2. 检查 `prompt_template` 表中是否存在该稳定 ID；
3. 若不存在，插入模板元数据；若存在，依据最新版本定义更新模板与变量列表。

### 2.3. 内存渲染与变量替换（renderTemplate）

**功能**：以 `{{variable}}` 方式替换 Prompt 模板中的占位变量。若变量不存在，自动替换为空字符串，保障模型渲染不崩溃。额外支持 `{{#if var}}...{{/if}}` 条件块：当 `var` 为空（undefined / null / 空白字符串）时整块移除（经 `stripEmptyConditionalBlocks`），供空消息类型按需隐藏维度小节。

## 3. 关联影响

- **PromptsProvider**：将 PromptCatalog 作为底层模板库支撑；
- **Agent / Core / Orchestration 层**：所有 Prompt 模版调用统一使用 `PROMPT_IDS`，彻底解耦提示词硬编码。

## 4. 变更记录

### [2026-08-22] 模板条件渲染与任务内容注入

**变更原因**：
1. `builtin.intent_understanding` 无条件渲染 4 个维度，空消息类型产生冗余标题与占位文案；
2. `builtin.think` / `builtin.reflect` 模板缺少任务内容，且 `context_data` 曾混入 `task_content` 导致重复。

**修改的方法**：
- `builtin.intent_understanding` — 4 个维度改为「维度 1（用户输入）+ `{{#if}}` 包裹的维度 2/3/4」，空类型不再显示；
- `builtin.think` / `builtin.reflect` — 新增 `Task: {{task_content}}` 行，变量列表增加 `task_content`；
- `renderTemplate` / 新增 `stripEmptyConditionalBlocks` — 支持 `{{#if}}` 条件块。

**影响的端点**：
- 所有经 `renderTemplate`（DB 未就绪兜底）或 `execPrompt` 渲染的 Prompt。
