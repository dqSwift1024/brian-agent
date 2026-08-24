# Planner Agent

## 1. 设计目标

1. 识别复杂任务，将复杂任务拆分为多个有依赖关系的子任务；
2. 构建子任务之间的 DAG（有向无环图）依赖关系；
3. 负责将拆分后的任务 DAG 交给上层编排框架，由编排框架调度 Agent DAG 执行；
4. 自己不执行子任务，仅负责任务规划。

## 2. 功能设计

### 2.1. 规划（plan）

**功能**：分析任务内容，将其拆解为子任务并建立 DAG 依赖关系
**入参**：
- input：PlanInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：任务内容
- context：PlanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：PlanOutput（继承 Output），承载返回内容：
  - plan_id：规划 ID
  - task_dag：任务 DAG，包含 nodes（子任务列表）和 edges（依赖关系列表）

**DAG 数据结构**：
```json
{
  "plan_id": "uuid",
  "total_task_count": 3,
  "nodes": [
    {
      "task_id": "uuid",
      "parent_task_id": "",
      "task_content": "汇总：整合子任务结果输出研究报告",
      "task_complexity": 30,
      "task_domain": "report",
      "priority": 1,
      "dependencies": ["task_id_2", "task_id_3"]
    },
    {
      "task_id": "task_id_2",
      "parent_task_id": "task_id_1",
      "task_content": "子任务：查询用户数据",
      "task_complexity": 25,
      "task_domain": "data_query",
      "priority": 2,
      "dependencies": []
    }
  ],
  "edges": [
    { "from_task_id": "task_id_2", "to_task_id": "task_id_1" }
  ]
}
```

> **层级语义（2026-08-24 新增）**：
> - `parent_task_id` 表达「拆解方向」（父任务拆出子任务），根任务为空字符串；
> - `dependencies` 表达「执行依赖」（执行前必须先完成的子任务 task_id），叶子任务为空数组；
> - `edges` 表达「执行方向」：`from_task_id` 为子任务（先执行），`to_task_id` 为父任务（等所有子任务完成后汇总执行）；
> - 叶子任务由 WorkAgent 直接执行；父任务等待所有子任务完成后，结合任务目标与子任务结果汇总产出父任务结果。TaskDAG 的层级（`parent_task_id`）与 AgentDAG 的执行边方向相反。

**处理流程**：

1. **获取 PlannerAgent 实例**
   a. 调用 AgentBuilder.buildPlannerAgent 获取 agent_id（若无则新建）；
   b. 调用 AgentLibrary.getAgent(agent_id) 获取 PlannerAgent 的完整配置（llm_id、soul_id 等）；

2. **复杂度判定**
   a. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取 `complexity_decompose_threshold`（默认 50）；
   b. 调用 LLMProvider.execLLM 使用简单 prompt 快速评估 task_content 的复杂度（0-100）；
   c. 若复杂度 < complexity_decompose_threshold：返回单节点 DAG（nodes 仅含 1 个原任务），直接返回 — 无需拆分；

3. **任务拆解**
   a. 调用 AgentContext.buildAgentContext({ session_id }) 获取当前 session 的上下文（用于理解任务背景）；
   b. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取 `plan_prompt_template_id`；
   c. 调用 PromptsProvider.execPrompt 使用 `plan_prompt_template_id` 结合 `task_content` 和上下文构建拆分 prompt；
   d. 调用 LLMProvider.execLLM 生成任务拆解方案，要求输出 JSON 格式的 DAG（nodes + edges）；
   e. 校验 LLM 输出：DAG 无环（验证拓扑排序）、每个节点 task_id 唯一、dependencies 中的 task_id 全部存在于 nodes 中；
   f. 若校验失败：重试一次，仍失败则返回错误；

4. **生成 plan_id**
   a. 生成 `plan_id`（UUID）；
   b. 调用 RelationDBProvider.insertDB 将 DAG 结构保存到 `agent_plan` 表（`{ plan_id, work_id, interact_id, task_dag: JSON.stringify(dag) }`）；

5. **调用 InfoCore 保存规划结果**
   a. 调用 InfoCore.saveInfo 将规划结果（DAG 摘要）保存为 AGENT 角色的信息；

6. 将 plan_id 和 task_dag 写入 output 返回；

### 2.2. 层级规划（planHierarchical）

