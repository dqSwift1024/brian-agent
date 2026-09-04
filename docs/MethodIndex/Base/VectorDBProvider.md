# Base / VectorDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## VectorDBAccess

源码：`brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `dimension?: number` | `Promise<void>` | 初始化组件：先创建配置表、写默认值、恢复存储的 metric，再初始化 LanceDB。 |
| `soVectorCount` | `` | `Promise<number>` | 获取当前向量总数（用于判断是否存在数据） |
| `getMetric` | `` | `string` | 获取当前度量方式 |
| `getDimension` | `` | `number` | 获取当前向量维度 |
| `applyDimension` | `dimension: number` | `Promise<void>` | 运行时应用新的向量维度（供配置中心修改 info_core.vector_config.dimension 时调用）。 |
| `applyMetric` | `metric: string` | `Promise<void>` | 运行时应用新的距离度量方式（供配置中心修改 default_distance_metric 时调用）。 |
| `addVector` | `input: AddVectorInput, output: AddVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | 新增/更新向量（upsert） |
| `delVector` | `input: DelVectorInput, output: DelVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | 删除向量（按 ID 批量） |
| `delVectorByFilter` | `input: DelVectorByFilterInput, output: DelVectorByFilterOutput, context: VectorContext,...` | `Promise<boolean>` | 按条件删除向量 |
| `soVector` | `input: SoVectorInput, output: SoVectorOutput, context: VectorContext, metrics?: Metrics...` | `Promise<boolean>` | 搜索向量（相似度搜索） |
| `soVectorById` | `input: GetVectorInput, output: GetVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | 获取向量（按 ID） |
| `countVector` | `input: CountVectorInput, output: CountVectorOutput, context: VectorContext, metrics?: M...` | `Promise<boolean>` | 统计向量数量 |
| `visualizedVector` | `input: VisualizedVectorInput, output: VisualizedVectorOutput, context: VectorContext, m...` | `Promise<boolean>` | 可视化数据 |
| `enableVectorDB` | `input: EnableVectorDBInput, output: EnableVectorDBOutput, context: VectorContext, metri...` | `Promise<boolean>` | 启用/禁用向量数据库 |
| `closeVectorDB` | `input: CloseVectorDBInput, output: CloseVectorDBOutput, context: VectorContext, metrics...` | `Promise<boolean>` | 关闭向量数据库连接（终态操作） |
