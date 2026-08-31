<script setup lang="ts">
/**
 * @fileoverview 监控面板视图：系统健康 / Token 趋势日历 / 模型分布 / 最近日志。
 * 业务逻辑见 composables/useMonitor，日历纯计算见 utils/tokenCalendar。
 */
import { Activity, Cpu, HardDrive, Database, TrendingUp, Layers, RefreshCw, Eye, Copy, Check, CheckSquare, Square, Search, Trash2 } from '@lucide/vue'
import { DAY_LABELS, tokenCellColor } from '@/utils/tokenCalendar'
import { useMonitor } from '@/composables/useMonitor'

const {
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
} = useMonitor()
</script>

<template>
  <div class="space-y-6">
    <!-- Health status -->
    <div ref="healthCard" class="block-card rounded-2xl p-6">
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
      <div class="block-card rounded-2xl p-6 flex flex-col" :style="healthCardHeight ? { height: `${healthCardHeight}px` } : undefined">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp :size="16" class="text-brian-blue" /> Token 使用趋势
        </h3>
        <div v-if="tokenTrend.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else ref="calendarBox" class="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center">
          <div class="flex gap-[3px]">
            <div class="grid grid-rows-7 gap-[3px] w-3 shrink-0">
              <span v-for="(label, i) in DAY_LABELS" :key="i" class="flex items-center h-2.5 text-[10px] leading-none text-apple-gray-400">{{ label }}</span>
            </div>
            <div class="grid grid-rows-7 grid-flow-col gap-[3px]">
              <div
                v-for="(day, idx) in flatCalendar"
                :key="idx"
                class="w-2.5 h-2.5 rounded-sm"
                :class="tokenCellColor(day.tokens, maxDailyTokens, day.future)"
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

      <div class="block-card rounded-2xl p-6 flex flex-col" :style="healthCardHeight ? { height: `${healthCardHeight}px` } : undefined">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers :size="16" class="text-success-green" /> 模型分布
        </h3>
        <div v-if="modelDist.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else class="flex-1 min-h-0 flex flex-col">
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
            <div class="ml-auto flex items-center gap-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg p-0.5">
              <button
                v-for="o in MODEL_SORT_OPTIONS"
                :key="o.value"
                class="px-2 py-0.5 text-[11px] rounded-md transition-colors"
                :class="modelSort === o.value ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-900 dark:text-white shadow-sm' : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'"
                @click="modelSort = o.value"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
          <div v-if="activeModels.length === 0" class="text-center py-4 text-apple-gray-400 text-sm">暂无数据</div>
          <div v-else class="space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1">
            <div class="flex items-center justify-between pb-1 text-[11px] border-b border-apple-gray-100 dark:border-apple-gray-700">
              <span class="text-apple-gray-400">合计</span>
              <span class="flex items-center gap-3">
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-error-red" />
                  <span class="text-error-red">输入 {{ activeTotalInputTokens.toLocaleString() }}</span>
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-success-green" />
                  <span class="text-success-green">输出 {{ activeTotalOutputTokens.toLocaleString() }}</span>
                </span>
              </span>
            </div>
            <div v-for="m in activeModels" :key="m.model" class="flex items-center gap-2" :title="`${displayModelName(m)} — 输入 ${modelInputPercent(m).toFixed(1)}% · 输出 ${modelOutputPercent(m).toFixed(1)}%`">
              <span class="text-xs truncate w-36 flex-shrink-0 text-apple-gray-700 dark:text-apple-gray-300" :title="displayModelName(m)">{{ displayModelName(m) }}</span>
              <div class="flex-1 h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden flex">
                <div class="h-full bg-error-red" :style="{ width: `${modelInputPercent(m)}%` }" />
                <div class="h-full bg-success-green" :style="{ width: `${modelOutputPercent(m)}%` }" />
              </div>
              <span class="text-xs flex-shrink-0 whitespace-nowrap font-medium">
                <span class="text-error-red">{{ (m.input_tokens || 0).toLocaleString() }}</span>
                <span class="text-apple-gray-400 px-1">/</span>
                <span class="text-success-green">{{ (m.output_tokens || 0).toLocaleString() }}</span>
              </span>
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
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="fetchAll(true)">
          <RefreshCw :size="14" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div class="relative">
          <Search :size="13" class="absolute left-2 top-1/2 -translate-y-1/2 text-apple-gray-400" />
          <input v-model="logKeyword" class="pl-7 pr-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-40" placeholder="内容搜索" @keyup.enter="fetchAll(true)" />
        </div>
        <input v-model="logTraceId" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-32" placeholder="traceId" @keyup.enter="fetchAll(true)" />
        <select v-model="logSourceFilter" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" @change="fetchAll(true)">
          <option value="">全部模块</option>
          <option v-for="s in logSources" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="logSourceType" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" @change="fetchAll(true)">
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
        <button class="px-2.5 py-1 text-xs rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="fetchAll(true)">搜索</button>
        <button class="px-2.5 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300" @click="resetLogFilters()">重置</button>
      </div>

      <div class="flex items-center justify-between mb-2 text-xs">
        <span class="text-apple-gray-400">{{ logs.length }} 条日志{{ selectedLogs.size > 0 ? `（已选 ${selectedLogs.size} 条）` : '' }}</span>
        <div class="flex items-center gap-2">
          <button v-if="selectedLogs.size > 0" class="flex items-center gap-1 px-2 py-1 rounded-lg text-brian-blue hover:bg-brian-blue/10" @click="copySelectedLogs">
            <Copy :size="12" /> 批量复制({{ selectedLogs.size }})
          </button>
          <button v-if="selectedLogs.size > 0" class="flex items-center gap-1 px-2 py-1 rounded-lg text-error-red hover:bg-error-red/10" @click="deleteSelectedLogs">
            <Trash2 :size="12" /> 批量删除({{ selectedLogs.size }})
          </button>
          <button class="flex items-center gap-1 text-apple-gray-500 hover:text-brian-blue" @click="toggleSelectAllLogs">
            <component :is="allLogsSelected ? CheckSquare : Square" :size="14" />
            {{ allLogsSelected ? '取消全选' : '全选' }}
          </button>
          <button class="flex items-center gap-1 px-2 py-1 rounded-lg text-error-red hover:bg-error-red/10" @click="clearAllLogs">
            <Trash2 :size="12" /> 清空
          </button>
        </div>
      </div>

      <div v-if="logs.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无日志</div>
      <div v-else class="max-h-80 overflow-y-auto rounded-lg border border-apple-gray-100 dark:border-apple-gray-700">
        <table class="w-full table-fixed text-xs font-mono">
          <colgroup>
            <col class="w-8" />
            <col class="w-24" />
            <col class="w-16" />
            <col class="w-28" />
            <col class="w-24" />
            <col />
            <col class="w-20" />
          </colgroup>
          <thead class="sticky top-0 bg-apple-gray-50 dark:bg-apple-gray-800 z-10">
            <tr class="text-left text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
              <th class="py-2 px-2">
                <input type="checkbox" class="rounded" :checked="allLogsSelected" @change="toggleSelectAllLogs" />
              </th>
              <th class="py-2 px-2 font-medium">时间</th>
              <th class="py-2 px-2 font-medium">级别</th>
              <th class="py-2 px-2 font-medium">来源</th>
              <th class="py-2 px-2 font-medium">TraceId</th>
              <th class="py-2 px-2 font-medium">消息</th>
              <th class="py-2 px-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-gray-50 dark:divide-apple-gray-800/50">
            <tr v-for="entry in logs" :key="entry.id" class="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
              <td class="py-1.5 px-2">
                <input type="checkbox" class="rounded" :checked="selectedLogs.has(entry.id)" @change="toggleLogSelect(entry.id)" />
              </td>
              <td class="py-1.5 px-2 text-apple-gray-400 whitespace-nowrap">{{ new Date(entry.timestamp).toLocaleTimeString('zh-CN') }}</td>
              <td class="py-1.5 px-2"><span class="px-1 rounded font-medium" :class="logLevelColors[entry.level] || ''">{{ entry.level }}</span></td>
              <td class="py-1.5 px-2 text-apple-gray-500 truncate" :title="entry.source">{{ entry.source }}</td>
              <td class="py-1.5 px-2 text-brian-blue/70 truncate" :title="entry.trace_id ? `traceId: ${entry.trace_id}` : ''">{{ entry.trace_id ? entry.trace_id.slice(0, 8) : '' }}</td>
              <td class="py-1.5 px-2 truncate" :title="entry.message">{{ entry.message }}</td>
              <td class="py-1.5 px-2 text-right whitespace-nowrap">
                <button class="p-1 rounded text-apple-gray-400 hover:text-brian-blue" title="复制" @click="copyLog(entry.id)">
                  <Check v-if="copiedLogId === entry.id" :size="13" class="text-success-green" />
                  <Copy v-else :size="13" />
                </button>
                <button class="p-1 rounded text-apple-gray-400 hover:text-error-red" title="删除" @click="deleteLog(entry.id)">
                  <Trash2 :size="13" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
