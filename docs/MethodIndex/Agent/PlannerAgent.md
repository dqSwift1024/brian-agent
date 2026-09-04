# Agent / PlannerAgent 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## PlannerAgentAccess

源码：`brian-backend/Agent/PlannerAgent/access/PlannerAgentAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `execPlan` | `i: PlanInput, o: PlanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report` | `Promise<boolean>` | — |
| `planHierarchical` | `i: PlanHierarchicalInput, o: PlanHierarchicalOutput, c: PlannerAgentContext, metrics?: ...` | `Promise<boolean>` | — |
| `replan` | `i: ReplanInput, o: ReplanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | — |
| `soPlan` | `i: GetPlanInput, o: GetPlanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: ...` | `Promise<boolean>` | — |
| `configPlannerAgent` | `i: ConfigPlannerAgentInput, o: ConfigPlannerAgentOutput, c: PlannerAgentContext, metric...` | `Promise<boolean>` | — |
