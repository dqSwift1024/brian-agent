# Core / MQCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## MQCoreAccess

源码：`brian-backend/Core/MQCoreProvider/access/MQCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `startWorker` | `input: StartWorkerInput, output: StartWorkerOutput, context: MQCoreContext, metrics?: M...` | `Promise<boolean>` | 启动一个轮询消费工作器 |
| `stopWorker` | `input: StopWorkerInput, output: StopWorkerOutput, context: MQCoreContext, metrics?: Met...` | `Promise<boolean>` | 停止工作器（按 ID 或队列名称） |
| `soWorker` | `input: SoWorkerInput, output: SoWorkerOutput, context: MQCoreContext, metrics?: Metrics...` | `Promise<boolean>` | 查询运行中的工作器 |
