# Monitor Application

## 1. 设计目标

1. 聚合各层面组件（LLM Provider、MCP、RelationDB、GraphDB、VectorDB、MQ）的健康状态，提供统一健康检查入口；
2. 提供系统资源监控数据（CPU、内存、磁盘），供前端监控面板展示；
3. 提供 Token 使用趋势和模型分布统计数据；
4. 提供日志查询、日志统计和实时日志流能力；
5. 作为 Application 层模块，通过 `/api/monitor/*` 对外暴露 HTTP 接口。

## 2. 模块职责

Monitor Application 是系统可观测性的统一入口，位于 Application 层。它聚合 Base 层各 Provider 的 `visualized*` 方法和 `call_history` 表的 Token 使用数据，并通过 LogProvider 的 SQLite 持久化能力提供日志查询服务。

### 依赖关系

| 依赖层级 | 模块 | 用途 |
|---------|------|------|
| Base | RelationDBProvider | 关系数据库健康检查、call_history 查询 |
| Base | LogProvider | 日志查询和统计（SQLite 持久化模式） |
| Base | LLMProvider | LLM 提供商健康状态 |
| Base | MCPProvider | MCP 服务健康状态 |
| Base | GraphDBProvider | 图数据库健康状态 |
| Base | VectorDBProvider | 向量数据库健康状态 |
| Base | MQProvider | 消息队列健康状态 |
| System | Node.js os 模块 | CPU、内存、负载信息 |
| System | Node.js fs 模块 | 磁盘使用信息 |

## 3. HTTP 端点设计

### 3.1. 组件健康检查 (`GET /api/monitor/health-all`)

**输出**：
```json
{
  "status": "healthy",
  "uptime": 1234,
  "components": [
    {
      "name": "RelationDB", "status": "healthy", "message": "0ms",
      "details": { "数据表": 114, "记录总数": 2989 }
    },
    {
      "name": "GraphDB", "status": "healthy", "message": "2ms",
      "details": { "节点": 0, "边": 0 }
    },
    {
      "name": "VectorDB", "status": "healthy", "message": "1ms",
      "details": { "向量": 0, "维度": 768 }
    },
    {
      "name": "LLM Provider", "status": "healthy", "message": "0ms",
      "details": { "提供商": 14, "启用模型": 2 }
    },
    { "name": "MCP", "status": "healthy", "message": "1 个实例", "details": { "实例": 1 } },
    {
      "name": "MQ", "status": "healthy", "message": "0 条消息",
      "details": { "待处理": 0, "处理中": 0, "完成": 0, "失败": 0 }
    }
  ]
}
```

**状态取值**：顶层 `status` 与组件 `status` 均为 `healthy`（绿色）/ `degraded`（黄色）/ `unhealthy`（红色）。`uptime` 为服务运行秒数（`process.uptime()`）。

**检查方式**：RelationDB 执行 `SELECT 1` 并统计数据表数/记录总数；GraphDB/VectorDB/LLM Provider 调用各自 `visualized*(scope='health')` 探测连接，再调用 `visualized*(scope='volume')` 统计数据量；MCP 调用 `soMcp` 查询实例数；MQ 调用 `getQueueStats` 查询队列统计。任一组件检查抛错即 `unhealthy`，组件禁用则 `degraded`。

### 3.2. 系统资源监控 (`GET /api/monitor/resources`)

**输出**：
```json
{
  "cpu": {
    "usage": 45.5,
    "cores": 8,
    "load1": 2.1,
    "load5": 1.8,
    "load15": 1.5
  },
  "memory": {
    "usage": 68.2,
    "used": 8192,
    "total": 12000
  },
  "disk": {
    "usage": 55.0,
    "used": 51200,
    "total": 93151,
    "dataDirUsage": 55.0
  },
  "timestamp": 1234567890000
}
```

**颜色阈值**：< 70% 绿色，70-90% 黄色，> 90% 红色

### 3.3. Token 趋势数据 (`GET /api/analytics/token-trend`)

**输出**：
```json
{
  "points": [
    { "date": "2026-08-02", "tokens": 0 },
    { "date": "2026-08-16", "tokens": 742 }
  ]
}
```

**数据来源**：按 `usage_date` 聚合 `llm_usage` 表的 `SUM(input_tokens + output_tokens)`，按日期升序返回。

### 3.4. 模型用量分布 (`GET /api/analytics/model-distribution`)

