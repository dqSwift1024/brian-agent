# Orchestration Execution

## 1. 设计目标

1. 将 PlannerAgent 产出的 Task DAG 转换为 Agent DAG（每个 task 节点分配一个 Agent）；
2. 实现 DAG 依赖解析与拓扑排序执行引擎，确保上游 Agent 完成后下游才开始执行；
3. 管理 Agent 执行结果的传递——上游 Agent 的输出作为下游 Agent 的输入上下文；
4. 支持同步和异步（通过 MQ）两种 DAG 执行模式；
5. 提供任务执行追踪和进度查询能力；
6. 支持 DAG 执行中的失败处理（单任务失败、重试、DAG 重排）。

## 2. 功能设计

### 2.1. 构建 Agent DAG（buildAgentDAG）

**功能**：将 PlannerAgent 产出的 Task DAG 转换为 Agent DAG，为每个 task 构建或复用 WorkAgent
**入参**：
- input：BuildAgentDAGInput（继承 Input），包含以下字段：
  - plan_id：规划 ID
  - task_dag：任务 DAG（PlannerAgent.plan 的产出）
  - interact_id：交互 ID
  - force_new：强制为每个 task 新建 Agent（可选，默认 false）
- context：BuildAgentDAGContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildAgentDAGOutput（继承 Output），承载返回内容：
  - agent_dag：Agent DAG，包含 agent_nodes 和 agent_edges
  - task_agent_map：task_id → agent_id 映射表

**Agent DAG 数据结构**：
```json
{
  "plan_id": "uuid",
  "total_agent_count": 3,
  "agent_nodes": [
    {
      "agent_id": "uuid",
      "task_id": "uuid",
      "parent_task_id": "",
      "task_content": "子任务1：查询用户数据",
      "task_complexity": 25,
      "task_domain": "data_query",
      "task_priority": 1,
      "status": "PENDING",
      "node_kind": "LEAF"
    },
    {
      "agent_id": "uuid",
      "task_id": "uuid",
      "parent_task_id": "task_uuid_1",
      "task_content": "汇总：整合子任务结果生成报告",
      "task_complexity": 60,
      "task_domain": "data_analysis",
      "task_priority": 2,
      "status": "PENDING",
      "node_kind": "PARENT"
    }
  ],
  "agent_edges": [
    {
      "from_task_id": "task_uuid_1",
      "to_task_id": "task_uuid_2",
      "from_agent_id": "agent_id_1",
      "to_agent_id": "agent_id_2",
      "data_dependency": "子任务输出作为父任务汇总输入"
    }
  ]
}
```

> **说明**：`agent_edges` 中的 `from_task_id` / `to_task_id` 是**执行拓扑的权威来源**（任务级依赖）。
> `from_agent_id` / `to_agent_id` 仅用于可视化展示。当一个 Agent 复用处理多个 task 时，
> 若仅保留 agent 级边，`task_1(agent A) → task_3(agent B) → task_4(agent A)` 这类链会被错误展开为
> agent 级环（A → B → A），导致 execDAG 无入度零节点、整图死锁。因此执行层必须以 task 级边计算拓扑。

> **层级语义（2026-08-24 新增）**：`parent_task_id` 表达拆解层级（父任务拆出子任务，根任务为空），
> `node_kind` 区分 `LEAF`（叶子任务，WorkAgent 直接执行）与 `PARENT`（父任务，等待所有子任务完成后结合子任务结果汇总产出）。
> AgentDAG 的执行边方向为「子任务 → 父任务」，与 TaskDAG 的拆解方向（`parent_task_id` 父 → 子）相反；叶子节点与父节点均构建 WorkAgent，父节点执行时注入其全部子任务结果摘要。

**处理流程**：

1. **入口校验**
   a. 校验 `task_dag.nodes` 非空，若为空则返回空 agent_dag（total_agent_count=0）；
   b. 校验 `task_dag.edges` 中所有 from_task_id / to_task_id 均存在于 nodes 中；

2. **遍历构建 Agent**
   a. 初始化 `agent_nodes = []`、`task_agent_map = {}`；
   b. 遍历 task_dag.nodes 中的每个 task_node：
      - 调用 RelationDBProvider.insertDB 向 `orchestration_task_agent` 表插入映射记录 `{ plan_id, task_id: task_node.task_id, agent_id: "" }`（agent_id 暂为空，构建后更新）；
      - 调用 AgentBuilder.buildAgent，传入 `{ interact_id, task_content: task_node.task_content, task_complexity: task_node.task_complexity, task_domain: task_node.task_domain, force_new }`；
      - 获取 agent_id；
      - 调用 RelationDBProvider.updateDB 更新 `orchestration_task_agent` 表记录中的 agent_id；
      - 将 `{ agent_id, task_id: task_node.task_id, task_content: task_node.task_content, task_complexity: task_node.task_complexity, task_domain: task_node.task_domain, task_priority: task_node.priority, status: "PENDING" }` 加入 agent_nodes；
      - 记录映射 `task_agent_map[task_node.task_id] = agent_id`；
   c. 若任一 Agent 构建失败，将当前 task_node 的 status 标记为 "BUILD_FAILED"，记录错误原因，继续构建下一个（不中断整个 DAG 构建）；

