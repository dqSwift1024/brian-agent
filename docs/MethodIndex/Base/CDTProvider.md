# Base / CDTProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## CDTAccess

源码：`brian-backend/Base/CDTProvider/access/CDTAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `startCDT` | `i: StartCDTInput, o: StartCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report` | `void` | — |
| `stopCDT` | `i: StopCDTInput, o: StopCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soCDTEndpoint` | `i: GetCDTEndpointInput, o: GetCDTEndpointOutput, c: CDTContext, metrics?: Metrics, repo...` | `void` | — |
| `execCDP` | `i: ExecCDPInput, o: ExecCDPOutput, c: CDTContext, metrics?: Metrics, report?: Report` | `void` | — |
| `isCDTRunning` | `i: IsCDTRunningInput, o: IsCDTRunningOutput, c: CDTContext, metrics?: Metrics, report?:...` | `void` | — |
| `startScreencast` | `maxWidth: unknown, maxHeight: unknown, quality: unknown` | `Promise<boolean>` | — |
| `getLatestFrame` | `` | `string` | — |
| `getLatestFrameDimensions` | `` | `{ width: number; height: number }` | — |
| `sendMouseEvent` | `type: string, x: number, y: number, button: unknown, clickCount: unknown, deltaX: unkno...` | `void` | — |
| `sendKeyEvent` | `type: string, text: unknown, key: unknown, ctrl: unknown, alt: unknown, shift: unknown,...` | `void` | — |
| `sendKeyBatch` | `events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolea...` | `void` | — |
| `insertText` | `text: string` | `void` | — |
| `injectAntiDetection` | `env?: import('../domain/types').CDTEnv` | `void` | — |
