# JSONNode 编排框架

## 1. 设计目标

1. 定义一组原子化编排节点类型，每个节点完成编排流程中的一步原子操作；
2. 通过 JSON 声明式组合原子节点，构成编排策略的完整流程定义；
3. 节点之间的连接（边）表示执行顺序和数据流转，支持条件分支（true_next / false_next）；
4. 编排引擎通过解析 JSONNode 定义驱动节点执行，实现编排策略与执行引擎的解耦；
5. 支持节点执行追踪和状态记录，便于编排流程的可观测性。

## 2. 核心概念

### 2.1. JSONNode 定义结构

一个完整的 JSONNode 编排定义包含节点定义和执行图两部分：

```json
{
  "version": "1.0",
  "orchestration_id": "策略或work的唯一标识",
  "start_node": "4a957b1e-8ca8-4d32-b8af-82eb4a7d3103",
  "nodes": [
    {
      "node_id": "4a957b1e-8ca8-4d32-b8af-82eb4a7d3103",
      "node_type": "SAVE_USER_INPUT",
      "params": { "...特定节点参数..." },
      "next": "322db028-9f2e-42d2-9a14-922f0368e436",
      "on_error": "5b615f53-ca92-4976-86d2-b1f647d5a2f8"
    },
    {
      "node_id": "322db028-9f2e-42d2-9a14-922f0368e436",
      "node_type": "SELECT_STRATEGY",
      "params": { "...特定节点参数..." },
      "next": "8afe8b3e-f4b2-4e76-9c0d-caeb066b1375",
      "on_error": "5b615f53-ca92-4976-86d2-b1f647d5a2f8"
    },
    {
      "node_id": "8afe8b3e-f4b2-4e76-9c0d-caeb066b1375",
      "node_type": "CONDITION",
      "params": {
        "field": "strategy",
        "operator": "EQ",
        "value": "PLANNING"
      },
      "true_next": "056add5b-1b0d-46f8-aa99-d0f916221ace",
      "false_next": "6a11d0ac-7a6d-458a-9ef0-b4f2502deb92"
    },
    {
      "node_id": "5b615f53-ca92-4976-86d2-b1f647d5a2f8",
      "node_type": "HANDLE_ERROR",
      "params": { "default_response": "抱歉，处理您的问题时出现了错误，请稍后重试。" },
      "next": null
    }
  ]
}
```

### 2.2. 节点属性说明

| 属性 | 含义 | 是否必填 | 说明 |
|------|------|---------|------|
| node_id | 节点唯一标识 | Y | 在整个编排定义中唯一，必须为 UUID 格式（如 `550e8400-e29b-41d4-a716-446655440000`） |
| node_type | 节点类型 | Y | 枚举值，定义该节点执行的原子操作 |
| params | 节点参数 | Y | 不同类型的节点有各自的参数结构 |
| next | 下一节点 ID | Y | 执行成功后的下一个节点；null 表示流程结束 |
| on_error | 错误处理节点 ID | Y | 执行失败后跳转的节点；通常为 HANDLE_ERROR 节点 |

条件分支节点（CONDITION）额外属性：

| 属性 | 含义 | 说明 |
|------|------|------|
| true_next | 条件 True 时的下一节点 ID | 覆盖 next 字段 |
| false_next | 条件 False 时的下一节点 ID | - |

## 3. 内置原子节点类型

### 3.1. SAVE_USER_INPUT — 保存用户输入

**语义**：保存用户的原始输入到 InfoCore 和 Work 记录中。

**参数**：
```json
{
  "info_type": "REQUEST",
  "update_work_status": "CREATED"
}
```

**处理逻辑**：
1. 调用 InfoCore.saveInfo 将输入内容（来自执行上下文的 user_query）保存为 info_type=REQUEST、info_creator_role=USER；`info_type` / `info_creator_role` / `info_creator_id` 优先取自 shared_data（由 OrchestrationEntry 透传），`citing_msg_ids` 透传为 parent_info_ids 建立引用关系；
2. 幂等：先按 work_id + info_type=REQUEST 查询 `info_raw`，若已存在（确认流程 confirmIntent 重入场景）则复用已有 info_id 并直接返回，不再重复落库；
3. saveInfo 失败时降级记录日志，不中断编排；
4. 调用 RelationDBProvider.updateDB 更新 orchestration_work 表 status；

