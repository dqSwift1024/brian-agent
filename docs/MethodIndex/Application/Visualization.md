# Application / Visualization 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## VisualizationAccess

源码：`brian-backend/Application/Visualization/access/VisualizationAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `soVisualizedMessages` | `i: GetVisualizedMessagesInput, o: GetVisualizedMessagesOutput, c: VisualizationContext,...` | `Promise<boolean>` | — |
| `soVisualizedMessageGraph` | `i: GetVisualizedMessageGraphInput, o: GetVisualizedMessageGraphOutput, c: Visualization...` | `Promise<boolean>` | — |
| `soVisualizedAgentDAG` | `i: GetVisualizedAgentDAGInput, o: GetVisualizedAgentDAGOutput, c: VisualizationContext,...` | `Promise<boolean>` | — |
| `soVisualizedWorkFlow` | `i: GetVisualizedWorkFlowInput, o: GetVisualizedWorkFlowOutput, c: VisualizationContext,...` | `Promise<boolean>` | — |
| `soAgentTrace` | `i: GetAgentTraceInput, o: GetAgentTraceOutput, c: VisualizationContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soVisualizedMessageDAG` | `i: GetVisualizedMessageDAGInput, o: GetVisualizedMessageDAGOutput, c: VisualizationCont...` | `Promise<boolean>` | — |
| `soResource` | `i: GetResourceInput, o: GetResourceOutput, c: VisualizationContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `configVisualization` | `i: ConfigVisualizationInput, o: ConfigVisualizationOutput, c: VisualizationContext, met...` | `Promise<boolean>` | — |
| `soGraphVisualizationConfig` | `i: GraphVisualizationConfigInput, o: GraphVisualizationConfigOutput, c: VisualizationCo...` | `Promise<boolean>` | — |