3. **转换依赖关系（task 级边与 agent 级边分离）**
   a. 初始化 `agent_edges = []`；
   b. 先查询当前 `plan_id` 已存在的 `orchestration_agent_dag` 边，构建 agent 级去重集合，防止同一 plan 重复落边；
   c. 遍历 task_dag.edges 中的每条边：
      - **执行层（task 级边，权威）**：忽略自环 task，按 `(from_task_id, to_task_id)` 去重后生成
        `{ from_task_id, to_task_id, from_agent_id, to_agent_id, data_dependency: "task_{from} → task_{to}" }` 加入 agent_edges；
      - **可视化层（agent 级边）**：根据 task_agent_map 映射 from/to agent_id，跳过无映射或自环
        `(from_agent_id === to_agent_id)` 或重复边，写入 `orchestration_agent_dag` 表 `{ plan_id, from_agent_id, to_agent_id }`；

4. **保存 Agent DAG**
   a. 将完整的 agent_dag JSON 调用 RelationDBProvider.insertDB 写入 `orchestration_agent_dag_record` 表：`{ plan_id, total_agent_count, agent_dag_json }`；
   b. 将 agent_dag 和 task_agent_map 写入 output 返回；

### 2.2. 执行单个 Agent（execSingleAgent）

**功能**：Simple 策略下执行单个 WorkAgent 的封装
**入参**：
- input：ExecSingleAgentInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - agent_id：Agent ID
  - task_content：任务内容
  - work_context：工作上下文数据（可选，用于丰富 Agent 执行的上下文）
- context：ExecSingleAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecSingleAgentOutput（继承 Output），承载返回内容：
  - answer：Agent 的输出答案
  - trace_id：执行追踪 ID
  - iterations：迭代次数
  - elapsed_ms：耗时

**处理流程**：

1. 调用 RelationDBProvider.insertDB 向 `orchestration_agent_execution` 表写入执行记录（execution_type: SINGLE）；
2. 构造 AgentExecution 执行参数：将 work_context 拼接到 task_content 前端作为增强的任务内容（若 work_context 存在）；
3. 调用 AgentExecution.execAgent，传入 `{ agent_id, work_id, interact_id, task_content }`；
4. 获取 answer、iterations、trace_id；
5. 调用 RelationDBProvider.updateDB 更新 `orchestration_agent_execution` 表记录（status=COMPLETED，answer，iterations，trace_id）；
6. 调用 AgentLibrary.recordAgentUsage 记录本次使用；
 7. 调用 InfoCore.saveInfo 保存 Agent 本次执行的任务与结果：`{ session_id, work_id, interact_id, info_type: "ACT", info_creator_role: "AGENT", info_creator_id: agent_id, info: "{ task_content } → { answer }" }`；
8. 将 answer、trace_id、iterations、elapsed_ms 写入 output 返回；

### 2.3. 执行 DAG（execDAG）

**功能**：按拓扑排序依次执行 Agent DAG 中的所有 Agent，管理依赖关系和数据传递
**入参**：
- input：ExecDAGInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - agent_dag：Agent DAG（含 agent_nodes 和 agent_edges）
  - work_context：工作上下文数据
  - max_concurrent：最大并发执行数（可选，默认 1——串行执行）
- context：ExecDAGContext（继承 Context），会话上下文（session_id, work_id 等）
- output：ExecDAGOutput（继承 Output），承载返回内容：
  - agent_results：所有 Agent 的执行结果列表（按拓扑顺序排列）
  - total_elapsed_ms：DAG 总执行耗时
  - failed_count：失败的 Agent 数量

**处理流程**：

1. **拓扑排序与依赖解析（委托 DagScheduler）**
   a. 节点以 task_id（缺失时回退 agent_id）作为唯一 key，边优先使用 from_task_id/to_task_id，
      缺失时按 agent_id → task_id 唯一映射回退（兼容手工构造的 legacy DAG）；
   b. 对节点执行 Kahn 算法拓扑排序，构建邻接表 / 入度表 / 上游映射表；
   c. 就绪队列 `ready = [所有 indegree == 0 的节点]`，按 (priority, task_id) 确定性排序；
   d. `agent_outputs`（key → answer）用于串行模式下传递给下游 Agent；