**功能**：在单次拆解的基础上，对仍复杂（`task_complexity >= complexity_decompose_threshold`）的叶子任务递归调用 LLM 继续拆解，直到所有叶子任务为「小任务」或达到最大深度，产出层级 TaskDAG。

**入参**：
- input：PlanHierarchicalInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：任务内容
  - max_depth：递归拆解最大深度（可选，默认 2）
- context：PlanContext（继承 Context），会话上下文
- output：PlanHierarchicalOutput（继承 Output），承载返回内容：
  - plan_id：规划 ID
  - task_dag：层级任务 DAG

**处理流程**：

1. 复用 `plan` 的拆解上下文（PlannerAgent 实例、配置、上下文、LLM 绑定）执行一次拆解，得到初始 DAG；
2. 递归遍历 DAG 节点：对无子任务且 `task_complexity >= threshold` 的叶子节点，调用 LLM 继续拆解（`llmPlan`，不落库）；当前节点转为父任务，其子任务挂载为新的叶子节点（task_id 重新生成避免冲突）；
3. 深度受 `max_depth` 限制，防止无限拆解；拆解结果落库（`agent_plan`）并返回。

### 2.3. 重新规划（replan）

**功能**：某个子任务执行失败后，对受影响的下游任务进行重新规划
**入参**：
- input：ReplanInput（继承 Input），包含以下字段：
  - plan_id：原规划 ID
  - failed_task_id：失败的子任务 ID
  - failure_reason：失败原因
  - completed_task_ids：已完成的任务 ID 列表
- context：ReplanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ReplanOutput（继承 Output），承载返回内容：
  - new_plan_id：新规划 ID
  - task_dag：调整后的 DAG（仅包含受影响的子任务）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `plan_id` 查询 `agent_plan` 表获取原 DAG；
2. 若原 plan 不存在，返回 false；
3. 在原 DAG 中定位 `failed_task_id`，收集其后继节点（所有依赖该节点的下游任务）及未完成的剩余任务；
4. 将剩余未完成的任务内容和失败原因提交给 PlannerAgent（复用 plan 中的 llm_id 和 soul_id），调用 LLM 重新规划；
5. 生成 `new_plan_id`（UUID），保存到 `agent_plan` 表（`parent_plan_id = plan_id`）；
6. 返回新的 plan_id 和调整后的 DAG 写入 output；

### 2.4. 获取规划（getPlan）

**功能**：查询规划的详细内容
**入参**：
- input：GetPlanInput（继承 Input），包含以下字段：
  - plan_id：规划 ID（可选）
  - work_id：工作 ID（可选）
- context：GetPlanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetPlanOutput（继承 Output），承载返回内容：
  - plans：规划列表，每项含 { plan_id, work_id, interact_id, task_dag, parent_plan_id, created }

**处理流程**：

1. 若 `plan_id` 非空：调用 RelationDBProvider.selectOneDB 查询 `agent_plan` 表；
2. 若 `work_id` 非空：调用 RelationDBProvider.selectDB 按 work_id 查询所有规划；
3. 将规划列表写入 output 返回；

### 2.5. 配置（configPlannerAgent）

**功能**：配置 PlannerAgent 的参数
**入参**：
- input：ConfigPlannerAgentInput（继承 Input），包含以下字段：
  - llm_id：指定规划使用的 LLM 模型 ID（可选，留空则由 LLMProvider 自动回退为系统默认模型或首个启用模型）
  - complexity_decompose_threshold：拆解复杂度阈值（可选，默认 50）
  - plan_prompt_template_id：规划 prompt 模板 ID（可选）
  - max_subtask_count：最大子任务数量（可选，默认 10）
- context：ConfigPlannerAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigPlannerAgentOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. llm_id：若非空则写入；若为空字符串则清空；
   b. complexity_decompose_threshold：校验为 0-100 整数；
   c. plan_prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
   d. max_subtask_count：校验为正整数；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Agent 规划表

- 表名：agent_plan
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 唯一索引 | |
| work_id | 工作 ID | UUID | N | 普通索引 | |
| interact_id | 交互 ID | UUID | N | | |
| task_dag | 任务 DAG | TEXT | N | | JSON 格式 |
| parent_plan_id | 父规划 ID | UUID | Y | | replan 时关联原规划 |

### 3.2. PlannerAgent 配置表