### 3.2. BUILD_WORK_CONTEXT — 构建工作上下文

**语义**：为 work 构建完整的上下文数据。

**参数**：
```json
{
  "max_recent_works": 5,
  "include_user_profile": true
}
```

**处理逻辑**：
1. 调用 OrchestrationEntry.buildWorkContext，产出 work_context；
2. 将 work_context 写入执行上下文的共享数据区（shared_data.work_context）；

### 3.3. SELECT_STRATEGY — 选择编排策略

**语义**：根据任务特征选择 Simple 或 Planning 策略。

**参数**：
```json
{
  "complexity_decompose_threshold": 50
}
```

**处理逻辑**：
1. 调用 OrchestrationEntry.selectOrchestrationStrategy，传入 user_query 和 work_context；
2. 将选中的 strategy、complexity、reason 写入 shared_data；

### 3.4. CONDITION — 条件分支

**语义**：根据 shared_data 中的某个字段值决定下一跳转节点。

**参数**（params）：
```json
{
  "field": "strategy",
  "operator": "EQ",
  "value": "PLANNING"
}
```

**节点属性**（CONDITION 额外属性，非 params）：
- `true_next`：条件 True 时跳转的节点 ID
- `false_next`：条件 False 时跳转的节点 ID

**处理逻辑**：
1. 从 shared_data 读取 field 对应的值；
2. 根据 operator 比较 field_value 和 value：
   - EQ: field_value == value
   - NE: field_value != value
   - GT: field_value > value
   - LT: field_value < value
   - GE: field_value >= value
   - LE: field_value <= value
   - IN: value (string) 包含 field_value
3. true → 跳转 true_next；false → 跳转 false_next；

### 3.5. BUILD_WORK_AGENT — 构建 WorkAgent

**语义**：为当前任务构建一个 WorkAgent。

**参数**：
```json
{
  "force_new": false
}
```

**处理逻辑**：
1. 调用 AgentBuilder.buildAgent，传入 user_query 和参数；
2. 将 agent_id 写入 shared_data.agent_ids 数组；

### 3.6. EXEC_AGENT — 执行单个 Agent

**语义**：执行指定的 Agent 并获取结果。

**参数**：
```json
{
  "agent_id_key": "current_agent_id",
  "save_result_key": "agent_answer"
}
```

**处理逻辑**：
1. 从 shared_data 中读取 agent_id（键由 agent_id_key 指定）；
2. 调用 OrchestrationExecution.execSingleAgent 执行 Agent；
3. 将 answer 写入 shared_data（键由 save_result_key 指定）；

### 3.7. PLAN_WORK — 规划任务（PlannerAgent）

**语义**：调用 PlannerAgent 将任务拆解为**层级子任务 DAG**（LLM 单次层级拆解后，对仍复杂的叶子任务递归拆解，直到叶子任务为「小任务」或达到最大深度）。

**参数**：
```json
{
  "save_plan_key": "plan_result"
}
```

**处理逻辑**：
1. 调用 PlannerAgent.planHierarchical，获取 plan_id 和层级 task_dag（含 parent_task_id / dependencies）；
2. 将 plan_id 和 task_dag 写入 shared_data（键由 save_plan_key 指定）；
3. 更新 orchestration_work 表 status 为 "PLANNING"；

### 3.8. BUILD_AGENT_DAG — 构建 Agent DAG

**语义**：将 Task DAG 转换为 Agent DAG。

**参数**：
```json
{
  "plan_key": "plan_result",
  "save_agent_dag_key": "agent_dag"
}
```

**处理逻辑**：
1. 从 shared_data 读取 plan_result（含 plan_id 和 task_dag）；
2. 调用 OrchestrationExecution.buildAgentDAG 转换；
3. 将 agent_dag 和 task_agent_map 写入 shared_data；

