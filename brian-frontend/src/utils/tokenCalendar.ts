/**
 * @fileoverview Token 使用趋势日历（GitHub 贡献图风格热力图）的纯计算逻辑。
 *
 * 从 MonitorPanel.vue 分离：全部为无状态纯函数，便于单元测试；
 * 轮询与筛选等状态编排见 composables/useMonitor。
 */

export interface TokenTrendPoint { date: string; tokens: number }

export interface CalendarDay { date: string; tokens: number; future: boolean }

/** 行标签：周一起始，隔行显示（一/三/五/日） */
export const DAY_LABELS = ['一', '', '三', '', '五', '', '日']

export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 根据容器宽度动态计算可容纳的周数，填充宽度、避免过多留白。
 * 容器宽度 ≈ 标签列(12px) + 间距(3px) + N个格子(10px) + (N-1)个间距(3px) = 12 + 13N
 */
export function computeCalendarWeeks(width: number): number {
  if (!width) return 53
  return Math.max(26, Math.min(156, Math.floor((width - 12) / 13)))
}

/** 以本周为末周向回构造 totalWeeks 周的日历矩阵，并映射每日 token 用量 */
export function buildTokenCalendar(trend: TokenTrendPoint[], totalWeeks: number): CalendarDay[][] {
  const tokenMap = new Map<string, number>()
  for (const p of trend) tokenMap.set(p.date, p.tokens)

  const weeks: CalendarDay[][] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - mondayOffset)
  const start = new Date(currentMonday)
  start.setDate(start.getDate() - (totalWeeks - 1) * 7)
  for (let w = 0; w < totalWeeks; w++) {
    const days: CalendarDay[] = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + w * 7 + d)
      const dateStr = formatDate(dt)
      days.push({ date: dateStr, tokens: tokenMap.get(dateStr) ?? 0, future: dt > today })
    }
    weeks.push(days)
  }
  return weeks
}

/** 展平为一维数组（周优先 → 天优先），供 grid-flow-col 按列填充 */
export function flattenCalendar(weeks: CalendarDay[][]): CalendarDay[] {
  return weeks.flat()
}

/** 按用量占比返回格子配色（future 日透明占位） */
export function tokenCellColor(tokens: number, maxDailyTokens: number, future: boolean): string {
  if (future) return 'bg-transparent border border-transparent'
  const base = 'border border-apple-gray-200 dark:border-apple-gray-600'
  if (tokens <= 0) return `${base} bg-apple-gray-100 dark:bg-apple-gray-700`
  const r = tokens / (maxDailyTokens || 1)
  if (r < 0.25) return `${base} bg-brian-blue/20`
  if (r < 0.5) return `${base} bg-brian-blue/40`
  if (r < 0.75) return `${base} bg-brian-blue/70`
  return `${base} bg-brian-blue`
}
