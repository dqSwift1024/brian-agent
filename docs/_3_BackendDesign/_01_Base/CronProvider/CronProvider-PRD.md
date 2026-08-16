# Cron Provider

## 1. 设计目标

1. 提供系统级的定时任务调度中心，统一管理所有需要定时执行的任务；
2. 通过发布订阅模型接收「定时时间（cron）」与「需要定时执行的接口（handler）」，在时间到达时触发执行；
3. 支持任务的启用/禁用、单次手动触发、执行历史记录（含执行时间、结果、错误信息）；
4. 与配置中心打通：定时任务的定时时间与配置页面中的 cron 配置项为同一时间源（CronProvider 为唯一数据源）。

## 2. 架构说明

CronProvider 位于 Base 层，采用 DDD 四层结构：

- `access/CronAccess.ts`：模块对外统一入口，分内部布线接口（registerTask / start / stop）与查询/更新接口（listCronTasks / getCronTask / setCronTask / setCronTaskEnabled / triggerCronTask / listCronTaskRuns）。
- `application/CronService.ts`：调度核心，维护 handler 注册表与调度循环（每秒 tick），执行任务并记录历史。
- `domain/types.ts`：类型定义（CronTaskRecord / CronTaskRunRecord 及各 Input/Output）。
- `infrastructure/CronSchemaInitializer.ts`：表结构初始化（cron_task / cron_task_run）。

依赖：RelationDBProvider（SQLite 持久化）、ToolProvider.CronUtils（cron 校验与下次执行时间计算）。

## 3. Cron 表达式

采用 6 字段 Quartz 风格：`秒 分 时 日 月 周`，各字段支持 `*`（任意）、单值、列表（`1,15,30`）、区间（`10-20`）、步长（`*/5`）。兼容 5 字段标准 cron（自动在最前补 `0` 作为秒字段）。

校验、生成、解析、下次执行时间计算由 `ToolProvider.CronUtils` 提供（`checkCron` / `generateCron` / `parseCron` / `nextRunTime`）。

## 4. 功能设计

### 4.1. 注册任务（registerTask）

发布订阅中的「订阅」。输入任务名、描述、默认 cron 与 handler；任务元数据持久化到 `cron_task` 表，handler 在进程内存注册。

### 4.2. 调度循环（start / stop）

启动后每秒 tick：对每个启用且 `next_run <= now` 的任务，推进 next_run 并异步执行 handler。重启后自动将已过期的 next_run 重新计算到未来。

### 4.3. 单次触发（triggerCronTask）

手动触发任务执行（测试用），执行结果写入执行历史，不推进 next_run。

### 4.4. 启用/禁用（setCronTaskEnabled）

切换任务启用状态，重新启用时重算 next_run。

### 4.5. 更新定时时间（setCronTask）

校验并更新 cron 表达式，重算 next_run。

### 4.6. 执行历史（listCronTaskRuns）

返回任务执行记录（开始/结束时间、耗时、状态 SUCCESS/FAILED、结果摘要、错误信息）。

## 5. 表设计

### 5.1. cron_task（SQLite）

| 字段名 | 含义 | 类型 | 是否可以为空 | 备注 |
| ------ | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | TEXT | N | 主键 |
| name | 任务名 | TEXT | N | 唯一索引 |
| description | 任务描述 | TEXT | N | 默认空串 |
| cron | 6 字段 cron 表达式 | TEXT | N | |
| enabled | 是否启用 | INTEGER | N | 1/0，默认 1 |
| last_run | 上次执行时间戳 | INTEGER | N | 0 表示未执行 |
| next_run | 下次执行时间戳 | INTEGER | N | 0 表示无 |
| created | 创建时间 | INTEGER | N | |
| updated | 更新时间 | INTEGER | N | |

### 5.2. cron_task_run（SQLite）

| 字段名 | 含义 | 类型 | 是否可以为空 | 备注 |
| ------ | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | TEXT | N | 主键 |
| task_id | 任务 ID | TEXT | N | 关联 cron_task.id |
| task_name | 任务名 | TEXT | N | |
| started_at | 开始执行时间戳 | INTEGER | N | |
| finished_at | 结束执行时间戳 | INTEGER | N | 运行中为 0 |
| status | 执行状态 | TEXT | N | SUCCESS / FAILED |
| result | 执行结果摘要 | TEXT | N | |
| error | 错误信息 | TEXT | N | 无错误为空串 |
| created | 记录创建时间 | INTEGER | N | |

## 6. HTTP 端点

| 方法 | 路径 | 说明 |
| ------ | ----- | ----- |
| GET | `/api/cron/tasks` | 列出全部定时任务 |
| GET | `/api/cron/tasks/:name` | 查询单个任务 |
| PUT | `/api/cron/tasks/:name` | 更新 cron（body: { cron }） |
| PUT | `/api/cron/tasks/:name/enabled` | 启用/禁用（body: { enabled }） |
| POST | `/api/cron/tasks/:name/trigger` | 单次触发 |
| GET | `/api/cron/tasks/:name/runs?limit=N` | 执行历史 |
| POST | `/api/tool/cron/check` | 校验 cron 表达式 |
| POST | `/api/tool/cron/generate` | 由秒/分/时/日/月/周字段生成表达式 |
| POST | `/api/tool/cron/parse` | 解析表达式为字段 |
| POST | `/api/tool/cron/next` | 计算下次执行时间 |

## 7. 内置定时任务

系统启动时注册以下任务（默认 cron 迁移自 self_learning_config 历史值，之后以 cron_task 表为唯一时间源）：

| 任务名 | 说明 | 默认 cron | handler |
| ------ | ----- | ----- | ----- |
| tag_aging | 标签老化 | `0 0 2 * * *`（每日 02:00） | SelfLearning.startTagAging |
| orphan_tag_check | 孤立标签检查 | `0 0 3 * * *`（每日 03:00） | SelfLearning.startOrphanTagCheck |

## 8. 重要内容

1. CronProvider 是定时时间的唯一数据源：配置中心的 `self_learning.tag_aging_cron` / `orphan_tag_check_cron` 配置项读写直接路由到 CronProvider，与定时任务展示页面保持同一时间；
2. handler 通过发布订阅在内存注册，任务元数据（cron、enabled）持久化到 SQLite；
3. 调度循环每秒 tick，任务按 next_run 预计算触发，避免每 tick 全量解析 cron；
4. 单次触发不影响 next_run，仅记录执行历史；
5. 所有日志通过注入的 logger 记录，禁止 console.log。
