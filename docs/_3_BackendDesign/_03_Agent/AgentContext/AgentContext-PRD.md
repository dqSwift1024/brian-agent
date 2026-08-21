# Agent Context

## 1. 设计目标

1. **历史上下文查看入口**：提供按 `work_id` 查询某次问答使用到的上下文的入口（`getContextDetail`），供可视化与「思考过程」追溯；
2. **上下文快照归属 InfoCore**：上下文来源关系（`work_id → 采集来源 → info_id`）由 InfoCoreProvider 的 `info_context_source` 表落盘（在 `InfoCore.context` 内部完成），AgentContext 不再自建快照表（`agent_context` / `agent_context_item` 已移除）；
3. **与 InfoCore 解耦**：上下文内容（info 记录）仍由 InfoCore 管理，AgentContext 仅提供查询入口与模块配置。

## 2. 功能设计

### 2.1. 按 work_id 查询上下文详情（getContextDetail）

**功能**：根据 work_id 获取该次问答使用到的上下文，以三对象结构返回（来源→ID、ID→内容、ID→属性），供历史「思考过程」上下文查看。

**入参**：
- input：GetContextDetailInput（继承 Input），包含以下字段：
  - work_id：问答工作 ID（必选）
- context：GetContextDetailContext（继承 Context）
- output：GetContextDetailOutput（继承 Output），承载返回内容：
  - source_ids_map：采集来源 → info_id 列表（`Record<string, string[]>`）
  - content_map：info_id → 消息内容（`Record<string, string>`）
  - attribute_map：info_id → 消息属性（`Record<string, Record<string, unknown>>`）
  - total_context_count：上下文总条数（去重后内容条数）

**处理流程**：

1. 校验 `work_id` 非空，否则抛 ValidationError；
2. 调用 `InfoCore.soContextByWork({ work_id })` 查询三对象结构（由 InfoCore 从 `info_context_source` 表读来源关系，再回查 `info_raw` 补内容与属性）；
3. 将结果透传写入 output。

### 2.2. 配置（configAgentContext）

**功能**：配置 AgentContext 模块的参数

**入参**：
- input：ConfigAgentContextInput（继承 Input），包含以下字段：
  - max_context_items：最大上下文条目数（可选，正整数，默认 200；0 / 负数 / 非整数 / NaN 抛 ValidationError）
  - enable_snapshot_persistence：是否启用上下文快照持久化（可选，默认 true）
- context：ConfigAgentContextContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentContextOutput（继承 Output），承载返回内容：
  - max_context_items：当前生效的最大上下文条目数
  - enable_snapshot_persistence：当前生效的快照持久化开关

**处理流程**：

1. 校验 `max_context_items`（若传入）：必须为正整数，否则抛 ValidationError；
2. 调用 RelationDBProvider.selectOneDB 查询 `agent_context_config` 表获取当前配置；若不存在则自动创建默认配置行；
3. 若 `max_context_items` 非空：更新；若 `enable_snapshot_persistence` 非空：更新；
4. 调用 RelationDBProvider.updateDB 写入配置；
5. 返回更新后的配置写入 output。

## 3. 表设计

### 3.1. AgentContext 配置表

- 表名：agent_context_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| max_context_items | 最大上下文条目数 | INT | N | | 默认 200 |
| enable_snapshot_persistence | 是否启用快照持久化 | BOOL | N | | 默认 true |

> 原 `agent_context`（上下文快照表）与 `agent_context_item`（上下文详情表）已移除；上下文来源关系改由 InfoCoreProvider 的 `info_context_source` 表落盘（详见 INFOCore-PRD）。

## 4. 与 InfoCore 的关系

| 职责 | 归属 | 说明 |
|------|------|------|
| info 记录的 CRUD（content 存储） | InfoCore | AgentContext 不管理 info 内容 |
| 上下文检索与组装（context 算法） | InfoCore | InfoCore.context 是上下文构建的核心实现 |
| 上下文来源关系落盘（work_id → source → info_id） | InfoCore | InfoCore.context 内部写入 info_context_source 表 |
| 按 work_id 查询上下文（三对象） | InfoCore | InfoCore.soContextByWork |
| 历史上下文查询入口 | AgentContext | getContextDetail 委托 InfoCore.soContextByWork |
| 模块配置 | AgentContext | configAgentContext |

Agent 层各模块（AgentExecution、PlannerAgent、WriterAgent、IntentAgent 等）直接调用 `InfoCore.context`（须传入 `work_id`），上下文来源关系由 InfoCore 内部落盘；AgentContext 仅作为历史上下文查看的查询入口与配置管理。

## 5. 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时。