2. **DAG 执行循环（有界并发 worker pool）**
   a. 启动 `min(concurrency, total)` 个 worker，从就绪队列取节点执行（入度归零即入队，节点完成后实时释放下游）：
      - 将上游（子任务）输出摘要拼接到当前 task_content 前端（父任务汇总子任务结果，叶子任务携带上游工作摘要）：
        ```
        子任务已完成的结果：\n{子任务输出1}\n{子任务输出2}\n---\n请结合上述子任务结果，汇总产出父任务结果：{原始 task_content}
        ```
      - 每个节点经 `execSingleAgent` 执行（内部通过 InfoCore.saveInfo 持久化 ACT 记录）；
      - 每完成一个节点，回调更新 `orchestration_work.completed_task_count`；
   b. **快速失败**：节点执行失败抛 `DagNodeFailureError`（携带 agent_id / task_id / reason / completed_results），
      停止派发新节点，收敛进行中的节点后向上抛出，由上游层（handleDAGFailure）处理；
   c. **超时控制**：总耗时超过 `dag_timeout_ms` 时停止派发，剩余未执行节点经 onCancelled 标记 CANCELLED；
   d. **环兜底（高可用）**：若存在 task 级环导致就绪队列耗尽但仍有未执行节点，按确定性顺序打破环继续执行，
      绝不因数据异常而永久挂起；

3. **失败处理**
   a. 若任一 Agent 执行失败（execSingleAgent 返回 false 或抛错）：
      - 抛 DagNodeFailureError 快速失败；
      - 调用 OrchestrationStrategy.handleDAGFailure 处理失败；
      - 若 handleDAGFailure 返回 action="REPLAN" 和新 agent_dag：用新 agent_dag 替换当前 agent_dag，重新执行 execDAG；
      - 若 handleDAGFailure 返回 action="FAIL"：终止 DAG 执行，将 failed_count 和已完成的结果写入 output 返回；

4. **完成**
   a. 所有节点执行完成（或环被打破 / 超时取消）时 DAG 执行完成；
   b. 统计 total_elapsed_ms、failed_count；
   c. 将 agent_results（按完成顺序排列）、total_elapsed_ms、failed_count 写入 output 返回；

### 2.4. 异步执行 DAG（execDAGAsync）

**功能**：通过 MQ 异步执行 Agent DAG，立即返回 job_id
**入参**：
- input：ExecDAGAsyncInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - agent_dag：Agent DAG
  - work_context：工作上下文数据
  - callback_queue：结果回调队列名称（可选）
  - max_concurrent：最大并发数（可选，默认 1）
- context：ExecDAGAsyncContext（继承 Context），会话上下文（session_id, work_id 等）
- output：ExecDAGAsyncOutput（继承 Output），承载返回内容：
  - job_id：异步任务 ID

**处理流程**：

1. 生成 `job_id`（UUID）；
2. 调用 MQProvider.sendMQ 将执行任务 `{ job_id, work_id, agent_dag, work_context, max_concurrent, callback_queue }` 发送到 `orchestration.dag_execution` 队列；
3. 确保 `orchestration.dag_execution` 队列上有 Worker（调用 MQCore.startWorker 启动消费者，若已存在则复用）；
4. Worker 处理逻辑：从队列消费消息 → 调用 execDAG 同步执行 → 完成后将结果发送到 callback_queue（若指定）或写入 `orchestration_agent_dag_record` 表；
5. 返回 job_id 写入 output；

### 2.5. 查询 DAG 执行进度（getDAGProgress）

