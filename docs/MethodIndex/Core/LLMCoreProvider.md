# Core / LLMCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LLMCoreAccess

源码：`brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置。 |
| `matchLLM` | `input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, metrics?: Metric...` | `Promise<boolean>` | 为指定 Agent 匹配合适的 LLM 提供商。 |
| `limitLLM` | `input: LimitLLMInput, output: LimitLLMOutput, context: LLMCoreContext, metrics?: Metric...` | `Promise<boolean>` | 为指定 LLM 提供商设置配额限制（upsert）。 |
| `checkLLMQuota` | `input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, context: LLMCoreContext, metric...` | `Promise<boolean>` | 检查指定提供商的配额使用情况。 |
| `configLLMCore` | `input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, context: LLMCoreContext, metric...` | `Promise<boolean>` | 获取当前 LLMCore 配置。 |
| `recordLLMUsage` | `input: RecordLLMUsageInput, output: RecordLLMUsageOutput, context: LLMCoreContext, metr...` | `Promise<boolean>` | 记录一次 LLM 用量的使用条目供配额统计。 |
