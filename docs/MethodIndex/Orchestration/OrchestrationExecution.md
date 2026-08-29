# Orchestration / OrchestrationExecution 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## OrchestrationExecutionAccess

源码：`brian-backend/Orchestration/OrchestrationExecution/access/OrchestrationExecutionAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `buildAgentDAG` | `i: BuildAgentDAGInput, o: BuildAgentDAGOutput, c: OrchestrationExecutionContext, metric...` | `Promise<boolean>` | — |
| `execSingleAgent` | `i: ExecSingleAgentInput, o: ExecSingleAgentOutput, c: OrchestrationExecutionContext, me...` | `Promise<boolean>` | — |
| `execDAG` | `i: ExecDAGInput, o: ExecDAGOutput, c: OrchestrationExecutionContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `recordSystemAgentExecution` | `i: RecordSystemAgentExecutionInput, o: RecordSystemAgentExecutionOutput, c: Orchestrati...` | `Promise<boolean>` | — |
| `execDAGAsync` | `i: ExecDAGAsyncInput, o: ExecDAGAsyncOutput, c: OrchestrationExecutionContext, metrics?...` | `Promise<boolean>` | — |
| `soDAGProgress` | `i: GetDAGProgressInput, o: GetDAGProgressOutput, c: OrchestrationExecutionContext, metr...` | `Promise<boolean>` | — |
| `cancelExecution` | `i: CancelExecutionInput, o: CancelExecutionOutput, c: OrchestrationExecutionContext, me...` | `Promise<boolean>` | — |
| `soExecQueueStatus` | `i: GetOrchestrationExecQueueStatusInput, o: GetOrchestrationExecQueueStatusOutput, c: O...` | `Promise<boolean>` | — |
| `configOrchestrationExecution` | `i: ConfigOrchestrationExecutionInput, o: ConfigOrchestrationExecutionOutput, c: Orchest...` | `Promise<boolean>` | — |