**功能**：查询一个 work 的 Agent DAG 执行进度
**入参**：
- input：GetDAGProgressInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - plan_id：规划 ID（可选，用于 Planning 策略）
- context：GetDAGProgressContext（继承 Context），会话上下文（session_id 等）
- output：GetDAGProgressOutput（继承 Output），承载返回内容：
  - progress：执行进度信息
    - work_id：工作 ID
    - plan_id：规划 ID
    - total_tasks：总任务数
    - completed_tasks：已完成任务数
    - running_tasks：正在执行的任务数
    - failed_tasks：失败的任务数
    - pending_tasks：等待执行的任务数
    - node_details：每个 Agent 的执行详情列表：
      - agent_id
      - task_content（摘要）
      - status：PENDING / RUNNING / COMPLETED / FAILED
      - answer：执行结果（仅 COMPLETED 状态有值）
      - trace_id：执行追踪 ID（仅 COMPLETED 状态有值）
      - elapsed_ms：单 Agent 耗时
    - total_elapsed_ms：DAG 执行总耗时

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 work_id 查询 `orchestration_work` 表获取 status、task_count、completed_task_count；
2. 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_agent_execution` 表获取所有 Agent 执行记录；
3. 组装进度信息：
   a. total_tasks 从 orchestration_work.task_count 获取；
   b. completed_tasks 从 orchestration_work.completed_task_count 获取；
   c. 遍历执行记录，按 status 分类统计 running / failed / pending 数量；
4. 将进度信息写入 output 返回；

### 2.6. 取消 DAG 执行（cancelExecution）

**功能**：取消指定 work 下所有正在执行的 Agent DAG
**入参**：
- input：CancelExecutionInput（继承 Input），包含以下字段：
  - work_id：工作 ID
- context：CancelExecutionContext（继承 Context），会话上下文（session_id 等）
- output：CancelExecutionOutput（继承 Output），承载返回内容：
  - cancelled_count：取消的 Agent 数量

**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_agent_execution` 表，筛选 status 为 "PENDING" 或 "RUNNING" 的执行记录；
2. 对每条记录，将其 status 置为 "CANCELLED"；
3. 若有正在执行的 Agent（status=RUNNING），中断执行机制：
   a. 若为异步执行模式：调用 MQCore.stopWorker 停止对应 Worker；
   b. 若为同步执行模式：通过抛出 CancelledError 中断 execSingleAgent 的执行循环（AgentExecution.execAgent 内部需支持中断信号）；
4. 更新 `orchestration_work` 表 status 为 "FAILED"，记录 cancel_reason；
5. 返回 cancelled_count 写入 output；

### 2.7. 获取队列执行状态（getExecQueueStatus）

**功能**：查看 `orchestration.dag_execution` 队列的异步执行状态
**入参**：
- input：GetOrchestrationExecQueueStatusInput（继承 Input）
- context：GetOrchestrationExecQueueStatusContext（继承 Context），会话上下文（session_id 等）
- output：GetOrchestrationExecQueueStatusOutput（继承 Output），承载返回内容：
  - queue_stats：队列统计（pending / processing / completed / failed 数量）
  - workers：正在运行的 Worker 列表

**处理流程**：

1. 调用 MQProvider.getQueueStats("orchestration.dag_execution") 获取队列统计；
2. 调用 MQCore.getWorker("orchestration.dag_execution") 获取 Worker 状态；
3. 将统计信息写入 output 返回；

### 2.8. 配置（configOrchestrationExecution）

**功能**：配置 Orchestration 执行引擎的参数
**入参**：
- input：ConfigOrchestrationExecutionInput（继承 Input），包含以下字段：
  - max_concurrent：默认最大并发执行数（可选，默认 1）
  - dag_timeout_ms：DAG 执行总超时时间（可选，默认 600000 = 10 分钟，0 表示不限制）
  - agent_timeout_ms：单 Agent 执行超时时间（可选，默认 300000 = 5 分钟，0 表示不限制；防止单个 Work Agent 挂起拖垮整个 DAG）
- context：ConfigOrchestrationExecutionContext（继承 Context），会话上下文（session_id 等）
- output：ConfigOrchestrationExecutionOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取当前配置；
2. 校验并更新非空入参（同上）；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

### 2.9. 记录系统 Agent 执行（recordSystemAgentExecution）

**功能**：为不经过 `execSingleAgent`（无 ReACT 循环）的系统 Agent（Writer / Evolutor）记录其完成态执行结果，写入与其他 Agent 相同的 `orchestration_agent_execution` 表，保证采集方式一致。
**入参**：
- input：RecordSystemAgentExecutionInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - agent_id：系统 Agent ID
  - task_content：任务内容（描述性文本，如"汇总执行结果并生成最终回复"）
  - answer：执行结果
  - elapsed_ms：耗时（可选）
- context：OrchestrationExecutionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：RecordSystemAgentExecutionOutput（继承 Output）

**处理流程**：

1. 调用 RelationDBProvider.insertDB 向 `orchestration_agent_execution` 表写入完成态执行记录（execution_type: SYSTEM，status: COMPLETED，answer/task_content/elapsed_ms 已填充，trace_id/iterations 置空）；
2. 返回 true；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Task-Agent 映射表

- 表名：orchestration_task_agent
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 普通索引 | |
| task_id | 任务 ID（来自 PlannerAgent.plan） | UUID | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | 构建完成后填充 |

### 3.2. Agent DAG 关系表

