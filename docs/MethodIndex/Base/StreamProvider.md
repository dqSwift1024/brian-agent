# Base / StreamProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## StreamAccess

源码：`brian-backend/Base/StreamProvider/access/StreamAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `registerStream` | `input: RegisterStreamInput, output: RegisterStreamOutput, _context: StreamContext, _met...` | `Promise<boolean>` | — |
| `pushStream` | `input: PushStreamInput<T>, _context: StreamContext, output: PushStreamOutput` | `Promise<boolean>` | — |
| `closeStream` | `input: CloseStreamInput, output: CloseStreamOutput, _context: StreamContext, _metrics?:...` | `Promise<boolean>` | — |
| `soStreamStats` | `_context: StreamContext, output: GetStreamStatsOutput` | `Promise<boolean>` | — |
| `configStream` | `input: ConfigStreamInput, output: ConfigStreamOutput, _context: StreamContext, _metrics...` | `Promise<boolean>` | — |
| `pushText` | `sessionId: string, event: string, text: string, meta?: { interact_id?: string; work_id?...` | `Promise<boolean>` | 推送打字机文本片段（自动 2-5 字符 chunk 切片） |
| `pushEvent` | `sessionId: string, event: string, msgType: SSEMessageType, data: T, meta?: { interact_i...` | `Promise<boolean>` | 推送结构化事件对象（DAG事件、上下文事件、Agent规格事件、控制事件等） |
