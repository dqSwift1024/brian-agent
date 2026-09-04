# Orchestration / JSONNode 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## JSONNodeAccess

源码：`brian-backend/Orchestration/JSONNode/access/JSONNodeAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `getService` | `` | `JSONNodeService` | — |
| `execJSONNode` | `i: ExecJSONNodeInput, o: ExecJSONNodeOutput, c: JSONNodeContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `soJSONNodeTrace` | `i: GetJSONNodeTraceInput, o: GetJSONNodeTraceOutput, c: JSONNodeContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `registerNodeType` | `i: RegisterNodeTypeInput, o: RegisterNodeTypeOutput, c: JSONNodeContext, metrics?: Metr...` | `boolean` | — |
| `validate` | `i: ValidateJSONNodeInput, o: ValidateJSONNodeOutput, c: JSONNodeContext, metrics?: Metr...` | `boolean` | — |
| `configJSONNode` | `i: ConfigJSONNodeInput, o: ConfigJSONNodeOutput, c: JSONNodeContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `ensureEvalWorker` | `` | `Promise<void>` | 确保 orchestration.eval 队列存在常驻消费 Worker（启动期调用）。 |