### 3.9. EXEC_DAG — 执行 Agent DAG

**语义**：按依赖顺序执行 Agent DAG 中的所有 Agent。

**参数**：
```json
{
  "agent_dag_key": "agent_dag",
  "max_concurrent": 1,
  "save_results_key": "agent_results"
}
```

**处理逻辑**：
1. 从 shared_data 读取 agent_dag；
2. 调用 OrchestrationExecution.execDAG；
3. 将 agent_results 写入 shared_data；

### 3.10. WRITE_RESULT — WriterAgent 写作

**语义**：调用 WriterAgent 生成人性化最终回复。

**参数**：
```json
{
  "agent_results_key": "agent_results",
  "save_response_key": "final_response"
}
```

**处理逻辑**：
1. 从 shared_data 读取 agent_results 和 user_query；
2. 调用 WriterAgent.write 生成回复；
3. 将 response 写入 shared_data；
4. 调用 OrchestrationExecution.recordSystemAgentExecution 将 Writer 执行结果（answer=最终回复）写入 `orchestration_agent_execution` 表，供「思考过程 / 执行过程」统一采集展示（与其他 Agent 采集方式一致）；

### 3.11. EVAL_RESULT — EvolutorAgent 评估

**语义**：异步触发 EvolutorAgent 评估。

**参数**：
```json
{
  "agent_results_key": "agent_results",
  "final_response_key": "final_response",
  "async": true
}
```

**处理逻辑**：
1. 若 async=true：通过 MQ sendMQ 投递评估任务，不等待结果；
2. 若 async=false：同步调用 EvolutorAgent.evalWorkAgent / evalWriterAgent；
3. 评估完成后调用 OrchestrationExecution.recordSystemAgentExecution 将 Evolutor 评估结果（answer=评分 JSON）写入 `orchestration_agent_execution` 表，供「思考过程 / 执行过程」统一采集展示（与其他 Agent 采集方式一致）；
   > 同步 / setImmediate / MQ worker 三处评估序列复用统一的 `runEval` 私有方法，避免重复代码。

### 3.12. SAVE_RESPONSE — 保存最终回复

**语义**：将最终回复保存到 InfoCore 和 Work 记录（一次问答也是一次引用和被引用关系）。

**参数**：
```json
{
  "response_key": "final_response",
  "update_work_status": "COMPLETED"
}
```

**处理逻辑**：
1. 调用 InfoCore.saveInfo 保存为 RESPONSE 角色；将对应 REQUEST 消息 ID 传入 `parent_info_ids`，在 GraphDB 中建立引用边（RESPONSE 引用 REQUEST）；saveInfo 失败时降级记录日志，不中断编排；
2. 调用 RelationDBProvider.updateDB 更新 orchestration_work 表 status 和 final_response 字段；

### 3.13. HANDLE_ERROR — 错误处理

**语义**：处理编排流程中的异常，返回错误回复或标记 work 失败（即使报错也保存 RESPONSE 并在 ChatMap 与对话区展示）。

**参数**：
```json
{
  "default_response": "抱歉，处理您的问题时出现了错误。",
  "update_work_status": "FAILED"
}
```

**处理逻辑**：
1. 将错误信息（如 `[错误] {errorMsg}`）或 default_response 写入 shared_data.final_response；
2. 调用 InfoCore.saveInfo 将错误回复保存为 RESPONSE 消息并关联对应 REQUEST 消息 ID（parent_info_ids），确保在 ChatMap 区和对话区正常呈现；
3. 调用 RelationDBProvider.updateDB 更新 orchestration_work 表 status 为 "FAILED"、error_message 与 final_response；
4. 记录错误日志（通过 LogProvider.error）；

### 3.14. INVOKE — 自定义调用

**语义**：调用任意指定的函数/服务（用于策略扩展场景）。

**参数**：
```json
{
  "target": "ServiceName.methodName",
  "params": {},
  "save_result_key": "invoke_result"
}
```

**处理逻辑**：
1. 通过服务注册表查找 target 对应的函数引用；
2. 传入 params 调用函数；
3. 将返回值写入 shared_data；
4. 若 target 不存在：跳转 on_error；

