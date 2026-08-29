# Base / CronProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## CronAccess

源码：`brian-backend/Base/CronProvider/access/CronAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `registerTask` | `name: string, description: string | undefined, defaultCron: string, handler: CronHandler` | `Promise<void>` | 订阅定时任务：注册 name / 默认 cron / handler |
| `start` | `` | `void` | 启动调度循环 |
| `stop` | `` | `void` | 停止调度循环 |
| `listCronTasks` | `_input: ListCronTasksInput, output: ListCronTasksOutput, _context: CronContext, _metric...` | `Promise<boolean>` | — |
| `soCronTask` | `input: GetCronTaskInput, output: GetCronTaskOutput, _context: CronContext, metrics?: Me...` | `Promise<boolean>` | — |
| `setCronTask` | `input: SetCronTaskInput, output: SetCronTaskOutput, _context: CronContext, metrics?: Me...` | `Promise<boolean>` | — |
| `setCronTaskEnabled` | `input: SetCronTaskEnabledInput, output: SetCronTaskEnabledOutput, _context: CronContext...` | `Promise<boolean>` | — |
| `triggerCronTask` | `input: TriggerCronTaskInput, output: TriggerCronTaskOutput, _context: CronContext, metr...` | `Promise<boolean>` | — |
| `listCronTaskRuns` | `input: ListCronTaskRunsInput, output: ListCronTaskRunsOutput, _context: CronContext, me...` | `Promise<boolean>` | — |