- 表名：orchestration_agent_dag
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 普通索引 | |
| from_agent_id | 上游 Agent ID | UUID | N | 普通索引 | |
| to_agent_id | 下游 Agent ID | UUID | N | 普通索引 | |

注意：plan_id + from_agent_id + to_agent_id 构成按 plan 作用域的联合唯一索引（idx_agent_dag_edge_plan），同一 plan 内防止重复边；不同 plan 可复用同一对 Agent（允许跨 plan 存在相同依赖边）。

### 3.3. Agent DAG 快照记录表

- 表名：orchestration_agent_dag_record
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 唯一索引 | |
| total_agent_count | Agent 总数 | INT | N | | |
| agent_dag_json | Agent DAG 完整 JSON | TEXT | N | | 含 nodes + edges 的序列化 |

### 3.4. Agent 执行记录表

- 表名：orchestration_agent_execution
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| work_id | 工作 ID | UUID | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | |
| plan_id | 规划 ID | UUID | Y | 普通索引 | Planning 模式下关联 |
| task_id | 任务 ID | UUID | Y | | 关联 PlannerAgent 的 task_id |
| execution_type | 执行类型 | VARCHAR | N | | SINGLE / DAG / SYSTEM |
| task_content | 执行的任务内容 | TEXT | N | | |
| status | 执行状态 | VARCHAR | N | | PENDING / RUNNING / COMPLETED / FAILED / BUILD_FAILED / CANCELLED |
| answer | 执行结果 | TEXT | Y | | 仅在 COMPLETED 状态有值 |
| trace_id | 执行追踪 ID | UUID | Y | | 关联 AgentExecution.getTrace |
| iterations | 迭代次数 | INT | Y | | |
| elapsed_ms | 耗时（ms） | INT | Y | | |
| error_info | 错误信息 | TEXT | Y | | |

## 实现约定（与代码同步）

1. **拓扑排序**：使用 Kahn 算法，依赖 task 级边（from_task_id/to_task_id）构建邻接表和入度表；拓扑与调度逻辑统一收口在 `DagScheduler`，`execDAG` 仅注入节点执行器与回调。
2. **上游输出传递**：下游 Agent 的 task_content 前缀拼接上游 Agent 的输出摘要（取上游 answer 的前 500 字作为上下文），避免 token 溢出。
3. **并发执行**：并发模式下，入度零的 Agent 可并行执行（通过 Promise.all），但需确保 AgentExecution 内部无共享状态冲突。
4. **中断机制**：AgentExecution.execAgent 需支持 `AbortSignal` 参数用于取消正在执行的任务；若当前 Agent 层实现不支持，则通过标记 status=CANCELLED + 忽略该 Agent 后续输出实现软中断。
5. **超时控制**：DAG 总执行时间超过 `dag_timeout_ms` 时，取消所有未完成的 Agent 节点，标记 work 为 FAILED。
6. **DB 操作**：所有 CRUD 经 RelationDBProvider，禁止直接操作。
7. **AOP**：所有方法经 AopProxy.wrap 生成代理。

## 代码变更记录

### [2026-08-19] 修复 orchestration_agent_dag 唯一索引跨 plan 冲突

**变更原因**：`orchestration_agent_dag` 原唯一索引 `idx_agent_dag_edge(from_agent_id, to_agent_id)` 作用域为全局。由于 Work Agent 会按任务匹配跨 work 复用，两次相似请求（如重复提问"如何开发一个Agent项目"）会为不同 plan 生成同一对 `(from_agent_id, to_agent_id)` 的边，第二次插入即触发 `UNIQUE constraint failed: orchestration_agent_dag.from_agent_id, orchestration_agent_dag.to_agent_id`，导致 BUILD_AGENT_DAG 节点失败、整个 work 标记 FAILED。

**修改的方法**：
- `OrchestrationExecutionSchemaInitializer.init()` — 唯一索引改为按 plan 作用域：
  ```sql
  -- 原：
  CREATE UNIQUE INDEX idx_agent_dag_edge ON orchestration_agent_dag(from_agent_id, to_agent_id);
  -- 改：
  DROP INDEX IF EXISTS idx_agent_dag_edge;
  CREATE UNIQUE INDEX idx_agent_dag_edge_plan ON orchestration_agent_dag(plan_id, from_agent_id, to_agent_id);
  ```
- `OrchestrationExecutionService.buildAgentDAG()` — 落边前先查询当前 plan 已存在的边，构建去重集合；同一 plan 内重复边跳过，避免唯一索引冲突。原始实现注释保留在方法内。
- `test/test-helpers.ts` — 测试库 schema 同步为 `idx_agent_dag_edge_plan`。

