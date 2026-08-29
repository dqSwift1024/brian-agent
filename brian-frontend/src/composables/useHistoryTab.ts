/**
 * @fileoverview 信息页「会话历史」页签的业务逻辑组合式函数。
 *
 * 从 InfoView.vue 分离的数据获取 / 过滤 / 时间线分组 / 热力图 / 勾选与删除逻辑；
 * 模板经解构引用，函数名与原先保持一致。
 */

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { chatApi } from '../api'
import type { ChatSession } from '../api/types'

/**
 * 会话历史页签状态与操作。
 */
export function useHistoryTab() {
  const router = useRouter()

const historySearch = ref('')
const historyStartTime = ref('')
const historyEndTime = ref('')
const chatList = ref<ChatSession[]>([])
const loadingHistory = ref(false)
const selectedSessions = ref<Set<string>>(new Set())


const viewingTagsSession = ref<ChatSession | null>(null)

function openViewTags(session: ChatSession) {
  viewingTagsSession.value = session
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    chatList.value = await chatApi.list(
      'default-user',
      historySearch.value.trim() || undefined,
      historyStartTime.value ? new Date(historyStartTime.value).getTime() : undefined,
      historyEndTime.value ? new Date(historyEndTime.value).getTime() : undefined,
    )
  }
  catch { /* ignore */ }
  finally { loadingHistory.value = false }
}

const filteredHistory = computed(() => {
  return [...chatList.value].sort((a, b) => b.lastTime - a.lastTime)
})

const historyTimeline = computed(() => {
  const groups: { dateKey: string; label: string; items: ChatSession[] }[] = []
  for (const session of filteredHistory.value) {
    const d = new Date(session.lastTime)
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let group = groups.find(g => g.dateKey === dateKey)
    if (!group) {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 86400000)
      let label: string
      if (d.toDateString() === today.toDateString()) label = '今天'
      else if (d.toDateString() === yesterday.toDateString()) label = '昨天'
      else label = `${d.getMonth() + 1}月${d.getDate()}日`
      group = { dateKey, label, items: [] }
      groups.push(group)
    }
    group.items.push(session)
  }
  return groups
})

const activeHistoryDate = ref<string | null>(null)

function scrollToHistoryDate(dateKey: string) {
  activeHistoryDate.value = dateKey
  document.getElementById(`history-nav-${dateKey}`)?.scrollIntoView({ block: 'nearest' })
  document.getElementById(`history-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 历史页热力图：基于 chatList 按最后消息时间聚合当月每天的会话数量
const historyHeatmapYear = ref(new Date().getFullYear())
const historyHeatmapMonth = ref(new Date().getMonth() + 1)

const historyHeatmapDays = computed(() => {
  const days: Record<string, number> = {}
  for (const s of chatList.value) {
    const d = new Date(s.lastTime)
    if (d.getFullYear() === historyHeatmapYear.value && d.getMonth() + 1 === historyHeatmapMonth.value) {
      const key = String(d.getDate())
      days[key] = (days[key] || 0) + 1
    }
  }
  return days
})

const historyHeatmapCells = computed(() => {
  const daysInMonth = new Date(historyHeatmapYear.value, historyHeatmapMonth.value, 0).getDate()
  const firstDay = new Date(historyHeatmapYear.value, historyHeatmapMonth.value - 1, 1).getDay()
  const leading = (firstDay + 6) % 7
  const cells: { day: number | null; count: number }[] = []
  for (let i = 0; i < leading; i++) cells.push({ day: null, count: 0 })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, count: historyHeatmapDays.value[String(d)] || 0 })
  while (cells.length % 7 !== 0) cells.push({ day: null, count: 0 })
  return cells
})

function historyHeatmapColor(count: number): string {
  if (count <= 0) return 'bg-apple-gray-100 dark:bg-apple-gray-800'
  if (count === 1) return 'bg-brian-blue/30'
  if (count <= 3) return 'bg-brian-blue/60'
  return 'bg-brian-blue'
}

function historyHeatmapDateKey(day: number): string {
  return `${historyHeatmapYear.value}-${historyHeatmapMonth.value - 1}-${day}`
}

function isHistoryHeatmapCellActive(day: number): boolean {
  return activeHistoryDate.value === historyHeatmapDateKey(day)
}

function clickHistoryHeatmapDay(day: number | null) {
  if (!day) return
  scrollToHistoryDate(historyHeatmapDateKey(day))
}

const allHistorySelected = computed(() =>
  filteredHistory.value.length > 0 && filteredHistory.value.every(c => selectedSessions.value.has(c.sessionId))
)

function toggleHistorySelectAll() {
  if (allHistorySelected.value) selectedSessions.value = new Set()
  else selectedSessions.value = new Set(filteredHistory.value.map(c => c.sessionId))
}

function toggleHistorySelect(id: string) {
  const next = new Set(selectedSessions.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedSessions.value = next
}

const deleteConfirm = ref<{ type: 'single' | 'batch'; sessionId?: string } | null>(null)

function requestDeleteSession(sessionId: string) {
  deleteConfirm.value = { type: 'single', sessionId }
}

function requestBatchDelete() {
  deleteConfirm.value = { type: 'batch' }
}

async function handleDeleteSession(sessionId: string) {
  await chatApi.deleteSession(sessionId)
  chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
}

async function handleBatchDelete() {
  const ids = [...selectedSessions.value]
  const results = await Promise.allSettled(ids.map(id => chatApi.deleteSession(id)))
  const okIds = ids.filter((_, i) => results[i].status === 'fulfilled')
  chatList.value = chatList.value.filter(c => !okIds.includes(c.sessionId))
  selectedSessions.value = new Set()
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  const { type, sessionId } = deleteConfirm.value
  deleteConfirm.value = null
  if (type === 'single' && sessionId) {
    await handleDeleteSession(sessionId)
  } else if (type === 'batch') {
    await handleBatchDelete()
  }
}

function openSession(sessionId: string) { router.push(`/?session=${sessionId}`) }

  return {
    historySearch, historyStartTime, historyEndTime,
    chatList, loadingHistory, selectedSessions,
    viewingTagsSession, openViewTags, loadHistory,
    filteredHistory, historyTimeline, activeHistoryDate, scrollToHistoryDate,
    historyHeatmapYear, historyHeatmapMonth, historyHeatmapDays, historyHeatmapCells,
    historyHeatmapColor, historyHeatmapDateKey, isHistoryHeatmapCellActive, clickHistoryHeatmapDay,
    allHistorySelected, toggleHistorySelectAll, toggleHistorySelect,
    deleteConfirm, requestDeleteSession, requestBatchDelete, confirmDelete,
    openSession,
  }
}
