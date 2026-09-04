# Orchestration / OrchestrationStrategy 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## OrchestrationStrategyAccess

源码：`brian-backend/Orchestration/OrchestrationStrategy/access/OrchestrationStrategyAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `startOrchestration` | `i: StartOrchestrationInput, o: StartOrchestrationOutput, c: OrchestrationStrategyContex...` | `Promise<boolean>` | — |
| `executeSimpleStrategy` | `i: ExecuteSimpleStrategyInput, o: ExecuteSimpleStrategyOutput, c: OrchestrationStrategy...` | `Promise<boolean>` | — |
| `executePlanningStrategy` | `i: ExecutePlanningStrategyInput, o: ExecutePlanningStrategyOutput, c: OrchestrationStra...` | `Promise<boolean>` | — |
| `executePostProcessing` | `i: ExecutePostProcessingInput, o: ExecutePostProcessingOutput, c: OrchestrationStrategy...` | `Promise<boolean>` | — |
| `addStrategy` | `i: AddOrchestrationStrategyInput, o: AddOrchestrationStrategyOutput, c: OrchestrationSt...` | `Promise<boolean>` | — |
| `handleDAGFailure` | `i: HandleDAGFailureInput, o: HandleDAGFailureOutput, c: OrchestrationStrategyContext, m...` | `Promise<boolean>` | — |
| `soStrategyById` | `i: GetOrchestrationStrategyInput, o: GetOrchestrationStrategyOutput, c: OrchestrationSt...` | `Promise<boolean>` | — |
| `updateStrategy` | `i: UpdateOrchestrationStrategyInput, o: UpdateOrchestrationStrategyOutput, c: Orchestra...` | `Promise<boolean>` | — |
| `configOrchestrationStrategy` | `i: ConfigOrchestrationStrategyInput, o: ConfigOrchestrationStrategyOutput, c: Orchestra...` | `Promise<boolean>` | — |