**新增测试用例**：
- `TC-BAD-012`：跨 plan 复用同一对 Agent 的边不再冲突（回归原报错场景）。
- `TC-BAD-013`：同一 plan 内重复边自动去重。

**影响的端点**：
- `POST /api/chat`（Planning 策略）— BUILD_AGENT_DAG 节点不再因唯一索引抛错，work 可正常进入执行阶段。
- 服务启动 Schema 初始化 — 自动迁移存量库：删除旧全局唯一索引，重建按 plan 唯一索引。

**可能存在的问题**：
- 存量库中若存在历史脏数据（全局重复边）需先清理；当前生产库无 (plan_id, from, to) 重复，迁移安全。
- 若历史 work 已被标记 FAILED（如本次 fb50e6af-6954-49c9-8409-9aa7b40335dd），修复后需用户重新发起相同请求才会按新逻辑成功执行。

### [2026-08-22] 新增 recordSystemAgentExecution 记录系统 Agent 执行轨迹
**变更原因**：Writer / Evolutor 系统 Agent 不经过 `execSingleAgent` 的 ReACT 循环，其执行结果未写入 `orchestration_agent_execution` 表，导致「思考过程 / 执行过程」弹窗看不到这两个 Agent。为与其他 Agent 采集方式一致，新增统一入口记录其完成态执行结果。

**修改的方法**：
  - `OrchestrationExecutionService.recordSystemAgentExecution(input, context, output)` — 新增方法，向 `orchestration_agent_execution` 表写入 `execution_type=SYSTEM`、`status=COMPLETED` 的记录。
  - `OrchestrationExecutionAccess.recordSystemAgentExecution` — Access 层新增对应方法。
  - `RecordSystemAgentExecutionInput / RecordSystemAgentExecutionOutput` — domain/types 新增类型。

**影响的端点**：
  - 后端编排链路 `JSONNodeService.handleWriteResult` / `handleEvalResult` — 调用本方法落库。
  - `buildThinkingBlocksAndDag`（思考过程采集）— 无需改动，自动采集新增记录。

**可能存在的问题**：
  - `execution_type` 新增 `SYSTEM` 枚举值；`getDAGProgress` 等按 status 统计的逻辑不受影响（SYSTEM 记录 status 为 COMPLETED）。

### [2026-08-23] buildAgentDAG 按配置中心 max_concurrent 并发构建 + 构建进度流式推送
**变更原因**：PLANNING 策略下 PlannerAgent 拆解出的多个子任务逐个串行 `buildAgent`，每个 Agent 构建需多次 LLM 匹配（Agent 相似度 / LLM 模型），9 个 Agent 累计近 2 分钟且期间无任何进度输出，前端长时间显示「执行中」却看不到进度。

**修改的方法**：
  - `OrchestrationExecutionService.ensureConfigLoaded()` — 新增方法，从 `orchestration_config` 表加载 `max_concurrent` / `dag_timeout_ms` 并缓存，`buildAgentDAG` 入口调用。
  - `OrchestrationExecutionService.buildAgentDAG()` — 串行 for 循环重构为受 `max_concurrent` 限制的并发池（`Promise.all` + 游标），构建结果按原 task 顺序回填；并透传 `session_id / work_id / interact_id` 给 `AgentBuilder.buildAgent`，使其在构建过程中流式推送 `agent_building / agent_matched / agent_built` 事件。
  - `JSONNodeService.handleBuildAgentDAG()` — 向 `buildAgentDAG` 补齐 `work_id / interact_id` 上下文透传（原仅传 session_id）。

**影响的端点**：
  - `POST /api/chat/stream`（Planning 策略）— BUILD_AGENT_DAG 阶段并发构建，前端思考过程弹窗实时展示「构建中 → 构建完成 / 复用已有 Agent」进度。

**可能存在的问题**：
   - 并发构建共享单连接 better-sqlite3，写操作由同步语义串行化，无数据竞争；并发收益来自 Agent/LLM 匹配的异步网络调用。
   - `max_concurrent` 过大时可能放大对上游 LLM 的并发压力，需结合配置中心合理设置（默认 1）。

### [2026-08-24] 修复 execDAG 死锁：任务级边 + DagScheduler 调度器重构
**变更原因**：`buildAgentDAG` 将 task 级 DAG 边降维为 agent 级边（from_agent_id → to_agent_id）。当多个 task 复用同一 Agent 时（如 "研究 Agent" 拆 8 个 task 只命中 3 个 Agent），`task_1(agent A) → task_3(agent B) → task_4(agent A)` 这类链被展开为 agent 级环（A → B → A），`execDAG` 按 agent 边展开后 8 个节点入度全部 > 0，就绪队列为空，DAG 一个节点都不执行，最终短路为「Work Agent 未产生有效输出」。原始「死锁兜底」逻辑位于 while 循环内部，就绪队列初始为空时根本触发不到。

