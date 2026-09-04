# Agent / WriterAgent 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## WriterAgentAccess

源码：`brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `execWrite` | `i: WriteInput, o: WriteOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report` | `Promise<boolean>` | — |
| `saveUserProfile` | `i: SaveUserProfileInput, o: SaveUserProfileOutput, c: WriterAgentContext, metrics?: Met...` | `Promise<boolean>` | — |
| `soUserProfile` | `i: GetUserProfileInput, o: GetUserProfileOutput, c: WriterAgentContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `configWriterAgent` | `i: ConfigWriterAgentInput, o: ConfigWriterAgentOutput, c: WriterAgentContext, metrics?:...` | `Promise<boolean>` | — |