## 4. Simple 策略 JSONNode 定义

Simple 编排策略使用 JSONNode 的声明式定义：

```json
{
  "version": "1.0",
  "orchestration_id": "builtin_simple",
  "start_node": "de43b808-a9b7-48c1-8744-7602a483328f",
  "nodes": [
    {
      "node_id": "de43b808-a9b7-48c1-8744-7602a483328f",
      "node_type": "SAVE_USER_INPUT",
      "params": { "info_type": "REQUEST", "update_work_status": "PROCESSING" },
      "next": "bea3c048-aa35-4ab3-bda7-c2de0c6b2713",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "bea3c048-aa35-4ab3-bda7-c2de0c6b2713",
      "node_type": "BUILD_WORK_CONTEXT",
      "params": { "max_recent_works": 5, "include_user_profile": true },
      "next": "d9e244cc-b48c-422d-af5d-c940bb8deca3",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "d9e244cc-b48c-422d-af5d-c940bb8deca3",
      "node_type": "BUILD_WORK_AGENT",
      "params": { "force_new": false },
      "next": "9ef376a0-c465-49d1-b1ca-f89922c21246",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "9ef376a0-c465-49d1-b1ca-f89922c21246",
      "node_type": "EXEC_AGENT",
      "params": { "agent_id_key": "current_agent_id", "save_result_key": "agent_answer" },
      "next": "3a6831ba-2b2d-4678-8eb5-be2336486eca",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "3a6831ba-2b2d-4678-8eb5-be2336486eca",
      "node_type": "WRITE_RESULT",
      "params": { "agent_results_key": "agent_results", "save_response_key": "final_response" },
      "next": "aafd4af1-9f9c-4ecb-913d-1616e99f4252",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "aafd4af1-9f9c-4ecb-913d-1616e99f4252",
      "node_type": "EVAL_RESULT",
      "params": { "agent_results_key": "agent_results", "final_response_key": "final_response", "async": true },
      "next": "771099da-b73c-493b-bf64-15dd33f4bd27",
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "771099da-b73c-493b-bf64-15dd33f4bd27",
      "node_type": "SAVE_RESPONSE",
      "params": { "response_key": "final_response", "update_work_status": "COMPLETED" },
      "next": null,
      "on_error": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f"
    },
    {
      "node_id": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f",
      "node_type": "HANDLE_ERROR",
      "params": { "default_response": "抱歉，处理您的问题时出现了错误。", "update_work_status": "FAILED" },
      "next": null
    }
  ]
}
```

## 5. Planning 策略 JSONNode 定义

