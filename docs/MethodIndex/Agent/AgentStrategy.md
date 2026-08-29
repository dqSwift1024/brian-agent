# Agent / AgentStrategy 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentStrategyAccess

源码：`brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `matchStrategy` | `i: MatchStrategyInput, o: MatchStrategyOutput, c: AgentStrategyContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soStrategyById` | `i: GetStrategyInput, o: GetStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `soStrategy` | `i: SoStrategyInput, o: SoStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `addStrategy` | `i: AddStrategyInput, o: AddStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `updateStrategy` | `i: UpdateStrategyInput, o: UpdateStrategyOutput, c: AgentStrategyContext, metrics?: Met...` | `Promise<boolean>` | — |
| `toggleStrategy` | `i: ToggleStrategyInput, o: ToggleStrategyOutput, c: AgentStrategyContext, metrics?: Met...` | `Promise<boolean>` | — |
| `configAgentStrategy` | `i: ConfigAgentStrategyInput, o: ConfigAgentStrategyOutput, c: AgentStrategyContext, met...` | `Promise<boolean>` | — |
