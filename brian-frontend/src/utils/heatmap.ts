/**
 * @fileoverview 信息页热力图（历史/记忆页签）共享的日期键工具。
 *
 * 日期键格式与时间线分组保持一致：`年-月-日`（月为 0 基，如 2026-7-24 表示 8 月 24 日），
 * 由后端 date-counts 接口按客户端时区返回同格式键。
 */

/** 客户端相对 UTC 的东偏分钟数（如东八区为 480），供后端按本地日分桶 */
export function localTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}

/** 日期键 → 当地当日零点时间戳区间 [start, end) */
export function dateKeyToRange(dateKey: string): { start: number; end: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(y, m, d).getTime()
  const end = new Date(y, m, d + 1).getTime()
  return { start, end }
}

/** 日期键按时间先后比较（0 基月份无法用字典序比较） */
export function compareDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return ay * 10000 + am * 100 + ad - (by * 10000 + bm * 100 + bd)
}

/** 缓存中最晚的有数据日期键（无数据返回 null） */
export function latestDateKey(cache: Record<string, number>): string | null {
  let latest: string | null = null
  for (const [key, count] of Object.entries(cache)) {
    if (count <= 0) continue
    if (!latest || compareDateKeys(key, latest) > 0) latest = key
  }
  return latest
}

/** 指定年份 + 1 基月份在缓存中是否有数据 */
export function hasDataInMonth(cache: Record<string, number>, year: number, month1based: number): boolean {
  const m = month1based - 1
  return Object.entries(cache).some(([key, count]) => {
    const [y, km] = key.split('-').map(Number)
    return count > 0 && y === year && km === m
  })
}

/** 时间戳 → datetime-local 输入框值（按本地时间，不能用 toISOString 的 UTC 串） */
export function toLocalInputValue(ts: number): string {
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
