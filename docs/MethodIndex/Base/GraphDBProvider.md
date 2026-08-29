# Base / GraphDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## GraphDBAccess

源码：`brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `addGraphNode` | `input: AddGraphNodeInput, output: AddGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 新增节点（幂等：content 相同则返回已存在节点 ID） |
| `soGraphNode` | `input: GetGraphNodeInput, output: GetGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 获取节点 |
| `updateGraphNode` | `input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, context: GraphContext, metr...` | `Promise<boolean>` | 更新节点 |
| `delGraphNode` | `input: DelGraphNodeInput, output: DelGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 删除节点（级联删除关联边与激活数据） |
| `addGraphEdge` | `input: AddGraphEdgeInput, output: AddGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 新增边（校验端点节点存在） |
| `soGraphEdge` | `input: GetGraphEdgeInput, output: GetGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 获取边 |
| `updateGraphEdge` | `input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, context: GraphContext, metr...` | `Promise<boolean>` | 更新边（端点变更时校验新节点存在） |
| `delGraphEdge` | `input: DelGraphEdgeInput, output: DelGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 删除边（清理关联激活数据） |
| `selectGraph` | `input: SelectGraphInput, output: SelectGraphOutput, context: GraphContext, metrics?: Me...` | `Promise<boolean>` | 查询图数据（节点或边） |
| `soGraphNeighbors` | `input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, context: GraphContext, ...` | `Promise<boolean>` | 获取邻居节点（多跳遍历） |
| `computeEdgeWeight` | `edgeId: string, hopDistance: number` | `Promise<number>` | 计算边的复合权重（静态相似度 + 动态活跃度 + 跳衰减） |
| `activateGraphEdge` | `input: ActivateGraphEdgeInput, output: ActivateGraphEdgeOutput, context: GraphContext, ...` | `Promise<boolean>` | 激活边（记录事件、按天累计、更新边状态） |
| `ageGraphEdge` | `input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 老化边（基于保留窗口判定、清理过期数据） |
| `visualizedGraph` | `input: VisualizedGraphInput, output: VisualizedGraphOutput, context: GraphContext, metr...` | `Promise<boolean>` | 可视化数据 |
| `enableGraphDB` | `input: EnableGraphDBInput, output: EnableGraphDBOutput, context: GraphContext, metrics?...` | `Promise<boolean>` | 启用/禁用图数据库 |
| `closeGraphDB` | `input: CloseGraphDBInput, output: CloseGraphDBOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | 关闭图数据库连接（终态操作） |
