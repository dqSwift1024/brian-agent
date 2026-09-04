# Orchestration / OrchestrationEntry 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## OrchestrationEntryAccess

源码：`brian-backend/Orchestration/OrchestrationEntry/access/OrchestrationEntryAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `receiveWork` | `i: ReceiveWorkInput, o: ReceiveWorkOutput, c: OrchestrationEntryContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `selectOrchestrationStrategy` | `i: SelectOrchestrationStrategyInput, o: SelectOrchestrationStrategyOutput, c: Orchestra...` | `Promise<boolean>` | — |
| `receiveWorkAsync` | `i: ReceiveWorkAsyncInput, o: ReceiveWorkAsyncOutput, c: OrchestrationEntryContext, metr...` | `Promise<boolean>` | — |
| `buildWorkContext` | `i: BuildWorkContextInput, o: BuildWorkContextOutput, c: OrchestrationEntryContext, metr...` | `Promise<boolean>` | — |
| `soWorkStatus` | `i: GetWorkStatusInput, o: GetWorkStatusOutput, c: OrchestrationEntryContext, metrics?: ...` | `Promise<boolean>` | — |
| `cancelWork` | `i: CancelWorkInput, o: CancelWorkOutput, c: OrchestrationEntryContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `confirmIntent` | `i: ConfirmIntentInput, o: ConfirmIntentOutput, c: OrchestrationEntryContext, metrics?: ...` | `Promise<boolean>` | — |
| `submitClarification` | `i: SubmitClarificationInput, o: SubmitClarificationOutput, c: OrchestrationEntryContext...` | `Promise<boolean>` | — |
| `configOrchestrationEntry` | `i: ConfigOrchestrationEntryInput, o: ConfigOrchestrationEntryOutput, c: OrchestrationEn...` | `Promise<boolean>` | — |
