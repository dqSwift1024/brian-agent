# Base / BookmarkProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## BookmarkAccess

源码：`brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `soTree` | `input: SoTreeInput, output: SoTreeOutput, context: BookmarkContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `soFlatFolders` | `input: SoFlatFoldersInput, output: SoFlatFoldersOutput, context: BookmarkContext, metri...` | `Promise<boolean>` | — |
| `addFolder` | `input: AddFolderInput, output: AddFolderOutput, context: BookmarkContext, metrics?: Met...` | `Promise<boolean>` | — |
| `addItem` | `input: AddItemInput, output: AddItemOutput, context: BookmarkContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `updateFolder` | `input: UpdateFolderInput, output: UpdateFolderOutput, context: BookmarkContext, metrics...` | `Promise<boolean>` | — |
| `updateItem` | `input: UpdateItemInput, output: UpdateItemOutput, context: BookmarkContext, metrics?: M...` | `Promise<boolean>` | — |
| `delFolder` | `input: DelFolderInput, output: DelFolderOutput, context: BookmarkContext, metrics?: Met...` | `Promise<boolean>` | — |
| `delItem` | `input: DelItemInput, output: DelItemOutput, context: BookmarkContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `moveItem` | `input: MoveItemInput, output: MoveItemOutput, context: BookmarkContext, metrics?: Metri...` | `Promise<boolean>` | — |
