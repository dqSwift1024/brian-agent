# Base / ToolProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## HttpAccess

源码：`brian-backend/Base/ToolProvider/access/HttpAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `execRequest` | `input: ExecRequestInput, output: ExecRequestOutput, _context: HttpContext, _metrics?: M...` | `Promise<boolean>` | 发送 HTTP 请求。 |

## SystemMonitorAccess

源码：`brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `soCpuUsage` | `_input: SoCpuUsageInput, output: SoCpuUsageOutput, _context: SystemMonitorContext, _met...` | `Promise<boolean>` | 采集 CPU 使用率（%） |
| `soMemoryUsage` | `_input: SoMemoryUsageInput, output: SoMemoryUsageOutput, _context: SystemMonitorContext...` | `Promise<boolean>` | 采集内存使用率（%） |
| `soDiskUsage` | `input: SoDiskUsageInput, output: SoDiskUsageOutput, _context: SystemMonitorContext, _me...` | `Promise<boolean>` | 采集磁盘使用率（%） |
| `soResource` | `input: SoResourceInput, output: SoResourceOutput, _context: SystemMonitorContext, _metr...` | `Promise<boolean>` | 一次性采集 CPU / 内存 / 磁盘使用率 |

## ToolAccess

源码：`brian-backend/Base/ToolProvider/access/ToolAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `generateId` | `_input: GenerateIdInput, output: GenerateIdOutput, _context: ToolContext, _metrics?: Me...` | `Promise<boolean>` | 生成一个 UUID v4 |
| `generateIds` | `input: GenerateIdsInput, output: GenerateIdsOutput, _context: ToolContext, _metrics?: M...` | `Promise<boolean>` | 批量生成指定数量的 UUID |
| `now` | `_input: NowInput, output: NowOutput, _context: ToolContext, _metrics?: Metrics, _report...` | `Promise<boolean>` | 当前毫秒时间戳 |
| `today` | `_input: TodayInput, output: TodayOutput, _context: ToolContext, _metrics?: Metrics, _re...` | `Promise<boolean>` | 当天日期（YYYY-MM-DD） |
| `jsonCheck` | `input: JsonCheckInput, output: JsonCheckOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | 检查 JSON 合法性 |
| `jsonFormat` | `input: JsonFormatInput, output: JsonFormatOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | 格式化（美化）JSON |
| `jsonMinify` | `input: JsonMinifyInput, output: JsonMinifyOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | 压缩（minify）JSON |
| `xmlCheck` | `input: XmlCheckInput, output: XmlCheckOutput, _context: ToolContext, _metrics?: Metrics...` | `Promise<boolean>` | 检查 XML 合法性 |
| `xmlFormat` | `input: XmlFormatInput, output: XmlFormatOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | 格式化（美化）XML |
| `xmlMinify` | `input: XmlMinifyInput, output: XmlMinifyOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | 压缩（minify）XML |
| `regexMatch` | `input: RegexMatchInput, output: RegexMatchOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | 正则表达式匹配 |
| `cronCheck` | `input: CronCheckInput, output: CronCheckOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | 校验 cron 表达式 |
| `cronGenerate` | `input: CronGenerateInput, output: CronGenerateOutput, _context: ToolContext, _metrics?:...` | `Promise<boolean>` | 由字段生成 cron 表达式 |
| `cronParse` | `input: CronParseInput, output: CronParseOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | 解析 cron 表达式为字段 |
| `cronNext` | `input: CronNextInput, output: CronNextOutput, _context: ToolContext, _metrics?: Metrics...` | `Promise<boolean>` | 计算 cron 下次执行时间 |