```json
{
  "version": "1.0",
  "orchestration_id": "builtin_planning",
  "start_node": "de43b808-a9b7-48c1-8744-7602a483328f",
  "nodes": [
    {
      "node_id": "de43b808-a9b7-48c1-8744-7602a483328f",
      "node_type": "SAVE_USER_INPUT",
      "params": { "info_type": "REQUEST", "update_work_status": "PROCESSING" },
      "next": "bea3c048-aa35-4ab3-bda7-c2de0c6b2713",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "bea3c048-aa35-4ab3-bda7-c2de0c6b2713",
      "node_type": "BUILD_WORK_CONTEXT",
      "params": { "max_recent_works": 5, "include_user_profile": true },
      "next": "d9e244cc-b48c-422d-af5d-c940bb8deca3",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "d9e244cc-b48c-422d-af5d-c940bb8deca3",
      "node_type": "PLAN_WORK",
      "params": { "save_plan_key": "plan_result" },
      "next": "9ef376a0-c465-49d1-b1ca-f89922c21246",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "9ef376a0-c465-49d1-b1ca-f89922c21246",
      "node_type": "CONDITION",
      "params": {
        "field": "task_count",
        "operator": "EQ",
        "value": "1",
        "true_next": "aafd4af1-9f9c-4ecb-913d-1616e99f4252",
        "false_next": "3a6831ba-2b2d-4678-8eb5-be2336486eca"
      },
      "next": null,
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "3a6831ba-2b2d-4678-8eb5-be2336486eca",
      "node_type": "BUILD_AGENT_DAG",
      "params": { "plan_key": "plan_result", "save_agent_dag_key": "agent_dag" },
      "next": "771099da-b73c-493b-bf64-15dd33f4bd27",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "aafd4af1-9f9c-4ecb-913d-1616e99f4252",
      "node_type": "BUILD_WORK_AGENT",
      "params": { "force_new": false },
      "next": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "771099da-b73c-493b-bf64-15dd33f4bd27",
      "node_type": "EXEC_DAG",
      "params": { "agent_dag_key": "agent_dag", "max_concurrent": 1, "save_results_key": "agent_results" },
      "next": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "e3c444de-c3f9-4c87-83fc-eb112a36ce4f",
      "node_type": "WRITE_RESULT",
      "params": { "agent_results_key": "agent_results", "save_response_key": "final_response" },
      "next": "1c9f36dc-6141-49f0-a5e1-6fad87b1303a",
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "1c9f36dc-6141-49f0-a5e1-6fad87b1303a",
      "node_type": "SAVE_RESPONSE",
      "params": { "response_key": "final_response", "update_work_status": "COMPLETED" },
      "next": null,
      "on_error": "9731377d-9b9e-414a-a554-4746db749fb0"
    },
    {
      "node_id": "9731377d-9b9e-414a-a554-4746db749fb0",
      "node_type": "HANDLE_ERROR",
      "params": { "default_response": "抱歉，处理您的问题时出现了错误。", "update_work_status": "FAILED" },
      "next": null
    }
  ]
}
```

## 6. JSONNode 执行引擎

### 6.1. 执行 JSONNode 编排（execJSONNode）

**功能**：解析 JSONNode 定义，按节点依赖顺序驱动执行
**入参**：
- input：ExecJSONNodeInput（继承 Input），包含以下字段：
  - orchestration_id：编排标识（策略 ID 或 work ID）
  - jsonnode_definition：JSONNode 编排定义对象
  - initial_data：初始数据（user_query、session_id、work_id、interact_id、work_context 等）
- context：ExecJSONNodeContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecJSONNodeOutput（继承 Output），承载返回内容：
  - shared_data：共享数据区（含 final_response 等结果）
  - execution_trace：执行追踪（每个节点的执行状态和耗时）

**处理流程**：

1. **初始化**
   a. 创建共享数据区 `shared_data = { ...initial_data }`（所有节点可读写）；
   b. 创建节点注册表 `node_map = {}`：遍历 jsonnode_definition.nodes，以 node_id 为 key 存入；
   c. 校验：start_node 必须存在于 node_map 中；所有 true_next / false_next 引用的 node_id 必须存在；

2. **执行循环**
   a. 当前节点 `current_node = node_map[start_node]`；
   b. 创建节点执行追踪记录 `execution_trace = []`；
   c. 循环执行：
      - 若 current_node 为 null：退出循环（流程结束）；
      - 从 node_type_registry 查找 node_type 对应的处理函数（handler）；
      - 若 node_type 未注册：跳转 on_error；
      - 记录当前节点开始时间；
      - 调用 handler（传入 shared_data、params、context），捕获返回值和异常；
      - 记录节点结束时间和耗时；
      - 将执行记录 `{ node_id, node_type, status: "SUCCESS"|"ERROR", elapsed_ms, error }` 追加到 execution_trace；
      - 若 handler 成功：
        - 若 node_type == "CONDITION"：根据条件结果设置 current_node 为 true_next 或 false_next 指向的节点；
        - 否则：设置 current_node = node_map[next]（若 next 存在）；
      - 若 handler 失败：
        - 设置 current_node = node_map[on_error]（若 on_error 存在且指向合法节点）；
        - 若 on_error 不存在或非法：退出循环；

3. **返回**
   a. 将 shared_data 和 execution_trace 写入 output 返回；

### 6.2. 节点类型注册表（node_type_registry）

