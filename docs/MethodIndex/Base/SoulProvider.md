# Base / SoulProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SoulAccess

源码：`brian-backend/Base/SoulProvider/access/SoulAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `addSoul` | `input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | 新增 Soul |
| `delSoul` | `input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | 删除 Soul |
| `updateSoul` | `input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metri...` | `Promise<boolean>` | 更新 Soul |
| `soSoulById` | `input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | 获取 Soul |
| `soSoul` | `input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, repo...` | `Promise<boolean>` | 搜索 Soul |
| `enableSoul` | `input: EnableSoulInput, output: EnableSoulOutput, context: SoulContext, metrics?: Metri...` | `Promise<boolean>` | 启用/禁用 Soul 组件 |
| `closeSoul` | `input: CloseSoulInput, output: CloseSoulOutput, context: SoulContext, metrics?: Metrics...` | `Promise<boolean>` | 关闭 Soul 组件（终态操作） |
| `recordSoulUsage` | `input: RecordSoulUsageInput, output: RecordSoulUsageOutput, context: SoulContext, metri...` | `Promise<boolean>` | 记录 Soul 使用次数（upsert） |
