# Agent / AgentBuilder 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentBuilderAccess

源码：`brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `buildAgent` | `i: BuildAgentInput, o: BuildAgentOutput, c: AgentBuilderContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `optimizeAgent` | `i: OptimizeAgentInput, o: OptimizeAgentOutput, c: AgentBuilderContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `buildSystemAgent` | `i: BuildSystemAgentInput, o: BuildSystemAgentOutput, c: AgentBuilderContext, metrics?: ...` | `Promise<boolean>` | — |
| `configAgentBuilder` | `i: ConfigAgentBuilderInput, o: ConfigAgentBuilderOutput, c: AgentBuilderContext, metric...` | `Promise<boolean>` | — |