执行引擎维护一个节点类型到处理函数的映射表。内置节点类型自动注册，用户也可以通过 `registerNodeType` 注册自定义节点类型（详见 7.4）。

内置节点类型处理函数映射：
- SAVE_USER_INPUT → saveUserInputHandler
- BUILD_WORK_CONTEXT → buildWorkContextHandler
- SELECT_STRATEGY → selectStrategyHandler
- CONDITION → conditionHandler
- BUILD_WORK_AGENT → buildWorkAgentHandler
- EXEC_AGENT → execAgentHandler
- PLAN_WORK → planWorkHandler
- BUILD_AGENT_DAG → buildAgentDAGHandler
- EXEC_DAG → execDAGHandler
- WRITE_RESULT → writeResultHandler
- EVAL_RESULT → evalResultHandler
- SAVE_RESPONSE → saveResponseHandler
- HANDLE_ERROR → handleErrorHandler
- INVOKE → invokeHandler

### 6.3. 获取执行追踪（getJSONNodeTrace）

**功能**：查询一次 JSONNode 编排执行的完整追踪
**入参**：
- input：GetJSONNodeTraceInput（继承 Input），包含以下字段：
  - orchestration_id：编排标识
- context：GetJSONNodeTraceContext（继承 Context），会话上下文（session_id 等）
- output：GetJSONNodeTraceOutput（继承 Output），承载返回内容：
  - trace：执行追踪详情（execution_trace）

**处理流程**：
1. 调用 RelationDBProvider.selectDB 根据 orchestration_id 查询 `orchestration_jsonnode_trace` 表；
2. 返回追踪记录列表写入 output；

### 6.4. 注册节点类型（registerNodeType）

**功能**：注册一个自定义节点类型，扩展 JSONNode 框架的能力
**入参**：
- input：RegisterNodeTypeInput（继承 Input），包含以下字段：
  - node_type：节点类型名称（需唯一）
  - handler：处理函数（签名：`(shared_data: any, params: any, context: Context) => void`）
- context：RegisterNodeTypeContext（继承 Context），会话上下文（session_id 等）
- output：RegisterNodeTypeOutput（继承 Output），承载返回内容：
  - registered：是否注册成功

**处理流程**：
1. 校验 `node_type` 不能为空且不得与内置节点类型重名；
2. 校验 `handler` 为函数类型；
3. 将 node_type → handler 注册到 node_type_registry；
4. 若 node_type 已存在，覆盖原有 handler（允许热更新）；
5. 返回 registered=true；

### 6.5. 校验 JSONNode 定义（validate）

**功能**：验证 JSONNode 编排定义的合法性和完整性
**入参**：
- input：ValidateJSONNodeInput（继承 Input），包含以下字段：
  - jsonnode_definition：JSONNode 编排定义对象
- context：ValidateJSONNodeContext（继承 Context），会话上下文（session_id 等）
- output：ValidateJSONNodeOutput（继承 Output），承载返回内容：
  - valid：是否合法
  - errors：错误列表（若不合法）

**校验规则**：
1. version 字段存在且为 "1.0"；
2. start_node 存在且在 nodes 中；
3. 所有 node_id 唯一；
4. 所有 node_type 在 node_type_registry 中注册；
5. 所有 next / on_error / true_next / false_next 引用的 node_id 在 nodes 中存在；
6. 图无环（从 start_node 出发 DFS，记录访问路径，检测回边）；
7. 每个节点都有 params（至少为 {}）；

**处理流程**：
1. 依次执行上述校验规则；
2. 将 errors 列表收集后写入 output；

## 7. 配置（configJSONNode）

**功能**：配置 JSONNode 框架的全局参数
**入参**：
- input：ConfigJSONNodeInput（继承 Input），包含以下字段：
  - max_execution_depth：最大执行深度（防止死循环，默认 50）
  - node_timeout_ms：单节点执行超时（默认 300000 = 5 分钟）
  - trace_enabled：是否开启节点执行追踪（默认 true）
- context：ConfigJSONNodeContext（继承 Context），会话上下文（session_id 等）
- output：ConfigJSONNodeOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：
1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取当前配置；
2. 校验并更新非空入参；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 8. 表设计