**修改的方法**：
- `OrchestrationExecution/domain/types.ts` — `AgentEdge` 新增 `from_task_id` / `to_task_id`（可选，执行拓扑的权威来源），保留 `from_agent_id` / `to_agent_id` 用于可视化。
- 新增 `OrchestrationExecution/application/DagScheduler.ts` — 抽取纯逻辑的任务级 DAG 调度器（参考 LangChain/LangGraph 的 Pregel 执行模型）：task 级拓扑键、Kahn 拓扑排序、有界并发 worker pool、确定性就绪排序、快速失败（`DagNodeFailureError`）、超时控制、环兜底（确定性打破环，绝不挂起）。不触碰 DB/LLM，便于单元测试。
- `OrchestrationExecutionService.buildAgentDAG()` — 边转换阶段拆分为「执行层 task 级边（agent_edges，随快照持久化）」与「可视化层 agent 级边（orchestration_agent_dag 表，去重落库）」两级。
- `OrchestrationExecutionService.execDAG()` — 重构为基于 DagScheduler：注入节点执行器（execSingleAgent + 串行上游摘要注入）、completed_task_count 回调、超时取消回调；`DagNodeFailureError` 保留 agent_id/task_id/reason/completed_results 字段，与 OrchestrationStrategy.handleDAGFailure 读取契约兼容。

**新增测试用例**：
- `TC-BAD-014`：多 task 复用同一 Agent 时产出 task 级边（from_task_id/to_task_id）。
- `TC-ED-022`：agent 级存在回环（task 级无环）时仍应执行全部任务（回归死锁）。
- `TC-ED-023`：task 级环依赖时确定性打破环并执行全部任务（高可用兜底）。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— EXEC_DAG 节点不再因 agent 级环死锁，Work Agent 按 task 级拓扑正确执行。
- `orchestration_agent_dag` 表仍存 agent 级边（仅可视化），`agent_dag_json` 快照中的边改为携带 task 级字段。

**可能存在的问题**：
- 存量 `agent_dag_json` 快照中的旧边不含 from_task_id/to_task_id，execDAG 会回退到 agent_id → task_id 唯一映射（1:1 场景正确）；agent 复用场景的旧快照无法精确还原 task 级拓扑，属历史数据限制，新 work 不受影响。
- 超时取消的节点不再计入 failed_count（语义从「失败」修正为「取消」），无既有测试依赖该口径。

### [2026-08-24] 层级 DAG：叶子/父节点区分与父任务汇总

**变更原因**：Planner 原产出扁平串行 DAG，所有任务同级执行，「父任务汇总子任务结果」的语义缺失；且并发模式下上游摘要不注入，父任务拿不到子任务结果。

**修改的方法**：
- `OrchestrationExecution/domain/types.ts` — `TaskNode` 新增 `parent_task_id` / `dependencies`；`AgentNode` 新增 `parent_task_id` / `node_kind`（LEAF/PARENT）。
- `OrchestrationExecutionService.buildAgentDAG()` — 依据 `parent_task_id` 构建 childMap，区分叶子/父节点（均构建 WorkAgent），抽取 `insertTaskAgentRecord` / `buildLeafAgent` / `updateTaskAgentRecord` / `buildAgentNode` 等小方法。
- `OrchestrationExecutionService.execDAG()` + 新增 `buildExecTaskContent()` — 父任务注入全部子任务结果摘要（「请结合上述子任务结果，汇总产出父任务结果」），叶子任务携带上游工作摘要。
- `DagScheduler.run()` — 上游摘要注入由「仅串行模式」改为「始终注入」（拓扑保证父任务入队时子任务已完成，并发安全）。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— EXEC_DAG 阶段父任务等待所有子任务完成后，结合子任务结果汇总产出父任务结果。

**可能存在的问题**：
- 历史扁平 DAG 无 `parent_task_id`，全部视为叶子任务（向后兼容），不触发父任务汇总。

### [2026-08-24] 单 Agent 执行超时兜底（agent_timeout_ms）

**变更原因**：`DagScheduler` / `execDAG` 原无单 Agent 级超时，单个 Work Agent 的 LLM 调用挂起会拖垮整个 DAG，最终只能等 JSONNode 节点超时（原配置 20 分钟）兜底，用户体感极差。

