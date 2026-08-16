# ToolProvider（Base Tool）

## 1. 设计目标

1. 为 Base / Core / Agent / Orchestration / Application 全层提供统一的无状态工具能力；
2. 承载 ID 生成、JSON / XML 解析检查格式化压缩、正则表达式匹配等基础能力；
3. 禁止各层自行实现对 LLM 输出等非严格文本的 JSON / XML 容错解析（剥离 markdown 围栏、正则提取等分叉逻辑）；
4. 通过 HTTP API 向前端工具页面（`/tool`）暴露这些能力。

## 2. 模块位置

```
brian-backend/Base/ToolProvider/
├── index.ts                # 统一导出
├── access/ToolAccess.ts    # 对外入口（工具业务用例）
├── application/ToolService.ts  # 工具业务逻辑
├── domain/types.ts         # 返回类型定义
├── IdGenerator.ts          # UUID / 时间 / 日期
├── JsonParser.ts           # JSON 解析 / 提取 / 检查 / 格式化 / 压缩
└── XmlParser.ts            # XML 解析 / 提取 / 检查 / 格式化 / 压缩
```

通过 `@brian-agent/base` 导出：

```typescript
import { ToolAccess, IdGenerator, JsonParser, XmlParser } from '@brian-agent/base';
```

## 3. 接口

### IdGenerator

| 方法 | 返回 | 说明 |
|------|------|------|
| `IdGenerator.generate()` | `string` | UUID v4 |
| `IdGenerator.now()` | `number` | 毫秒级时间戳 |
| `IdGenerator.today()` | `string` | `YYYY-MM-DD` |

### JsonParser

| 方法 | 返回 | 说明 |
|------|------|------|
| `stripCodeFence(text)` | `string` | 剥离 markdown 代码围栏 |
| `parse(text)` | `unknown \| null` | 容错解析（对象 / 数组 / 原始值） |
| `parseObject(text)` | `Record<string, unknown> \| null` | 解析对象 |
| `parseArray(text)` | `unknown[] \| null` | 解析数组 |
| `extractObject(text)` | `string \| null` | 提取第一个 JSON 对象子串 |
| `extractArray(text)` | `string \| null` | 提取第一个 JSON 数组子串 |
| `check(text)` | `{ valid, error }` | 检查合法性 |
| `format(text, indent)` | `string \| null` | 格式化（美化） |
| `minify(text)` | `string \| null` | 压缩（单行） |

### XmlParser

| 方法 | 返回 | 说明 |
|------|------|------|
| `parse(text)` | `XmlNode \| null` | 解析为节点树 |
| `toObject(text)` | `Record<string, unknown> \| null` | 解析为普通对象（xml2js 风格） |
| `extract(text, tag)` | `string \| null` | 提取第一个指定标签内容 |
| `extractAll(text, tag)` | `string[]` | 提取所有指定标签内容 |
| `check(text)` | `{ valid, error }` | 检查合法性 |
| `format(text, indent)` | `string \| null` | 格式化（美化） |
| `minify(text)` | `string \| null` | 压缩（单行） |

### ToolAccess（对外业务入口）

| 方法 | 返回 | 说明 |
|------|------|------|
| `generateId()` | `string` | 生成一个 UUID |
| `generateIds(count)` | `string[]` | 批量生成 UUID（上限 1000） |
| `now()` | `number` | 当前毫秒时间戳 |
| `today()` | `string` | 当天日期 |
| `jsonCheck(text)` | `ToolCheckResult` | JSON 检查 |
| `jsonFormat(text, indent)` | `ToolTransformResult` | JSON 格式化 |
| `jsonMinify(text)` | `ToolTransformResult` | JSON 压缩 |
| `xmlCheck(text)` | `ToolCheckResult` | XML 检查 |
| `xmlFormat(text, indent)` | `ToolTransformResult` | XML 格式化 |
| `xmlMinify(text)` | `ToolTransformResult` | XML 压缩 |
| `regexMatch(pattern, text, flags)` | `ToolRegexResult` | 正则匹配 |
| `cronCheck(expr)` | `ToolCronCheckResult` | cron 表达式校验 |
| `cronGenerate(fields)` | `ToolCronGenerateResult` | 由秒/分/时/日/月/周字段生成表达式 |
| `cronParse(expr)` | `ToolCronParseResult` | 解析表达式为字段 |
| `cronNext(expr, fromMs)` | `ToolCronNextResult` | 计算下次执行时间 |

## 4. HTTP 路由

| 方法 | 路径 | 入参 | 说明 |
|------|------|------|------|
| POST | `/api/tool/id` | `{ count }` | 生成 ID（`count` 默认 1，上限 1000） |
| POST | `/api/tool/json/check` | `{ text }` | JSON 检查 |
| POST | `/api/tool/json/format` | `{ text, indent }` | JSON 格式化 |
| POST | `/api/tool/json/minify` | `{ text }` | JSON 压缩 |
| POST | `/api/tool/xml/check` | `{ text }` | XML 检查 |
| POST | `/api/tool/xml/format` | `{ text, indent }` | XML 格式化 |
| POST | `/api/tool/xml/minify` | `{ text }` | XML 压缩 |
| POST | `/api/tool/regex` | `{ pattern, text, flags }` | 正则匹配 |
| POST | `/api/tool/cron/check` | `{ expression }` | cron 校验 |
| POST | `/api/tool/cron/generate` | `{ second, minute, hour, day, month, week }` | 由字段生成 cron |
| POST | `/api/tool/cron/parse` | `{ expression }` | 解析 cron 为字段 |
| POST | `/api/tool/cron/next` | `{ expression, from_ms }` | 计算下次执行时间 |

## 5. 使用规范

1. LLM 结构化输出（Soul / Skill / MCP 等 Core 的 LLM 结果）解析一律使用 `JsonParser`，禁止手写 `JSON.parse` + 正则提取；
2. 生成表主键 `id` 与时间字段一律使用 `IdGenerator`，禁止各层自行实现 `uuid` / 时间戳分叉；
3. `XmlParser.toObject` 采用 xml2js 风格约定：文本写入 `#text`、属性写入 `@属性名`、子元素按标签名分组（单个为对象、多个为数组）；
4. `XmlParser` 为零依赖轻量实现（嵌套、自闭合、属性、CDATA、注释忽略、实体编解码），面向 LLM 输出等简单 XML 场景，非完整 W3C 规范实现。

## 6. 重要内容

1. ToolProvider 为**无状态纯工具模块**，不依赖数据库，无 SchemaInitializer，无需 `initialize()`；
2. 所有方法为静态方法或简单实例方法，不经过 AopProxy（纯工具函数，避免日志打印长文本）；
3. `JsonParser.parse` 的解析顺序：剥离围栏后直接 parse → 正则提取对象 → 正则提取数组，全部失败返回 null；
4. 正则匹配后端执行时对非法 pattern / flags 做了 try-catch 容错，返回 `valid: false` 而非抛异常。