### 8.1. JSONNode 执行追踪表

- 表名：orchestration_jsonnode_trace
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| orchestration_id | 编排标识 | UUID | N | 普通索引 | strategy_id 或 work_id |
| node_id | 节点 ID | UUID | N | | |
| node_type | 节点类型 | VARCHAR | N | | |
| status | 执行状态 | VARCHAR | N | | SUCCESS / ERROR |
| elapsed_ms | 耗时（ms） | INT | N | | |
| error_info | 错误信息 | TEXT | Y | | |

### 8.2. JSONNode 自定义节点注册表（内存表 + 持久化）

自定义节点注册表主要在内存中维护（node_type_registry Map），同时可选持久化到 `orchestration_node_type` 表：

- 表名：orchestration_node_type
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| node_type | 节点类型名称 | VARCHAR | N | 唯一索引 | |
| description | 节点描述 | TEXT | N | | |
| handler_module | 处理函数模块路径 | VARCHAR | N | | 模块文件路径或函数引用路径 |
| is_builtin | 是否内置节点 | BOOL | N | | true 为内置不可删除 |

## 实现约定（与代码同步）

1. **执行上下文**：shared_data 在节点间共享，节点通过读写 shared_data 传递数据。节点不应依赖于 shared_data 之外的全局状态。
2. **节点幂等性**：内置节点设计为幂等（多次执行同一节点产生相同效果），自定义节点应遵循同样原则。
3. **错误传播**：节点错误会触发 on_error 跳转，错误信息注入 shared_data._error 供错误处理节点使用。
4. **内置节点不可删除**：is_builtin=true 的 node_type 不可通过 registerNodeType 覆盖。
5. **JSONNode 定义与策略解耦**：JSONNode 定义支持序列化/反序列化，策略通过引用 jsonnode_definition 定义流程；修改定义不需要修改执行引擎代码。
6. **超时保护**：单节点执行超过 node_timeout_ms 时中断当前节点，跳转 on_error。
7. **AOP**：所有方法经 AopProxy.wrap 生成代理。

## 代码变更记录

### [2026-08-23] SAVE_USER_INPUT 幂等（confirmIntent 重入不重复落库）
**变更原因**：需求理解暂停后用户确认（confirmIntent）会以相同 work_id 重入编排，`SAVE_USER_INPUT` 节点再次执行会重复写入 REQUEST 消息，导致对话区 / ChatMap 出现重复提问节点。

**修改的方法**：
  - `JSONNodeService.handleSaveUserInput` — 保存前先按 `work_id + info_type=REQUEST` 查询 `info_raw`，已存在则复用 `info_id` 并提前返回，跳过重复落库与状态更新。

**影响的端点**：
  - `POST /api/chat/confirm-intent` — 确认重入编排时不再产生重复 REQUEST 记录。

**可能存在的问题**：
  - 依赖暂停分支已提前落库 REQUEST（`OrchestrationEntryService.receiveWork`）；非暂停流程首次执行仍正常落库，行为不变。

### [2026-08-22] SAVE_USER_INPUT / SAVE_RESPONSE / HANDLE_ERROR 节点携带 trace_id 落库
**变更原因**：trace_id 需贯穿整条处理链路并随消息落库 `info_raw`，供历史查询与日志检索。

**修改的方法**：
  - `JSONNodeService.handleSaveUserInput` — `SaveInfoInput` 新增 `trace_id: sharedData.trace_id`。
  - `JSONNodeService.handleSaveResponse` / `handleError` — 保存 RESPONSE 时携带 `trace_id: sharedData.trace_id`。

**影响的端点**：
  - 后端编排链路 `POST /api/chat`（Simple / Planning 策略）— 落库的 REQUEST / RESPONSE 消息携带真实 trace_id，历史接口据此还原。

**可能存在的问题**：
  - 依赖 `sharedData.trace_id`（由 `initial_data.trace_id` 注入）非空；历史旧数据无 trace_id。

