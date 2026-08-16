<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { Activity, Cpu, HardDrive, Database, TrendingUp, Layers, RefreshCw, Eye, Copy, Check, CheckSquare, Square, Search } from '@lucide/vue'
import { monitorApi } from '@/api'
import type { SystemHealth } from '@/api/types'

const health = ref<SystemHealth>({ status: 'healthy', components: [], uptime: 0 })
const resources = ref({ cpu: 0, memory: 0, disk: 0 })
const tokenTrend = ref<{ date: string; tokens: number }[]>([])
const modelDist = ref<{ model: string; tokens: number; deleted?: boolean; type?: string }[]>([])
const logs = ref<{ id: string; timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }[]>([])
const logLevel = ref('')
const logKeyword = ref('')
const logTraceId = ref('')
const logSourceFilter = ref('')
const logSourceType = ref('')
const logStartTime = ref('')
const logEndTime = ref('')
const selectedLogs = ref<Set<string>>(new Set())
const copiedLogId = ref('')
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const _loading = ref(false)
const calendarBox = ref<HTMLElement | null>(null)
const calendarBoxWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

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

async function fetchAll() {
  try { health.value = await monitorApi.health() } catch { /* */ }
  try { resources.value = await monitorApi.resources() } catch { /* */ }
  try { tokenTrend.value = await monitorApi.tokenTrend() } catch { /* */ }
  try { modelDist.value = await monitorApi.modelDistribution() } catch { /* */ }
  try { logs.value = await monitorApi.logs(buildLogQuery()) } catch { /* */ }
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

function formatLogEntry(l: { timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }): string {
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
  try {
    await navigator.clipboard.writeText(formatLogEntry(l))
    copiedLogId.value = id
    setTimeout(() => { if (copiedLogId.value === id) copiedLogId.value = '' }, 1500)
  } catch { /* ignore */ }
}

async function copySelectedLogs() {
  const selected = logs.value.filter(l => selectedLogs.value.has(l.id))
  if (selected.length === 0) return
  const text = selected.map(formatLogEntry).join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch { /* ignore */ }
}

onMounted(() => {
  fetchAll()
  pollTimer.value = setInterval(fetchAll, 10000)
})
onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
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

// Token 使用趋势：GitHub 贡献图风格的日历热力图
const DAY_LABELS = ['一', '', '三', '', '五', '', '日']

// 根据容器宽度动态计算可容纳的周数，填充宽度、避免过多留白
// 容器宽度 ≈ 标签列(12px) + 间距(3px) + N个格子(10px) + (N-1)个间距(3px) = 12 + 13N
const calendarWeeks = computed(() => {
  const w = calendarBoxWidth.value
  if (!w) return 53
  return Math.max(26, Math.min(156, Math.floor((w - 12) / 13)))
})

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const tokenMap = computed(() => {
  const m = new Map<string, number>()
  for (const p of tokenTrend.value) m.set(p.date, p.tokens)
  return m
})

const maxDailyTokens = computed(() => Math.max(0, ...tokenTrend.value.map(p => p.tokens)))

const tokenCalendar = computed(() => {
  const weeks: Array<Array<{ date: string; tokens: number; future: boolean }>> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - mondayOffset)
  const totalWeeks = calendarWeeks.value
  const start = new Date(currentMonday)
  start.setDate(start.getDate() - (totalWeeks - 1) * 7)
  for (let w = 0; w < totalWeeks; w++) {
    const days: Array<{ date: string; tokens: number; future: boolean }> = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + w * 7 + d)
      const dateStr = formatDate(dt)
      days.push({ date: dateStr, tokens: tokenMap.value.get(dateStr) ?? 0, future: dt > today })
    }
    weeks.push(days)
  }
  return weeks
})

// 展平为一维数组（周优先 → 天优先），供 grid-flow-col 按列填充
const flatCalendar = computed(() => tokenCalendar.value.flat())

function tokenCellColor(tokens: number, future: boolean): string {
  if (future) return 'bg-transparent border border-transparent'
  const base = 'border border-apple-gray-200 dark:border-apple-gray-600'
  if (tokens <= 0) return `${base} bg-apple-gray-100 dark:bg-apple-gray-700`
  const max = maxDailyTokens.value || 1
  const r = tokens / max
  if (r < 0.25) return `${base} bg-brian-blue/20`
  if (r < 0.5) return `${base} bg-brian-blue/40`
  if (r < 0.75) return `${base} bg-brian-blue/70`
  return `${base} bg-brian-blue`
}

