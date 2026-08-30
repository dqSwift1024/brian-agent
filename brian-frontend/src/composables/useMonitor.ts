/**
 * @fileoverview 监控面板业务逻辑组合式函数。
 *
 * 从 MonitorPanel.vue 分离：健康/资源/趋势/分布/日志五路并行轮询（10s）、
 * 日志筛选与批量操作（复制/删除/清空）、日历与健康卡片的 ResizeObserver
 * 自适应、模型分布的类型页签与排序聚合。
 * Token 日历纯计算见 utils/tokenCalendar。
 */
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { monitorApi } from '@/api'
import type { SystemHealth } from '@/api/types'
import { copyToClipboard } from '@/utils/clipboard'
import { buildTokenCalendar, computeCalendarWeeks, flattenCalendar } from '@/utils/tokenCalendar'

export interface LogEntry {
  id: string; timestamp: number; level: string; source: string
  message: string; trace_id?: string; caller?: string
}

export interface ModelDistItem {
  model: string; tokens: number; input_tokens: number; output_tokens: number
  deleted?: boolean; type?: string
}

export function useMonitor() {
  // ===== 轮询数据 =====
  const health = ref<SystemHealth>({ status: 'healthy', components: [], uptime: 0 })
  const resources = ref({ cpu: 0, memory: 0, disk: 0 })
  const tokenTrend = ref<{ date: string; tokens: number }[]>([])
  const modelDist = ref<ModelDistItem[]>([])
  const logs = ref<LogEntry[]>([])
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const _loading = ref(false)

  // ===== 日志筛选 =====
  const logLevel = ref('')
  const logKeyword = ref('')
  const logTraceId = ref('')
  const logSourceFilter = ref('')
  const logSourceType = ref('')
  const logSources = ref<string[]>([])
  const logStartTime = ref('')
  const logEndTime = ref('')

  const LOG_SOURCE_OPTIONS = [
    { value: '', label: '全部来源' },
    { value: 'AOP', label: 'AOP' },
    { value: 'SYSTEM', label: 'SYSTEM' },
    { value: 'MANUAL', label: 'MANUAL' },
  ]

  function buildLogQuery() {
    const startTs = logStartTime.value ? new Date(logStartTime.value).getTime() : undefined
    const endTs = logEndTime.value ? new Date(logEndTime.value).getTime() : undefined
    return {
      level: logLevel.value || undefined,
      keyword: logKeyword.value.trim() || undefined,
      trace_id: logTraceId.value.trim() || undefined,
      source: logSourceFilter.value.trim() || undefined,
      log_source: logSourceType.value || undefined,
      start_time: startTs,
      end_time: endTs,
    }
  }

  // ===== 修改后的方法：并行请求，减少加载时间 =====
  async function fetchAll() {
    const [healthR, resourcesR, tokenTrendR, modelDistR, logsR] = await Promise.allSettled([
      monitorApi.health(),
      monitorApi.resources(),
      monitorApi.tokenTrend(),
      monitorApi.modelDistribution(),
      monitorApi.logs(buildLogQuery()),
    ])
    if (healthR.status === 'fulfilled') health.value = healthR.value
    if (resourcesR.status === 'fulfilled') resources.value = resourcesR.value
    if (tokenTrendR.status === 'fulfilled') tokenTrend.value = tokenTrendR.value
    if (modelDistR.status === 'fulfilled') modelDist.value = modelDistR.value
    if (logsR.status === 'fulfilled') logs.value = logsR.value
  }

  async function loadLogSources() {
    try { logSources.value = await monitorApi.logSources() } catch { logSources.value = [] }
  }

  function resetLogFilters() {
    logLevel.value = ''
    logKeyword.value = ''
    logTraceId.value = ''
    logSourceFilter.value = ''
    logSourceType.value = ''
    logStartTime.value = ''
    logEndTime.value = ''
    selectedLogs.value = new Set()
    fetchAll()
  }

  // ===== 日志勾选与批量操作 =====
  const selectedLogs = ref<Set<string>>(new Set())
  const copiedLogId = ref('')

  function toggleLogSelect(id: string) {
    const next = new Set(selectedLogs.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedLogs.value = next
  }

  const allLogsSelected = computed(() => logs.value.length > 0 && logs.value.every(l => selectedLogs.value.has(l.id)))

  function toggleSelectAllLogs() {
    if (allLogsSelected.value) selectedLogs.value = new Set()
    else selectedLogs.value = new Set(logs.value.map(l => l.id))
  }

  function formatLogEntry(l: LogEntry): string {
    const time = new Date(l.timestamp).toLocaleString('zh-CN')
    const parts = [`[${time}]`, `[${l.level.toUpperCase()}]`, `[${l.source}]`]
    if (l.trace_id) parts.push(`[trace:${l.trace_id}]`)
    if (l.caller) parts.push(`[caller:${l.caller}]`)
    parts.push(l.message)
    return parts.join(' ')
  }

  async function copyLog(id: string) {
    const l = logs.value.find(x => x.id === id)
    if (!l) return
    const success = await copyToClipboard(formatLogEntry(l))
    if (success) {
      copiedLogId.value = id
      setTimeout(() => { if (copiedLogId.value === id) copiedLogId.value = '' }, 1500)
    }
  }

  async function copySelectedLogs() {
    const selected = logs.value.filter(l => selectedLogs.value.has(l.id))
    if (selected.length === 0) return
    const text = selected.map(formatLogEntry).join('\n')
    await copyToClipboard(text)
  }

  async function deleteLog(id: string) {
    try {
      await monitorApi.deleteLogs([id])
      if (selectedLogs.value.has(id)) {
        const next = new Set(selectedLogs.value)
        next.delete(id)
        selectedLogs.value = next
      }
      await fetchAll()
    } catch { /* */ }
  }

  async function deleteSelectedLogs() {
    const ids = [...selectedLogs.value]
    if (ids.length === 0) return
    try {
      await monitorApi.deleteLogs(ids)
      selectedLogs.value = new Set()
      await fetchAll()
    } catch { /* */ }
  }

  async function clearAllLogs() {
    if (!window.confirm('确定要清空全部日志吗？此操作不可恢复。')) return
    try {
      await monitorApi.clearLogs()
      selectedLogs.value = new Set()
      await fetchAll()
    } catch { /* */ }
  }

  // ===== 卡片自适应：日历容器宽度 / 健康卡片高度 =====
  const calendarBox = ref<HTMLElement | null>(null)
  const calendarBoxWidth = ref(0)
  let resizeObserver: ResizeObserver | null = null
  const healthCard = ref<HTMLElement | null>(null)
  const healthCardHeight = ref(0)
  let healthResizeObserver: ResizeObserver | null = null

  onMounted(() => {
    fetchAll()
    loadLogSources()
    pollTimer.value = setInterval(fetchAll, 10000)
  })
  onUnmounted(() => {
    if (pollTimer.value) clearInterval(pollTimer.value)
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
    if (healthResizeObserver) { healthResizeObserver.disconnect(); healthResizeObserver = null }
  })

  // 步骤1/2/3：当日历容器渲染后（tokenTrend 为空时该容器不渲染），监听其宽度变化，
  // 按「格子宽度(10px) + 间距(3px)」计算可容纳的周数，从而确定日期范围。
  watchEffect(() => {
    const el = calendarBox.value
    if (!el || resizeObserver) return
    resizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) calendarBoxWidth.value = e.contentRect.width
    })
    resizeObserver.observe(el)
  })

  // 监听「系统健康」卡片高度，将其作为 Token 趋势 / 模型分布卡片锁定的固定高度
  watchEffect(() => {
    const el = healthCard.value
    if (!el || healthResizeObserver) return
    healthResizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) {
        healthCardHeight.value = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight
      }
    })
    healthResizeObserver.observe(el)
  })

  // ===== 健康状态展示辅助 =====
  const statusColor = (s: string) =>
    s === 'healthy' ? 'text-success-green' : s === 'degraded' ? 'text-warning-orange' : 'text-error-red'

  const statusIcon = (s: string) =>
    s === 'healthy' ? 'bg-success-green' : s === 'degraded' ? 'bg-warning-orange' : 'bg-error-red'

  const logLevelColors: Record<string, string> = {
    error: 'text-error-red bg-error-red/10',
    warn: 'text-warning-orange bg-warning-orange/10',
    info: 'text-brian-blue bg-brian-blue/10',
    debug: 'text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-800',
  }

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${d}d ${h}h ${m}m`
  }

  // ===== Token 使用趋势日历 =====
  const calendarWeeks = computed(() => computeCalendarWeeks(calendarBoxWidth.value))
  const maxDailyTokens = computed(() => Math.max(0, ...tokenTrend.value.map(p => p.tokens)))
  const flatCalendar = computed(() => flattenCalendar(buildTokenCalendar(tokenTrend.value, calendarWeeks.value)))

  // ===== 模型分布：按类型分 tab 展示，总 token、占比、显示名 =====
  const MODEL_TYPE_LABELS: Record<string, string> = {
    text: '文本生成',
    vision: '多模态',
    embedding: '向量化',
  }
  const MODEL_TYPE_ORDER = ['text', 'vision', 'embedding']

  const modelTypeTab = ref('text')

  const MODEL_SORT_OPTIONS: { value: 'tokens' | 'input' | 'output'; label: string }[] = [
    { value: 'tokens', label: '总量' },
    { value: 'input', label: '输入' },
    { value: 'output', label: '输出' },
  ]
  const modelSort = ref<'tokens' | 'input' | 'output'>('tokens')

  function modelSortValue(m: ModelDistItem): number {
    if (modelSort.value === 'input') return m.input_tokens || 0
    if (modelSort.value === 'output') return m.output_tokens || 0
    return m.tokens || 0
  }

  const groupedModels = computed(() => {
    const groups: Record<string, ModelDistItem[]> = {}
    for (const m of modelDist.value) {
      const t = m.type || 'deleted'
      if (!groups[t]) groups[t] = []
      groups[t].push(m)
    }
    return groups
  })

  const modelTabs = computed(() => MODEL_TYPE_ORDER.filter(t => (groupedModels.value[t]?.length ?? 0) > 0))

  const activeModels = computed(() => {
    const list = [...(groupedModels.value[modelTypeTab.value] || [])]
    list.sort((a, b) => modelSortValue(b) - modelSortValue(a))
    return list
  })

  const activeTotalInputTokens = computed(() => activeModels.value.reduce((s, m) => s + (m.input_tokens || 0), 0))

  const activeTotalOutputTokens = computed(() => activeModels.value.reduce((s, m) => s + (m.output_tokens || 0), 0))

  const activeTotalTokens = computed(() => activeTotalInputTokens.value + activeTotalOutputTokens.value)

  function modelInputPercent(m: ModelDistItem): number {
    const total = activeTotalTokens.value || 1
    return ((m.input_tokens || 0) / total) * 100
  }

  function modelOutputPercent(m: ModelDistItem): number {
    const total = activeTotalTokens.value || 1
    return ((m.output_tokens || 0) / total) * 100
  }

  function displayModelName(m: ModelDistItem): string {
    return m.deleted ? '已删除模型' : m.model
  }

  return {
    health, resources, tokenTrend, modelDist, logs, fetchAll,
    logLevel, logKeyword, logTraceId, logSourceFilter, logSourceType, logSources,
    logStartTime, logEndTime, LOG_SOURCE_OPTIONS, resetLogFilters,
    selectedLogs, copiedLogId, toggleLogSelect, allLogsSelected, toggleSelectAllLogs,
    copyLog, copySelectedLogs, deleteLog, deleteSelectedLogs, clearAllLogs,
    calendarBox, healthCard, healthCardHeight,
    statusColor, statusIcon, logLevelColors, formatUptime,
    maxDailyTokens, flatCalendar,
    MODEL_TYPE_LABELS, MODEL_SORT_OPTIONS, modelTypeTab, modelSort,
    modelTabs, activeModels, activeTotalInputTokens, activeTotalOutputTokens,
    modelInputPercent, modelOutputPercent, displayModelName,
  }
}