### [2026-08-22] WRITE_RESULT / EVAL_RESULT 节点记录系统 Agent 执行轨迹
**变更原因**：Writer / Evolutor 系统 Agent 不经过 `OrchestrationExecution.execSingleAgent`（无 ReACT 循环），其执行结果未写入 `orchestration_agent_execution` 表，导致「思考过程 / 执行过程」弹窗看不到 Write Agent 与评估 Agent 的执行结果。

**修改的方法**：
  - `JSONNodeService.handleWriteResult` — 调用 `WriterAgent.write` 后经 `recordSystemAgentExecution` 写入 Writer 执行结果。
  - `JSONNodeService.handleEvalResult` — 抽取共享私有方法 `runEval`（同步 / setImmediate / MQ worker 三处复用），评估完成后写入 Evolutor 执行结果。
  - `JSONNodeService.recordSystemAgentExecution`（私有）— 统一调用 `OrchestrationExecution.recordSystemAgentExecution` 落库，best-effort 降级。

**影响的端点**：
  - 后端编排链路 `POST /api/chat`（Simple / Planning 策略）— 执行完成后 `orchestration_agent_execution` 表新增 Writer / Evolutor 记录，`buildThinkingBlocksAndDag` 据此在「执行过程」中展示。

**可能存在的问题**：
  - Evolutor 评估为异步（setImmediate / MQ），用户在评估完成前打开弹窗时可能暂时看不到评估结果，稍后刷新历史即可。
  - Writer / Evolutor 仅记录 `answer` 与 `task_content`，未写 `agent_execution_trace`，故「执行过程」中其 Prompt / 思考步骤为描述性文本（后续可选扩展）。

### [2026-08-24] PLAN_WORK 节点改用层级规划 planHierarchical

**变更原因**：`PLAN_WORK` 原调用 `PlannerAgent.plan` 产出扁平串行 DAG，任务间无父子层级，父任务无法汇总子任务结果，且把「确认需求」「汇总报告」当作同级任务执行。

**修改的方法**：
- `JSONNodeService.handlePlanWork()` — 由 `plannerAgent.plan(PlanInput, ...)` 改为 `plannerAgent.planHierarchical(PlanHierarchicalInput, ...)`，产出层级 TaskDAG（含 parent_task_id / dependencies）。
- `OrchestrationStrategyService.executePlanningStrategy()` — 同步改用 `planHierarchical`，保持备用路径行为一致。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— PLAN_WORK 节点产出层级 DAG，后续 BUILD_AGENT_DAG / EXEC_DAG 按叶子/父节点执行。

**可能存在的问题**：
- 依赖 PlannerAgent 新增 `planHierarchical` 接口（已同步实现）。

### [2026-08-25] PLAN_WORK / BUILD_AGENT_DAG 节点透传 trace_id

**变更原因**：work 级 trace_id 只在少数 Input 透传，`PLAN_WORK`（planHierarchical）与 `BUILD_AGENT_DAG`（buildAgentDAG）传入全新 Input/Context（无 trace_id），AOP 层为这些方法各自生成随机 trace_id，导致其失败时写出的 ERROR 日志带随机 trace_id，监控「最近日志」按真实 traceId 检索不到。同时 `JSONNode: node execution failed` 错误日志 meta 未携带 trace_id。

**修改的方法**：
- `JSONNodeService.handlePlanWork` — `PlanHierarchicalInput` 与 `PlannerAgentContext` 透传 `sharedData.trace_id`。
- `JSONNodeService.handleBuildAgentDAG` — `BuildAgentDAGInput` 与执行上下文透传 `sharedData.trace_id`。
- `JSONNodeService.execJSONNode` 错误日志 — `JSONNode: node execution failed` meta 补充 `trace_id` / `work_id` / `interact_id`。

**影响的端点**：
- 后端编排链路 `POST /api/chat/stream`（Planning 策略）— 拆解/构建阶段错误日志携带真实 trace_id，监控「最近日志」可按 traceId 检索。

**可能存在的问题**：
- 依赖 `sharedData.trace_id`（由 `initial_data.trace_id` 注入）非空；历史旧数据无 trace_id。