// 模型分布：按类型分 tab 展示，总 token、占比、显示名
const MODEL_TYPE_LABELS: Record<string, string> = {
  text: '文本生成',
  vision: '多模态',
  embedding: '向量化',
  deleted: '已删除',
}
const MODEL_TYPE_ORDER = ['text', 'vision', 'embedding', 'deleted']

const modelTypeTab = ref('text')

const groupedModels = computed(() => {
  const groups: Record<string, { model: string; tokens: number; deleted?: boolean }[]> = {}
  for (const m of modelDist.value) {
    const t = m.type || 'deleted'
    if (!groups[t]) groups[t] = []
    groups[t].push(m)
  }
  return groups
})

const modelTabs = computed(() => MODEL_TYPE_ORDER.filter(t => (groupedModels.value[t]?.length ?? 0) > 0))

const activeModels = computed(() => groupedModels.value[modelTypeTab.value] || [])

const activeTotalTokens = computed(() => activeModels.value.reduce((s, m) => s + m.tokens, 0))

function modelPercent(tokens: number): number {
  const total = activeTotalTokens.value || 1
  return (tokens / total) * 100
}

function displayModelName(m: { model: string; deleted?: boolean }): string {
  return m.deleted ? '已删除模型' : m.model
}
</script>

<template>
  <div class="space-y-6">
    <!-- Health status -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Activity :size="20" class="text-brian-blue" /> 系统健康
        </h2>
        <span class="flex items-center gap-1.5 text-sm font-medium" :class="statusColor(health.status)">
          <span class="w-2.5 h-2.5 rounded-full" :class="statusIcon(health.status)" />
          {{ health.status === 'healthy' ? '健康' : health.status === 'degraded' ? '降级' : '异常' }}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div v-for="comp in health.components" :key="comp.name" class="flex flex-col p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
          <div class="flex items-center justify-between gap-2 mb-2">
            <p class="text-xs font-medium truncate">{{ comp.name }}</p>
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="statusIcon(comp.status)" />
          </div>
          <div class="flex-1 space-y-1">
            <div v-for="(val, key) in comp.details" :key="key" class="flex items-center justify-between gap-1 text-[11px]">
              <span class="text-apple-gray-400">{{ key }}</span>
              <span class="text-apple-gray-700 dark:text-apple-gray-200 font-medium">{{ val }}</span>
            </div>
          </div>
          <p class="mt-2 pt-1.5 text-[10px] text-apple-gray-400 border-t border-apple-gray-100 dark:border-apple-gray-700/60 truncate">{{ comp.message }}</p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-4 text-sm">
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Cpu :size="14" /> CPU: {{ resources.cpu }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <HardDrive :size="14" /> 内存: {{ resources.memory }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Database :size="14" /> 磁盘: {{ resources.disk }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500 ml-auto">
          <Activity :size="14" /> 运行时间: {{ formatUptime(health.uptime) }}
        </span>
      </div>
    </div>

    <!-- Token usage -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp :size="16" class="text-brian-blue" /> Token 使用趋势
        </h3>
        <div v-if="tokenTrend.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else ref="calendarBox">
          <div class="flex gap-[3px] w-full">
            <div class="grid grid-rows-7 gap-[3px] w-3 shrink-0">
              <span v-for="(label, i) in DAY_LABELS" :key="i" class="flex items-center h-2.5 text-[10px] leading-none text-apple-gray-400">{{ label }}</span>
            </div>
            <div class="grid grid-rows-7 grid-flow-col gap-[3px]">
              <div
                v-for="(day, idx) in flatCalendar"
                :key="idx"
                class="w-2.5 h-2.5 rounded-sm"
                :class="tokenCellColor(day.tokens, day.future)"
                :title="day.future ? day.date : `${day.date}: ${day.tokens.toLocaleString()} tokens`"
              />
            </div>
          </div>
          <div class="flex items-center justify-end gap-1 mt-2 text-[10px] text-apple-gray-400">
            <span>少</span>
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-apple-gray-100 dark:bg-apple-gray-700" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/20" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/40" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/70" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue" />
            <span>多</span>
          </div>
        </div>
      </div>

      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers :size="16" class="text-success-green" /> 模型分布
        </h3>
        <div v-if="modelDist.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else>
          <div class="flex items-center gap-1 mb-3">
            <button
              v-for="t in modelTabs"
              :key="t"
              class="px-2.5 py-1 text-xs rounded-lg transition-colors"
              :class="modelTypeTab === t ? 'bg-brian-blue text-white' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
              @click="modelTypeTab = t"
            >
              {{ MODEL_TYPE_LABELS[t] || t }}
            </button>
          </div>
          <div v-if="activeModels.length === 0" class="text-center py-4 text-apple-gray-400 text-sm">暂无数据</div>
          <div v-else class="space-y-2.5 max-h-40 overflow-y-auto pr-1">
            <div v-for="m in activeModels" :key="m.model" class="flex items-center gap-2">
              <span class="text-xs truncate w-36 flex-shrink-0 text-apple-gray-700 dark:text-apple-gray-300" :title="displayModelName(m)">{{ displayModelName(m) }}</span>
              <div class="flex-1 h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden">
                <div class="h-full rounded-full bg-brian-blue" :style="{ width: `${modelPercent(m.tokens)}%` }" />
              </div>
              <span class="text-xs text-apple-gray-500 w-16 text-right flex-shrink-0">{{ modelPercent(m.tokens).toFixed(1) }}%</span>
            </div>
            <div class="flex items-center justify-between pt-1 text-[11px] text-apple-gray-400 border-t border-apple-gray-100 dark:border-apple-gray-700">
              <span>合计</span>
              <span>{{ activeTotalTokens.toLocaleString() }} tokens</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Logs -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold flex items-center gap-2">
          <Eye :size="16" class="text-brian-blue" /> 最近日志
        </h3>
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="fetchAll()">
          <RefreshCw :size="14" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div class="relative">
          <Search :size="13" class="absolute left-2 top-1/2 -translate-y-1/2 text-apple-gray-400" />
          <input v-model="logKeyword" class="pl-7 pr-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-40" placeholder="内容搜索" @keyup.enter="fetchAll()" />
        </div>
        <input v-model="logTraceId" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-32" placeholder="traceId" @keyup.enter="fetchAll()" />
        <input v-model="logSourceFilter" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-32" placeholder="模块" @keyup.enter="fetchAll()" />
        <select v-model="logSourceType" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none">
          <option v-for="o in LOG_SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="logLevel" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none">
          <option value="">全部级别</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
          <option value="debug">debug</option>
        </select>
        <input v-model="logStartTime" type="datetime-local" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" />
        <span class="text-xs text-apple-gray-400">至</span>
        <input v-model="logEndTime" type="datetime-local" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" />
        <button class="px-2.5 py-1 text-xs rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="fetchAll()">搜索</button>
        <button class="px-2.5 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300" @click="resetLogFilters()">重置</button>
      </div>

      <div class="flex items-center justify-between mb-2 text-xs">
        <span class="text-apple-gray-400">{{ logs.length }} 条日志{{ selectedLogs.size > 0 ? `（已选 ${selectedLogs.size} 条）` : '' }}</span>
        <div class="flex items-center gap-3">
          <button v-if="selectedLogs.size > 0" class="flex items-center gap-1 px-2 py-1 rounded-lg text-brian-blue hover:bg-brian-blue/10" @click="copySelectedLogs">
            <Copy :size="12" /> 批量复制({{ selectedLogs.size }})
          </button>
          <button class="flex items-center gap-1 text-apple-gray-500 hover:text-brian-blue" @click="toggleSelectAllLogs">
            <component :is="allLogsSelected ? CheckSquare : Square" :size="14" />
            {{ allLogsSelected ? '取消全选' : '全选' }}
          </button>
        </div>
      </div>

      <div v-if="logs.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无日志</div>
      <div v-else class="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
        <div v-for="entry in logs" :key="entry.id" class="flex items-center gap-2 py-1 px-2 rounded hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
          <input type="checkbox" class="rounded flex-shrink-0" :checked="selectedLogs.has(entry.id)" @change="toggleLogSelect(entry.id)" />
          <span class="text-apple-gray-400 flex-shrink-0">{{ new Date(entry.timestamp).toLocaleTimeString('zh-CN') }}</span>
          <span class="flex-shrink-0 px-1 rounded font-medium" :class="logLevelColors[entry.level] || ''">{{ entry.level }}</span>
          <span class="text-apple-gray-500 flex-shrink-0">{{ entry.source }}</span>
          <span v-if="entry.trace_id" class="text-brian-blue/70 flex-shrink-0" :title="`traceId: ${entry.trace_id}`">{{ entry.trace_id.slice(0, 8) }}</span>
          <span class="truncate flex-1">{{ entry.message }}</span>
          <button class="p-0.5 rounded text-apple-gray-400 hover:text-brian-blue flex-shrink-0" title="复制" @click="copyLog(entry.id)">
            <Check v-if="copiedLogId === entry.id" :size="12" class="text-success-green" />
            <Copy v-else :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