- 表名：planner_agent_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | 规划模型 ID | UUID | Y | | 留空时自动回退系统默认模型或可用首模型 |
| complexity_decompose_threshold | 拆解复杂度阈值 | INT | N | | 0-100，默认 50 |
| plan_prompt_template_id | 规划 prompt 模板 ID | UUID | N | | |
| max_subtask_count | 最大子任务数 | INT | N | | 默认 10 |

## 4. 变更记录

### [2026-08-24] 层级拆解与父任务汇总

**变更原因**：Planner 原产出扁平串行 DAG（如「研究 Agent」被拆为 7 个含「确认需求」「汇总报告」的串行任务），任务间无父子层级，父任务无法结合子任务结果汇总，且把「确认需求」类元任务当作同级任务执行。

**修改的方法**：
- `PlannerAgentService.plan()` — 重构抽取 `decomposeOnce` / `resolvePlannerAgent` / `buildPlanContext` / `resolvePlanLlmId` / `decomposeTask` / `persistPlan` 等私有方法，保持行为不变。
- 新增 `PlannerAgentService.planHierarchical()` — LLM 单次层级拆解后，对仍复杂的叶子任务递归调用 `llmPlan` 继续拆解（深度受限）。
- `PromptCatalog builtin.planner` — 要求输出层级 DAG（`parent_task_id` + `dependencies` + 执行方向 edges），禁止生成「确认需求」类元任务。
- `TaskNode/PlanTaskNode` — 新增 `parent_task_id` 字段；`AgentNode` 新增 `node_kind`（LEAF/PARENT）。
- `OrchestrationExecutionService.buildAgentDAG()` — 区分叶子/父节点（均构建 WorkAgent），`node_kind` 标记层级。
- `OrchestrationExecutionService.execDAG()` + `DagScheduler` — 父任务注入全部子任务结果摘要，父任务 Agent 结合任务目标与子任务结果汇总产出。

**影响的端点**：
- `POST /api/chat/stream`（PLANNING 策略 PLAN_WORK → 层级拆解 → BUILD_AGENT_DAG → EXEC_DAG）。

**可能存在的问题**：
- 递归拆解依赖 LLM 多次调用，耗时随层级增加；深度默认限制为 2。
- 历史扁平 DAG 数据无 `parent_task_id`，视为全部叶子任务（向后兼容）。

### [2026-08-24] 层级拆解粒度控制：深度守卫 + 全局子任务上限 + 去重

**变更原因**：`planHierarchical` 递归拆解存在两处缺陷——`decomposeLeaf` 的 `depth` 只递减从未校验（深度上限形同虚设），且无全局子任务数预算；叠加 LLM 反复产出语义重叠的「明确目标/范围/框架」类元任务，导致「研究 Agent」等模糊查询被拆得过细、产生大量重复子任务，单次问答耗时 7~12 分钟甚至卡死（EXECUTING 不收敛）。

**修改的方法**：
- `PlannerAgentService.planHierarchical()` — 初始拆解已达 `max_subtask_count` 上限时不再递归展开；展开后经 `dedupeDag` 去重、`limitDagSize` 收敛到 `maxSub`，最后按 `maxSub`（原 `maxSub*4`）校验。
- `PlannerAgentService.decomposeLeaf()` — 新增 `depth <= 0 || nodes.length >= maxSub` 双重守卫，终止无限递归与子任务爆炸。
- `PlannerAgentService.dedupeDag()`（新增）— 按分词 containment 相似度（阈值 0.7）合并重叠子任务，边与依赖引用重定向。
- `PlannerAgentService.limitDagSize()`（新增）— 超上限时按「复杂度越低越优先保留」裁剪，丢弃冗余父/汇总任务。
- `PromptCatalog builtin.planner` — 增加规则：子任务总数不得超 Max subtasks、子任务必须互斥且禁止重复/重叠。

**影响的端点**：
- `POST /api/chat/stream`（PLANNING 策略 PLAN_WORK → 层级拆解 → BUILD_AGENT_DAG → EXEC_DAG）— 子任务数硬性收敛到 `max_subtask_count`（默认 10），去除重复子任务，显著缩短执行耗时。

**可能存在的问题**：
- 去重为分词相似度启发式，极端语义相近但实为不同任务（如「调研A的定义」vs「调研A的评估」）依赖阈值取舍；阈值过紧可能误合并，可后续接入语义向量召回优化。
