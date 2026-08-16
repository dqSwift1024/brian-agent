<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RefreshCw, Play, Pause, CalendarClock, Loader2, ChevronRight, CheckCircle2, XCircle, Clock, AlertCircle } from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import CronConfigModal from '@/components/CronConfigModal.vue'
import { cronApi } from '@/api'
import type { CronTask, CronTaskRun } from '@/api'

const tasks = ref<CronTask[]>([])
const loading = ref(false)
const error = ref('')

const runsMap = ref<Record<string, CronTaskRun[]>>({})
const expandedTask = ref<string | null>(null)

const editModalVisible = ref(false)
const editingTask = ref<CronTask | null>(null)
const triggering = ref<Record<string, boolean>>({})

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    tasks.value = await cronApi.tasks()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleEnabled(task: CronTask) {
  try {
    const updated = await cronApi.setEnabled(task.name, task.enabled !== 1)
    if (updated) {
      const idx = tasks.value.findIndex(t => t.name === task.name)
      if (idx >= 0) tasks.value[idx] = updated
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

function openEdit(task: CronTask) {
  editingTask.value = task
  editModalVisible.value = true
}

async function saveCron(cron: string) {
  if (!editingTask.value) return
  try {
    const updated = await cronApi.setCron(editingTask.value.name, cron)
    if (updated) {
      const idx = tasks.value.findIndex(t => t.name === editingTask.value!.name)
      if (idx >= 0) tasks.value[idx] = updated
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    editModalVisible.value = false
    editingTask.value = null
  }
}

async function triggerTask(task: CronTask) {
  triggering.value[task.name] = true
  try {
    await cronApi.trigger(task.name)
    await loadRuns(task.name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '触发失败'
  } finally {
    triggering.value[task.name] = false
  }
}

async function loadRuns(name: string) {
  try {
    runsMap.value[name] = await cronApi.runs(name, 20)
  } catch { /* ignore */ }
}

async function toggleExpand(task: CronTask) {
  if (expandedTask.value === task.name) {
    expandedTask.value = null
  } else {
    expandedTask.value = task.name
    await loadRuns(task.name)
  }
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(run: CronTaskRun): string {
  if (!run.finished_at) return '—'
  const ms = run.finished_at - run.started_at
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

const runningCount = computed(() => tasks.value.filter(t => t.enabled === 1).length)

onMounted(loadTasks)
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="h-10 flex items-center justify-between px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="['定时任务']" />
        <div class="flex items-center gap-3">
          <span class="text-xs text-apple-gray-400">{{ runningCount }}/{{ tasks.length }} 启用</span>
          <button class="icon-btn" title="刷新" @click="loadTasks">
            <RefreshCw :size="16" :class="loading ? 'animate-spin' : ''" />
          </button>
        </div>
      </div>
    </div>

    <div class="px-6 pb-6 relative z-10">
      <div v-if="error" class="mt-4 flex items-center gap-2 text-xs text-error-red bg-error-red/5 border border-error-red/20 rounded-lg px-3 py-2">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16 text-apple-gray-400">
        <Loader2 :size="24" class="animate-spin mr-2" /> 加载中...
      </div>

      <div v-else-if="tasks.length === 0" class="flex flex-col items-center justify-center py-20 text-apple-gray-400">
        <CalendarClock :size="40" class="mb-3" />
        <p class="text-sm">暂无定时任务</p>
      </div>

      <div v-else class="mt-4 space-y-3 max-w-4xl">
        <div
          v-for="task in tasks"
          :key="task.name"
          class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 overflow-hidden"
        >
          <div class="px-4 py-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ task.name }}</span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded-full"
                  :class="task.enabled === 1 ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"
                >{{ task.enabled === 1 ? '启用' : '禁用' }}</span>
              </div>
              <p v-if="task.description" class="text-xs text-apple-gray-400 mt-0.5">{{ task.description }}</p>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                :title="task.enabled === 1 ? '禁用' : '启用'"
                @click="toggleEnabled(task)"
              >
                <Pause v-if="task.enabled === 1" :size="15" />
                <Play v-else :size="15" />
              </button>
              <button
                class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-brian-blue/30 text-brian-blue hover:bg-brian-blue/5 transition-colors disabled:opacity-50"
                :disabled="triggering[task.name]"
                title="单次触发"
                @click="triggerTask(task)"
              >
                <Loader2 v-if="triggering[task.name]" :size="13" class="animate-spin" />
                <Play v-else :size="13" />
                触发
              </button>
              <button
                class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                :title="expandedTask === task.name ? '收起' : '查看执行情况'"
                @click="toggleExpand(task)"
              >
                <ChevronRight :size="15" :class="expandedTask === task.name ? 'rotate-90 transition-transform' : 'transition-transform'" />
              </button>
            </div>
          </div>

          <!-- 定时时间行 -->
          <div class="px-4 pb-3 flex items-center gap-3 text-xs">
            <button
              class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-100 dark:border-apple-gray-700 font-mono text-apple-gray-700 dark:text-apple-gray-300 hover:border-brian-blue/40 transition-colors"
              title="点击编辑定时时间"
              @click="openEdit(task)"
            >
              <Clock :size="12" class="text-brian-blue" />
              {{ task.cron }}
            </button>
            <span class="text-apple-gray-400">上次执行：{{ formatTime(task.last_run) }}</span>
            <span class="text-apple-gray-400">下次执行：{{ formatTime(task.next_run) }}</span>
          </div>

          <!-- 执行情况 -->
          <div v-if="expandedTask === task.name" class="border-t border-apple-gray-100 dark:border-apple-gray-700 px-4 py-3 bg-apple-gray-50/50 dark:bg-apple-gray-900/20">
            <h4 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2">执行情况</h4>
            <div v-if="!runsMap[task.name] || runsMap[task.name].length === 0" class="text-xs text-apple-gray-400 py-3 text-center">暂无执行记录</div>
            <div v-else class="space-y-1.5 max-h-64 overflow-y-auto">
              <div
                v-for="run in runsMap[task.name]"
                :key="run.id"
                class="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-100 dark:border-apple-gray-700"
              >
                <CheckCircle2 v-if="run.status === 'SUCCESS'" :size="14" class="text-success-green shrink-0 mt-0.5" />
                <XCircle v-else :size="14" class="text-error-red shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 text-[11px] text-apple-gray-500 dark:text-apple-gray-400">
                    <span>{{ formatTime(run.started_at) }}</span>
                    <span class="text-apple-gray-300">·</span>
                    <span>{{ formatDuration(run) }}</span>
                    <span
                      class="px-1.5 py-0.5 rounded-full text-[10px]"
                      :class="run.status === 'SUCCESS' ? 'bg-success-green/10 text-success-green' : 'bg-error-red/10 text-error-red'"
                    >{{ run.result || run.status }}</span>
                  </div>
                  <p v-if="run.error" class="text-[11px] text-error-red mt-1 whitespace-pre-wrap break-words">{{ run.error }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <CronConfigModal
      :visible="editModalVisible"
      title="定时时间配置"
      :expression="editingTask?.cron || ''"
      @close="editModalVisible = false; editingTask = null"
      @save="saveCron"
    />
  </div>
</template>