**修改的方法**：
- `OrchestrationExecution/domain/types.ts` — `OrchestrationExecutionConfig` 新增 `agent_timeout_ms`（默认 300000）；`ConfigOrchestrationExecutionInput` 新增 `agent_timeout_ms`。
- `DagScheduler.ts` — `DagSchedulerConfig` 新增 `nodeTimeoutMs`；新增 `executeNode` 方法，对单节点执行做 Promise 竞速超时，超时抛错经 `run()` 收敛为 `DagNodeFailureError` 快速失败。
- `OrchestrationExecutionService` — `ensureConfigLoaded` 加载 `agent_timeout_ms`；`execDAG` 传入 `nodeTimeoutMs`；`configOrchestrationExecution` 校验并下发该配置。
- `OrchestrationEntrySchemaInitializer` — 幂等迁移新增 `agent_timeout_ms` 列，并将 `node_timeout_ms > 600000` clamp 到 600000。
- `Application/Config` — 注册并映射 `orchestration.execution.agent_timeout_ms` 配置项。

**新增测试用例**：
- `Orchestration/test/dag-scheduler.test.ts` — 单节点挂起按 `nodeTimeoutMs` 快速失败；`nodeTimeoutMs=0` 不限制；超时前完成正常返回。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— 单 Agent 挂起由最长 20 分钟缩短为 `agent_timeout_ms`（默认 5 分钟）快速失败。

**可能存在的问题**：
- 节点超时后底层 `execSingleAgent` 无法被强制取消，其内部未完成的 LLM 调用会在后台自行失败（HTTP 2 分钟超时），落库为 best-effort，不影响后续编排。

### [2026-08-24] execSingleAgent 执行事件透传 task_id 与输入/输出

**变更原因**：`execSingleAgent` 调用 `execAgent` 时未透传 task_id，且 `agent_output` / `agent_error` 事件未携带 task_id 与输入/输出，导致前端 AgentDAG 节点状态只能按 agent_id 广播（同一 Agent 复用多任务时出现「任务4 先于任务3 标记完成」的错误着色），且「思考过程」执行过程无法实时展示任务输入与最终输出。

**修改的方法**：
- `OrchestrationExecutionService.execSingleAgent()` — `ExecAgentInput` 补 `task_id` 透传；`agent_output` 事件新增 `input` / `output` 字段并携带 `task_id`；`agent_error` 事件（成功分支与 catch 分支）新增 `input` 字段并携带 `task_id`。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— 前端按 task_id 关联任务节点，AgentDAG 状态着色与「执行过程」输入/输出实时正确。

**可能存在的问题**：
- 无（`ExecAgentInput.task_id` 为可选字段，Simple 策略或非 DAG 场景缺省为空字符串，前端回退按 agent_id 定位）。

### [2026-08-26] DagScheduler 快速失败立即收敛，不再等待卡死的并发节点

**变更原因**：并发执行（`max_concurrent > 1`）下，某个节点失败触发快速失败（`DagNodeFailureError`）后，`Promise.all` 仍会等待其他正在执行的并发节点完成；若这些节点因底层 LLM / 浏览器调用挂起（如 CDT `CDP WebSocket 连接已关闭` 后复用该 Agent 的后续任务卡死），整个 DAG 会永久卡在 `EXECUTING`，work 不收敛为 FAILED、也不写错误 RESPONSE，用户体感「无响应」（本次「我想去北京旅游」work 卡死约 2 小时）。

**修改的方法**：
- `DagScheduler.ts` — 新增快速失败信号 `failureSignal`，节点失败时立即 `resolve`；`run()` 用 `Promise.race([Promise.all(runners), failureSignal])` 取代 `Promise.all`，一旦失败立即收敛并抛出 `DagNodeFailureError`，不再等待正在执行的并发节点（其在后台自行完成或超时，落库 best-effort）。

**新增测试用例**：
- `Orchestration/test/dag-scheduler.test.ts` — 并发节点中一个失败、另一个挂起（永不返回）时应立即快速失败（远小于 `nodeTimeoutMs` 收敛），而非等待挂起节点超时。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— 并发 DAG 中任一节点失败后，work 立即收敛为 FAILED 并写错误 RESPONSE（经 JSONNode `HANDLE_ERROR` / `receiveWork` 兜底），不再卡在 `EXECUTING`。

**可能存在的问题**：
- 快速失败后，正在执行的节点在后台继续运行直至自行失败（`nodeTimeoutMs` / HTTP 超时兜底），其后续 `orchestration_agent_execution` 落库与 `agent_error` 推送为 best-effort，不影响 work 已收敛的 FAILED 状态。