**输出**：
```json
{
  "models": [
    { "model": "deepseek-v4-flash-ga-260731", "type": "text", "tokens": 742, "deleted": false },
    { "model": "nomic-embed-text-v1.5.Q4_K_M.gguf", "type": "embedding", "tokens": 0, "deleted": false }
  ]
}
```

**数据来源**：按模型聚合 token 用量（`llm_usage` LEFT JOIN `llm_available` 取模型名与类型，无对应模型时 `model` 回退为 `llm_available_id`、`type` 回退为 `deleted`），按 token 降序返回。`type` 取值为 text / vision / embedding / deleted。

### 3.5. 日志查询 (`GET /api/monitor/logs/query`)

**入参**（Query String）：
- `level`（STRING，可选）：日志级别（DEBUG / INFO / WARN / ERROR）
- `source`（STRING，可选）：日志来源模块（LIKE 匹配）
- `keyword`（STRING，可选）：关键词搜索（匹配 message，SQL LIKE）
- `trace_id`（STRING，可选）：按请求追踪 ID 搜索（LIKE 匹配）
- `log_source`（STRING，可选）：消息来源类型（AOP / MANUAL / SYSTEM，匹配 metadata.log_source）
- `start_time`（INT，可选）：起始时间（毫秒时间戳）
- `end_time`（INT，可选）：结束时间（毫秒时间戳）
- `page`（INT，可选）：页码，默认 1
- `pageSize` / `limit`（INT，可选）：每页条数，默认 50

**输出**：
```json
{
  "entries": [
    {
      "id": "log-uuid",
      "timestamp": 1234567890000,
      "level": "error",
      "source": "LLMService",
      "message": "soLLM done",
      "trace_id": "",
      "caller": ""
    }
  ],
  "total": 5000,
  "page": 1,
  "pageSize": 50
}
```

### 3.6. 日志级别分布统计 (`GET /api/monitor/logs/stats`)

**入参**（Query String）：
- `start_time`（INT，可选）
- `end_time`（INT，可选）

**输出**：
```json
{
  "distribution": [
    { "level": "INFO", "count": 12000 },
    { "level": "ERROR", "count": 50 },
    { "level": "WARN", "count": 200 },
    { "level": "DEBUG", "count": 5000 }
  ]
}
```

## 4. 表设计

Monitor 模块本身不维护独立数据表。Token 统计使用 `llm_usage` 表（由 LLMProvider 维护，含 `input_tokens`/`output_tokens` 列），日志查询使用 `log_record` 表（由 LogProvider 管理）。

## 5. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 组件健康状态卡片 | `GET /api/monitor/health-all` | 6 组件状态 + 响应时间 |
| 主机资源卡片 | `GET /api/monitor/resources` | CPU/内存/磁盘使用率 |
| Token 统计卡片 | `GET /api/analytics/token-usage` | 今日/月度 Token + 请求数 |
| Token 趋势图 | `GET /api/analytics/token-trend` | 7/30/90 天折线图数据 |
| 模型分布图 | `GET /api/analytics/model-distribution` | 按模型 Token 消耗柱状图 |
| 日志查看器筛选 | `GET /api/monitor/logs/query` | 按级别/来源/关键词/时间查询 |
| 日志级别分布 | `GET /api/monitor/logs/stats` | 迷你柱状图数据 |
| 日志实时推送 | SSE `GET /api/monitor/logs/stream` | 待后续实现 |
| 告警横幅 | 前端根据 health-all 和 resources 数据自行判断 | 无独立接口 |
| 自动刷新 | 前端 30s 轮询 | 见各端点 |

## 6. 重要内容

1. Monitor Application 不直接操作 Provider，通过现有的 `systemRoutes`（系统资源）、`analyticsRoutes`（Token 统计）和新增的 `monitorRoutes`（健康检查 + 日志查询）实现；
2. 日志查询依赖 LogProvider 的 SQLite 持久化模式（`write_mode=BOTH`）；
3. 系统资源数据通过 Node.js `os` 和 `fs` 模块实时获取，不缓存；
4. Token 统计通过 `llm_usage` 表的 SQL 聚合查询实现（`SUM(input_tokens + output_tokens)`）；
5. 健康检查为真实探测：RelationDB `SELECT 1`、GraphDB/VectorDB/LLM Provider `visualized*(scope='health')`、MCP `soMcp`、MQ `getQueueStats`，不再使用静态状态标识；
6. 告警逻辑（CPU >90%、ERROR 日志频率等）由前端根据接口返回值自行判断，后端不内置告警阈值。
