# Base / MQProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## MQAccess

源码：`brian-backend/Base/MQProvider/access/MQAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `sendMQ` | `input: SendMQInput, output: SendMQOutput, context: MQContext, metrics?: Metrics, report...` | `Promise<boolean>` | 发送消息 |
| `consumeMQ` | `input: ConsumeMQInput, output: ConsumeMQOutput, context: MQContext, metrics?: Metrics, ...` | `Promise<boolean>` | 消费消息 |
| `ackMQ` | `input: AckMQInput, output: AckMQOutput, context: MQContext, metrics?: Metrics, report?:...` | `Promise<boolean>` | 确认消息 |
| `nackMQ` | `input: NackMQInput, output: NackMQOutput, context: MQContext, metrics?: Metrics, report...` | `Promise<boolean>` | 否认消息 |
| `soQueueStats` | `input: GetQueueStatsInput, output: GetQueueStatsOutput, context: MQContext, metrics?: M...` | `Promise<boolean>` | 获取队列统计 |
| `enableMQ` | `input: EnableMQInput, output: EnableMQOutput, context: MQContext, metrics?: Metrics, re...` | `Promise<boolean>` | 启用/禁用 MQ 组件 |
| `closeMQ` | `input: CloseMQInput, output: CloseMQOutput, context: MQContext, metrics?: Metrics, repo...` | `Promise<boolean>` | 关闭 MQ 组件（终态释放，不可恢复） |
| `cleanupExpiredMessages` | `` | `Promise<number>` | 清理过期消息（COMPLETED/FAILED 超过 message_ttl） |
| `recoverStuckMessages` | `queue?: string` | `Promise<number>` | 恢复卡住的 PROCESSING 超时消息为 PENDING |
| `replayMQ` | `messageId: string` | `Promise<boolean>` | 重新入队失败消息（死信重放） |
