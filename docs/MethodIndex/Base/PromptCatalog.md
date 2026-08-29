# Base / PromptCatalog 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## PromptCatalogAccess

源码：`brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `seed` | `` | `Promise<void>` | 幂等写入全部内置 Prompt（存在则更新标题/摘要/模板，不存在则插入）。 |
