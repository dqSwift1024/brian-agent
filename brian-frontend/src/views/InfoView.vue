<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Clock, Brain, Database, Network, GitBranch,
  Search, Trash2, Plus, ChevronRight, ChevronLeft, ArrowLeft,
  Folder, X, CheckSquare, Square, FileText,
  UserRound, History, RefreshCw, Sparkles, Loader2,
  Tag, Eye, EyeOff,
} from '@lucide/vue'
import { chatApi, memoryApi, libraryApi, userProfileApi, configApi } from '@/api'
import type { ChatSession, MemoryItem, GraphNode, GraphEdge, LibraryPath, LibraryFileEntry, LibraryTreeNode, UserProfileData, ProfileHistoryItem, ProfileVersionData } from '@/api/types'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import LibraryTreeItem from '@/components/LibraryTreeItem.vue'
import { useI18nStore } from '@/stores/i18n'

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

const router = useRouter()

// Tabs
const i18nStore = useI18nStore()
type InfoTabKey = 'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph' | 'profile'
const infoTabKeys: InfoTabKey[] = ['history', 'memory', 'library', 'tagGraph', 'keywordGraph', 'profile']
const storedInfoTab = localStorage.getItem('brian-info-active-tab')
const activeTab = ref<InfoTabKey>(infoTabKeys.includes(storedInfoTab as InfoTabKey) ? (storedInfoTab as InfoTabKey) : 'history')
const tabs = computed(() => [
  { key: 'history' as const, label: i18nStore.t('info.history'), icon: Clock },
  { key: 'memory' as const, label: i18nStore.t('info.memory'), icon: Brain },
  { key: 'library' as const, label: i18nStore.t('info.library'), icon: Database },
  { key: 'tagGraph' as const, label: i18nStore.t('info.tagGraph'), icon: Network },
  { key: 'keywordGraph' as const, label: i18nStore.t('info.keywordGraph'), icon: GitBranch },
  { key: 'profile' as const, label: i18nStore.t('info.profile'), icon: UserRound },
])

const pagePath = computed(() => {
  const active = tabs.value.find(t => t.key === activeTab.value)
  return [i18nStore.t('nav.info'), ...(active ? [active.label] : [])]
})

// History tab
const historySearch = ref('')
const historyStartTime = ref('')
const historyEndTime = ref('')
const chatList = ref<ChatSession[]>([])
const loadingHistory = ref(false)
const selectedSessions = ref<Set<string>>(new Set())

// ===== 原始会话标题编辑逻辑（保留参考，已移除卡片内编辑入口）=====
// const editingSessionId = ref<string | null>(null)
// const editingTitle = ref('')
//
// function startEditTitle(session: ChatSession) {
//   editingSessionId.value = session.sessionId
//   editingTitle.value = session.sessionTitle || session.lastMessage || '新会话'
// }
//
// async function saveSessionTitle(sessionId: string) {
//   const newTitle = editingTitle.value.trim()
//   if (!newTitle) return
//   try {
//     const res = await chatApi.updateTitle(sessionId, newTitle)
//     const found = chatList.value.find(c => c.sessionId === sessionId)
//     if (found) {
//       found.sessionTitle = res.session_title
//     }
//   } catch { /* ignore */ }
//   finally {
//     editingSessionId.value = null
//   }
// }

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

function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
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

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Memory tab
const memories = ref<MemoryItem[]>([])
const loadingMemory = ref(false)
const loadingMoreMemory = ref(false)
const hasMoreMemory = ref(false)
const nextMemoryCursor = ref<string | null>(null)
const memorySearch = ref('')
const memoryTag = ref('')
const memoryStartTime = ref('')
const memoryEndTime = ref('')
const expandedMemory = ref<string | null>(null)
const selectedMemories = ref<Set<string>>(new Set())
const memoryDeleteConfirm = ref<null | { type: 'single' | 'batch'; id?: string }>(null)

function toggleMemorySelect(id: string) {
  const next = new Set(selectedMemories.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedMemories.value = next
}

const allMemoriesSelected = computed(() => memories.value.length > 0 && memories.value.every(m => selectedMemories.value.has(m.id)))

function toggleSelectAllMemory() {
  if (allMemoriesSelected.value) {
    selectedMemories.value = new Set()
  } else {
    selectedMemories.value = new Set(memories.value.map(m => m.id))
  }
}

async function deleteMemoryByIds(ids: string[]) {
  if (ids.length === 0) return
  await memoryApi.delete(ids)
  const removed = new Set(ids)
  memories.value = memories.value.filter(m => !removed.has(m.id))
  selectedMemories.value = new Set([...selectedMemories.value].filter(id => !removed.has(id)))
}

function requestMemoryDelete(id?: string) {
  memoryDeleteConfirm.value = id ? { type: 'single', id } : { type: 'batch' }
}

async function confirmMemoryDelete() {
  if (!memoryDeleteConfirm.value) return
  const { type, id } = memoryDeleteConfirm.value
  memoryDeleteConfirm.value = null
  if (type === 'single' && id) await deleteMemoryByIds([id])
  else await deleteMemoryByIds([...selectedMemories.value])
}

function buildMemorySearchOpts() {
  return {
    keyword: memorySearch.value.trim() || undefined,
    tag: memoryTag.value.trim() || undefined,
    startTime: memoryStartTime.value ? new Date(memoryStartTime.value).getTime() : undefined,
    endTime: memoryEndTime.value ? new Date(memoryEndTime.value).getTime() : undefined,
    limit: 50,
  }
}

async function loadMemory(reset = true) {
  if (reset) loadingMemory.value = true
  else loadingMoreMemory.value = true
  try {
    const data = await memoryApi.search('default-user', {
      ...buildMemorySearchOpts(),
      cursor: reset ? undefined : nextMemoryCursor.value || undefined,
    })
    if (reset) {
      memories.value = data.memories
    } else {
      memories.value = [...memories.value, ...data.memories]
    }
    hasMoreMemory.value = data.has_more
    nextMemoryCursor.value = data.next_cursor
  }
  catch { /* ignore */ }
  finally {
    if (reset) loadingMemory.value = false
    else loadingMoreMemory.value = false
  }
}

async function loadMoreMemory() {
  if (!hasMoreMemory.value || loadingMoreMemory.value || loadingMemory.value) return
  await loadMemory(false)
}

const memorySentinel = ref<HTMLElement | null>(null)
let memoryObserver: IntersectionObserver | null = null

watch(memorySentinel, (el) => {
  memoryObserver?.disconnect()
  memoryObserver = null
  if (el) {
    memoryObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreMemory()
    }, { rootMargin: '300px' })
    memoryObserver.observe(el)
  }
})

const filteredMemories = computed(() => {
  return [...memories.value].sort((a, b) => b.createdAt - a.createdAt)
})

const memoryTimeline = computed(() => {
  const groups: { dateKey: string; label: string; items: MemoryItem[] }[] = []
  for (const mem of filteredMemories.value) {
    const d = new Date(mem.createdAt)
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
    group.items.push(mem)
  }
  return groups
})

const typeColors: Record<string, string> = {
  semantic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  episodic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  procedural: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  working: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

// 记忆类型中文映射（语义/情景/程序性/工作记忆）
const typeLabels: Record<string, string> = {
  semantic: '语义记忆',
  episodic: '情景记忆',
  procedural: '程序性记忆',
  working: '工作记忆',
}

const activeMemoryDate = ref<string | null>(null)

function scrollMemoryNavToActive(dateKey: string) {
  document.getElementById(`memory-nav-${dateKey}`)?.scrollIntoView({ block: 'nearest' })
}

function onMemoryScroll() {
  const groupEls = Array.from(document.querySelectorAll<HTMLElement>('[data-memory-date]'))
  if (groupEls.length === 0) return
  const topOffset = 205
  let current: string | null = null
  for (const el of groupEls) {
    const rect = el.getBoundingClientRect()
    if (rect.top <= topOffset) current = el.getAttribute('data-memory-date')
    else break
  }
  if (current && current !== activeMemoryDate.value) {
    activeMemoryDate.value = current
    scrollMemoryNavToActive(current)
  }
}

// Date navigation (all dates from cache, sorted desc) — drives both left nav & heatmap
const dateNavTimeline = computed(() => {
  return Object.entries(dateCountCache.value)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, count]) => {
      const [y, m, d] = dateKey.split('-').map(Number)
      const date = new Date(y, m, d)
      const today = new Date()
      const yesterday = new Date(today.getTime() - 86400000)
      let label: string
      if (date.toDateString() === today.toDateString()) label = '今天'
      else if (date.toDateString() === yesterday.toDateString()) label = '昨天'
      else label = `${m + 1}月${d}日`
      return { dateKey, label, count }
    })
})

const memoryDateFilter = ref<string | null>(null)

function dateKeyToRange(dateKey: string): { start: number; end: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(y, m, d).getTime()
  const end = new Date(y, m, d + 1).getTime()
  return { start, end }
}

function clickDateNav(dateKey: string) {
  if (memoryDateFilter.value === dateKey) {
    memoryDateFilter.value = null
    memoryStartTime.value = ''
    memoryEndTime.value = ''
    if (memorySearchTimer) clearTimeout(memorySearchTimer)
    loadMemory()
  } else {
    memoryDateFilter.value = dateKey
    const { start, end } = dateKeyToRange(dateKey)
    memoryStartTime.value = new Date(start).toISOString().slice(0, 16)
    memoryEndTime.value = new Date(end - 1).toISOString().slice(0, 16)
    if (memorySearchTimer) clearTimeout(memorySearchTimer)
    loadMemory()
  }
  activeMemoryDate.value = dateKey
  scrollMemoryNavToActive(dateKey)
  const [y, m] = dateKey.split('-').map(Number)
  heatmapYear.value = y
  heatmapMonth.value = m + 1
  nextTick(() => {
    document.getElementById(`memory-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// Memory heatmap & date count cache（全量日期计数，历史永久缓存，当天1分钟刷新）
const dateCountCache = ref<Record<string, number>>({})
let dateCountRefreshTimer: ReturnType<typeof setInterval> | null = null

const todayDateKey = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
})

async function loadAllDateCounts() {
  try {
    const data = await memoryApi.dateCounts()
    dateCountCache.value = data.dates
  } catch { /* ignore */ }
}

function startDateCountRefresh() {
  stopDateCountRefresh()
  dateCountRefreshTimer = setInterval(async () => {
    const now = new Date()
    try {
      const data = await memoryApi.heatmap(now.getFullYear(), now.getMonth() + 1)
      const todayDay = String(now.getDate())
      dateCountCache.value = {
        ...dateCountCache.value,
        [todayDateKey.value]: data.days[todayDay] || 0,
      }
    } catch { /* ignore */ }
  }, 60_000)
}

function stopDateCountRefresh() {
  if (dateCountRefreshTimer) {
    clearInterval(dateCountRefreshTimer)
    dateCountRefreshTimer = null
  }
}

function getDateCount(dateKey: string): number {
  return dateCountCache.value[dateKey] ?? 0
}

const heatmapYear = ref(new Date().getFullYear())
const heatmapMonth = ref(new Date().getMonth() + 1)

const heatmapDays = computed(() => {
  const days: Record<string, number> = {}
  const daysInMonth = new Date(heatmapYear.value, heatmapMonth.value, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${heatmapYear.value}-${heatmapMonth.value - 1}-${d}`
    days[String(d)] = dateCountCache.value[key] || 0
  }
  return days
})

const heatmapCells = computed(() => {
  const daysInMonth = new Date(heatmapYear.value, heatmapMonth.value, 0).getDate()
  const firstDay = new Date(heatmapYear.value, heatmapMonth.value - 1, 1).getDay()
  const leading = (firstDay + 6) % 7
  const cells: { day: number | null; count: number }[] = []
  for (let i = 0; i < leading; i++) cells.push({ day: null, count: 0 })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, count: heatmapDays.value[String(d)] || 0 })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, count: 0 })
  return cells
})

function heatmapColor(count: number): string {
  if (count <= 0) return 'bg-apple-gray-100 dark:bg-apple-gray-800'
  if (count === 1) return 'bg-brian-blue/30'
  if (count <= 3) return 'bg-brian-blue/60'
  return 'bg-brian-blue'
}

function isCurrentHeatmapMonth(): boolean {
  const now = new Date()
  return heatmapYear.value === now.getFullYear() && heatmapMonth.value === now.getMonth() + 1
}

function prevHeatmapMonth() {
  if (heatmapMonth.value === 1) { heatmapMonth.value = 12; heatmapYear.value -= 1 }
  else heatmapMonth.value -= 1
}

function nextHeatmapMonth() {
  if (isCurrentHeatmapMonth()) return
  if (heatmapMonth.value === 12) { heatmapMonth.value = 1; heatmapYear.value += 1 }
  else heatmapMonth.value += 1
}

function heatmapDateKey(day: number): string {
  return `${heatmapYear.value}-${heatmapMonth.value - 1}-${day}`
}

function isHeatmapCellActive(day: number): boolean {
  return activeMemoryDate.value === heatmapDateKey(day)
}

function clickHeatmapDay(day: number | null) {
  if (!day) return
  clickDateNav(heatmapDateKey(day))
}

// Library tab
const libraries = ref<LibraryPath[]>([])
const loadingLibs = ref(false)
const showAddLib = ref(false)
const newLib = ref({ name: '', description: '', path: '' })
const pathCheckResult = ref<{ exists: boolean; isReadable: boolean; isWritable: boolean } | null>(null)
const checkingPath = ref(false)
const libraryDetail = ref<LibraryPath | null>(null)

async function loadLibraries() {
  loadingLibs.value = true
  try { libraries.value = await libraryApi.paths() }
  catch { /* ignore */ }
  finally { loadingLibs.value = false }
}

async function checkLibPath() {
  if (!newLib.value.path) return
  checkingPath.value = true
  try { pathCheckResult.value = await libraryApi.checkPath(newLib.value.path) }
  catch { pathCheckResult.value = { exists: false, isReadable: false, isWritable: false } }
  finally { checkingPath.value = false }
}

async function handleAddLibrary() {
  if (!newLib.value.name || !newLib.value.path) return
  try {
    await libraryApi.addPath({ ...newLib.value, category: 'general' })
    showAddLib.value = false
    newLib.value = { name: '', description: '', path: '' }
    pathCheckResult.value = null
    await loadLibraries()
  } catch { /* ignore */ }
}

async function handleDeleteLibrary(id: string) {
  await libraryApi.deletePath(id)
  libraries.value = libraries.value.filter(l => l.id !== id)
}

async function handleToggleLibrary(lib: LibraryPath) {
  try {
    const result = await libraryApi.setEnabled(lib.id, !lib.enableSelfLearning)
    lib.enableSelfLearning = result.enabled
    await loadLibraries()
  } catch { /* ignore */ }
}

// Library detail
const libraryFiles = ref<LibraryFileEntry[]>([])
const libraryTree = ref<LibraryTreeNode[]>([])
const currentDirectory = ref('')
const fileKeyword = ref('')
const fileHasMore = ref(false)
const fileNextCursor = ref<string | null>(null)
const fileLoading = ref(false)
const fileLoadingMore = ref(false)
const selectedFile = ref<{ fileId: string; name: string; content: string } | null>(null)
const selectedFileLoading = ref(false)

const libraryBreadcrumb = computed(() => {
  const parts = currentDirectory.value ? currentDirectory.value.split('/').filter(Boolean) : []
  const items = [{ label: '根目录', path: '' }]
  for (let i = 0; i < parts.length; i++) {
    items.push({ label: parts[i], path: parts.slice(0, i + 1).join('/') })
  }
  return items
})

function openLibraryDetail(lib: LibraryPath) {
  libraryDetail.value = lib
  currentDirectory.value = ''
  fileKeyword.value = ''
  selectedFile.value = null
  annotations.value = []
  annotationLines.value = []
  Promise.all([loadLibraryFiles(true), loadLibraryTree()])
}

async function loadLibraryFiles(reset = true) {
  if (!libraryDetail.value) return
  if (reset) fileLoading.value = true
  else fileLoadingMore.value = true
  try {
    const data = await libraryApi.files(libraryDetail.value.id, {
      directory: currentDirectory.value,
      keyword: fileKeyword.value.trim() || undefined,
      cursor: reset ? undefined : fileNextCursor.value || undefined,
      limit: 50,
    })
    if (reset) libraryFiles.value = data.files
    else libraryFiles.value = [...libraryFiles.value, ...data.files]
    fileHasMore.value = data.has_more
    fileNextCursor.value = data.next_cursor
  } catch { /* ignore */ }
  finally {
    if (reset) fileLoading.value = false
    else fileLoadingMore.value = false
  }
}

async function loadMoreLibraryFiles() {
  if (!fileHasMore.value || fileLoadingMore.value || fileLoading.value) return
  await loadLibraryFiles(false)
}

async function loadLibraryTree() {
  if (!libraryDetail.value) return
  try { libraryTree.value = await libraryApi.tree(libraryDetail.value.id) }
  catch { libraryTree.value = [] }
}

function enterDirectory(dirPath: string) {
  currentDirectory.value = dirPath
  selectedFile.value = null
  loadLibraryFiles(true)
}

function goUpDirectory() {
  if (!currentDirectory.value) return
  const idx = currentDirectory.value.lastIndexOf('/')
  currentDirectory.value = idx > 0 ? currentDirectory.value.slice(0, idx) : ''
  selectedFile.value = null
  loadLibraryFiles(true)
}

async function openFile(file: LibraryFileEntry) {
  if (file.isDirectory) { enterDirectory(file.relativePath); return }
  selectedFileLoading.value = true
  annotations.value = []
  annotationLines.value = []

  const [contentResult, annotationsResult] = await Promise.allSettled([
    libraryApi.fileContent(file.id),
    libraryApi.fileAnnotations(file.id),
  ])

  if (contentResult.status === 'fulfilled') {
    selectedFile.value = { fileId: file.id, name: contentResult.value.fileName, content: contentResult.value.content }
  } else {
    selectedFile.value = { fileId: file.id, name: file.name, content: '文件内容读取失败' }
  }
  selectedFileLoading.value = false

  await nextTick()

  if (annotationsResult.status === 'fulfilled') {
    const list = annotationsResult.value
    for (const a of list) {
      annotations.value.push({
        id: a.id,
        question: a.question,
        result: a.result,
        selectionText: a.selection_text,
      })
    }
    await nextTick()
    for (const a of list) {
      restoreMark(a.selection_text, a.id)
    }
    recomputeLines()
  }
}

function restoreMark(text: string, id: string) {
  const container = contentAreaRef.value
  if (!container || !text) return
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const nodeText = node.textContent || ''
    const idx = nodeText.indexOf(text)
    if (idx >= 0) {
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + text.length)
        const mark = document.createElement('mark')
        mark.setAttribute('data-anchor-id', id)
        mark.className = 'doc-annotation-mark'
        range.surroundContents(mark)
      } catch { /* ignore */ }
      return
    }
  }
}

// ========== 文档展示区：注释（咨询） ==========
interface DocAnnotation {
  id: string
  question: string
  result: string
  selectionText: string
}
const annotations = ref<DocAnnotation[]>([])
const activeAnnotationId = ref<string | null>(null)
const askDialog = ref<{ selectionText: string; contextBefore: string; contextAfter: string; question: string } | null>(null)
const asking = ref(false)
const contextMenu = ref<{ x: number; y: number } | null>(null)
const contentAreaRef = ref<HTMLElement | null>(null)

interface AnnotationLine { id: string; x1: number; y1: number; x2: number; y2: number }
const annotationLines = ref<AnnotationLine[]>([])

interface ArticleSection { id: string; level: number; title: string }
const articleSections = computed<ArticleSection[]>(() => {
  const content = selectedFile.value?.content || ''
  const sections: ArticleSection[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      sections.push({ id: `sec-${sections.length}`, level: m[1].length, title: m[2].trim() })
    }
  }
  return sections
})

let pendingSelection: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number } | null = null
let pendingAskContext: { text: string; contextBefore: string; contextAfter: string; selectionStart: number; selectionEnd: number } | null = null

function handleFileContextMenu(event: MouseEvent) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const text = selection.toString().trim()
  if (!text) return
  const range = selection.getRangeAt(0)
  pendingSelection = {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  }
  const content = selectedFile.value?.content || ''
  const idx = content.indexOf(text)
  const contextBefore = idx > 0 ? content.slice(Math.max(0, idx - 500), idx) : ''
  const contextAfter = idx >= 0 ? content.slice(idx + text.length, idx + text.length + 500) : ''
  pendingAskContext = {
    text,
    contextBefore,
    contextAfter,
    selectionStart: idx >= 0 ? idx : 0,
    selectionEnd: idx >= 0 ? idx + text.length : text.length,
  }
  contextMenu.value = { x: event.clientX, y: event.clientY }
}

function closeContextMenu() {
  contextMenu.value = null
}

function openAskDialog() {
  if (!contextMenu.value || !pendingAskContext) return
  askDialog.value = {
    selectionText: pendingAskContext.text,
    contextBefore: pendingAskContext.contextBefore,
    contextAfter: pendingAskContext.contextAfter,
    question: '',
  }
  contextMenu.value = null
}

async function submitAsk() {
  if (!askDialog.value) return
  const dlg = askDialog.value
  asking.value = true
  try {
    const data = await libraryApi.queryDocument({
      selection: dlg.selectionText,
      context_before: dlg.contextBefore,
      context_after: dlg.contextAfter,
      question: dlg.question.trim() || '请解释这段内容',
    })
    const id = `ann-${Date.now()}`
    const question = dlg.question.trim() || '请解释这段内容'
    annotations.value.push({
      id,
      question,
      result: data.result,
      selectionText: dlg.selectionText,
    })
    activeAnnotationId.value = id
    markSelection(id)
    askDialog.value = null
    await nextTick()
    recomputeLines()
    // 持久化咨询卡片与关联关系
    if (selectedFile.value && pendingAskContext) {
      try {
        await libraryApi.saveAnnotation({
          library_id: libraryDetail.value?.id,
          file_id: selectedFile.value.fileId,
          selection_text: dlg.selectionText,
          selection_start: pendingAskContext.selectionStart,
          selection_end: pendingAskContext.selectionEnd,
          question,
          result: data.result,
          llm_id: data.llm_id,
        })
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  finally { asking.value = false }
}

function handleCardClick(id: string) {
  activeAnnotationId.value = activeAnnotationId.value === id ? null : id
}

function scrollToSection(section: ArticleSection) {
  const container = contentAreaRef.value
  if (!container) return
  const headings = container.querySelectorAll('h1, h2, h3, h4')
  for (const h of headings) {
    if ((h.textContent || '').trim() === section.title) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      break
    }
  }
}

function markSelection(id: string) {
  if (!pendingSelection) return
  try {
    const range = document.createRange()
    range.setStart(pendingSelection.startContainer, pendingSelection.startOffset)
    range.setEnd(pendingSelection.endContainer, pendingSelection.endOffset)
    const mark = document.createElement('mark')
    mark.setAttribute('data-anchor-id', id)
    mark.className = 'doc-annotation-mark'
    range.surroundContents(mark)
  } catch { /* 跨节点选中无法包裹，跳过下划线 */ }
}

function recomputeLines() {
  const container = contentAreaRef.value
  if (!container) { annotationLines.value = []; return }
  const cRect = container.getBoundingClientRect()
  const lines: AnnotationLine[] = []
  for (const ann of annotations.value) {
    const anchor = container.querySelector(`[data-anchor-id="${ann.id}"]`) as HTMLElement | null
    const card = container.querySelector(`[data-card-id="${ann.id}"]`) as HTMLElement | null
    if (!anchor || !card) continue
    const aRect = anchor.getBoundingClientRect()
    const kRect = card.getBoundingClientRect()
    const ax = aRect.left - cRect.left + aRect.width / 2
    const ay = aRect.top - cRect.top + aRect.height / 2
    const kx = kRect.left - cRect.left
    const ky = kRect.top - cRect.top + kRect.height / 2
    lines.push({ id: ann.id, x1: kx, y1: ky, x2: ax, y2: ay })
  }
  annotationLines.value = lines
}

function closeFileModal() {
  selectedFile.value = null
  annotations.value = []
  annotationLines.value = []
  activeAnnotationId.value = null
  askDialog.value = null
  contextMenu.value = null
  pendingSelection = null
  pendingAskContext = null
}

const libraryFileSentinel = ref<HTMLElement | null>(null)
let libraryFileObserver: IntersectionObserver | null = null
watch(libraryFileSentinel, (el) => {
  libraryFileObserver?.disconnect()
  libraryFileObserver = null
  if (el) {
    libraryFileObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreLibraryFiles()
    }, { rootMargin: '200px' })
    libraryFileObserver.observe(el)
  }
})

let fileSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(fileKeyword, () => {
  if (fileSearchTimer) clearTimeout(fileSearchTimer)
  fileSearchTimer = setTimeout(() => { loadLibraryFiles(true) }, 300)
})

// Profile tab
const profile = ref<UserProfileData | null>(null)
const profileHistory = ref<ProfileHistoryItem[]>([])
const loadingProfile = ref(false)
const generatingProfile = ref(false)
const resettingProfile = ref(false)
const resetProfileConfirm = ref(false)
const selectedVersion = ref<ProfileVersionData | null>(null)
const loadingVersion = ref(false)

async function loadProfile() {
  loadingProfile.value = true
  try {
    profile.value = await userProfileApi.get()
    profileHistory.value = await userProfileApi.history()
  } catch { /* ignore */ }
  finally { loadingProfile.value = false }
}

async function handleGenerateProfile() {
  generatingProfile.value = true
  try {
    await userProfileApi.generate()
    await loadProfile()
  } catch { /* ignore */ }
  finally { generatingProfile.value = false }
}

function handleResetProfile() {
  resetProfileConfirm.value = true
}

async function confirmResetProfile() {
  resetProfileConfirm.value = false
  resettingProfile.value = true
  try {
    await userProfileApi.reset()
    selectedVersion.value = null
    await loadProfile()
  } catch { /* ignore */ }
  finally { resettingProfile.value = false }
}

async function openVersion(version: number) {
  loadingVersion.value = true
  selectedVersion.value = null
  try {
    selectedVersion.value = await userProfileApi.version(version)
  } catch { /* ignore */ }
  finally { loadingVersion.value = false }
}

function dimensionDisplayValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join('、')
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
      .join(' · ')
  }
  return String(v)
}

function formatEvidence(ev: unknown): string {
  if (typeof ev === 'string') return ev
  if (ev && typeof ev === 'object') {
    const o = ev as Record<string, unknown>
    if (o.source || o.detail) {
      return o.source ? `${o.source}${o.detail ? `: ${o.detail}` : ''}` : String(o.detail)
    }
    const entries = Object.entries(o)
    if (entries.length > 0) return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
  }
  return String(ev ?? '')
}

function stabilityLabel(s?: string): string {
  if (s === 'stable') return '稳定'
  if (s === 'drifting') return '漂移中'
  if (s === 'emerging') return '新兴'
  return ''
}

function stabilityClass(s?: string): string {
  if (s === 'stable') return 'bg-success-green/10 text-success-green'
  if (s === 'drifting') return 'bg-warning-orange/10 text-warning-orange'
  if (s === 'emerging') return 'bg-brian-blue/10 text-brian-blue'
  return ''
}

function formatProfileTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Tag graph tab（Obsidian 风格力导向图）
interface TagLayoutNode extends GraphNode { x: number; y: number; r: number; color: string }

const graphNodes = ref<GraphNode[]>([])
const graphEdges = ref<GraphEdge[]>([])
const loadingGraph = ref(false)
const selectedTag = ref<string | null>(null)
const selectedTagMemories = ref<MemoryItem[]>([])
const tagLayoutNodes = ref<TagLayoutNode[]>([])
const hoveredTagId = ref<string | null>(null)
const tagGraphScale = ref(1)
const tagGraphTx = ref(0)
const tagGraphTy = ref(0)
const draggingTagId = ref<string | null>(null)
const panning = ref(false)
const panStart = ref<{ x: number; y: number } | null>(null)
const tagSvgRef = ref<SVGSVGElement | null>(null)
const keywordGraphNodes = ref<GraphNode[]>([])
const keywordGraphEdges = ref<GraphEdge[]>([])
const loadingKeywordGraph = ref(false)
const selectedKeyword = ref<string | null>(null)
const selectedKeywordMemories = ref<MemoryItem[]>([])
const keywordLayoutNodes = ref<TagLayoutNode[]>([])
const keywordHoveredId = ref<string | null>(null)
const keywordScale = ref(1)
const keywordTx = ref(0)
const keywordTy = ref(0)
const keywordDraggingId = ref<string | null>(null)
const keywordPanning = ref(false)
const keywordPanStart = ref<{ x: number; y: number } | null>(null)
const keywordSvgRef = ref<SVGSVGElement | null>(null)
const tagSearch = ref('')
const clearingTagGraph = ref(false)
const keywordSearch = ref('')
const clearingKeywordGraph = ref(false)

const tagGraphRepulsion = ref(2000)
const tagGraphSpringStrength = ref(0.2)
const tagGraphShowLabels = ref(true)
const keywordGraphRepulsion = ref(2000)
const keywordGraphSpringStrength = ref(0.2)
const keywordGraphShowLabels = ref(true)
let rerunLayoutTimer: ReturnType<typeof setTimeout> | null = null
let saveTagConfigTimer: ReturnType<typeof setTimeout> | null = null
let saveKeywordConfigTimer: ReturnType<typeof setTimeout> | null = null

async function loadGraphConfigs() {
  try {
    const [tagCfg, kwCfg] = await Promise.all([
      configApi.graphVisualization.get('tag'),
      configApi.graphVisualization.get('keyword'),
    ])
    tagGraphRepulsion.value = tagCfg.graph_repulsion ?? 2000
    tagGraphSpringStrength.value = tagCfg.graph_spring_strength ?? 0.2
    tagGraphShowLabels.value = tagCfg.graph_show_labels ?? true
    keywordGraphRepulsion.value = kwCfg.graph_repulsion ?? 2000
    keywordGraphSpringStrength.value = kwCfg.graph_spring_strength ?? 0.2
    keywordGraphShowLabels.value = kwCfg.graph_show_labels ?? true
  } catch { /* use defaults */ }
}

function saveTagGraphConfig() {
  if (saveTagConfigTimer) clearTimeout(saveTagConfigTimer)
  saveTagConfigTimer = setTimeout(() => {
    configApi.graphVisualization.save('tag', {
      graph_repulsion: tagGraphRepulsion.value,
      graph_spring_strength: tagGraphSpringStrength.value,
      graph_show_labels: tagGraphShowLabels.value,
    }).catch(() => {})
  }, 500)
}

function saveKeywordGraphConfig() {
  if (saveKeywordConfigTimer) clearTimeout(saveKeywordConfigTimer)
  saveKeywordConfigTimer = setTimeout(() => {
    configApi.graphVisualization.save('keyword', {
      graph_repulsion: keywordGraphRepulsion.value,
      graph_spring_strength: keywordGraphSpringStrength.value,
      graph_show_labels: keywordGraphShowLabels.value,
    }).catch(() => {})
  }, 500)
}

function rerunLayouts() {
  if (rerunLayoutTimer) clearTimeout(rerunLayoutTimer)
  rerunLayoutTimer = setTimeout(() => {
    if (graphNodes.value.length > 0) {
      tagLayoutNodes.value = forceDirectedLayout(graphNodes.value, graphEdges.value, 700, 700, tagGraphRepulsion.value, tagGraphSpringStrength.value)
    }
    if (keywordGraphNodes.value.length > 0) {
      keywordLayoutNodes.value = forceDirectedLayout(keywordGraphNodes.value, keywordGraphEdges.value, 700, 700, keywordGraphRepulsion.value, keywordGraphSpringStrength.value)
    }
  }, 80)
}

watch([tagGraphRepulsion, tagGraphSpringStrength], () => { rerunLayouts(); saveTagGraphConfig() })
watch(tagGraphShowLabels, saveTagGraphConfig)
watch([keywordGraphRepulsion, keywordGraphSpringStrength], () => { rerunLayouts(); saveKeywordGraphConfig() })
watch(keywordGraphShowLabels, saveKeywordGraphConfig)

function forceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number, _repulsion = 2000, _springStrength = 0.2): TagLayoutNode[] {
  const cx = width / 2
  const cy = height / 2
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>()
  const degree = new Map<string, number>()

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
    const r = Math.min(width, height) * 0.38
    positions.set(nodes[i].id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0, vy: 0,
    })
    degree.set(nodes[i].id, 0)
  }
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1)
    degree.set(e.target, (degree.get(e.target) || 0) + 1)
  }

  const iterations = 400
  const springLength = 60
  const springStrength = _springStrength
  const repulsion = _repulsion
  const repulsionCutoff = 300
  const centerStrength = 0.004
  const damping = 0.88
  const margin = 40
  const boundaryStrength = 0.1
  const maxVelocity = 50

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = positions.get(nodes[i].id)!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = positions.get(nodes[j].id)!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy
        if (distSq > repulsionCutoff * repulsionCutoff) continue
        const dist = Math.sqrt(distSq) || 1
        const force = repulsion / Math.max(distSq, 100)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }
    for (const e of edges) {
      const a = positions.get(e.source)
      const b = positions.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - springLength) * springStrength * Math.min(e.weight, 3)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    for (const n of nodes) {
      const p = positions.get(n.id)!
      p.vx += (cx - p.x) * centerStrength
      p.vy += (cy - p.y) * centerStrength
      if (p.x < margin) p.vx += boundaryStrength * (margin - p.x)
      if (p.x > width - margin) p.vx -= boundaryStrength * (p.x - (width - margin))
      if (p.y < margin) p.vy += boundaryStrength * (margin - p.y)
      if (p.y > height - margin) p.vy -= boundaryStrength * (p.y - (height - margin))
    }
    for (const n of nodes) {
      const p = positions.get(n.id)!
      if (Math.abs(p.vx) > maxVelocity) p.vx = Math.sign(p.vx) * maxVelocity
      if (Math.abs(p.vy) > maxVelocity) p.vy = Math.sign(p.vy) * maxVelocity
      p.x += p.vx
      p.y += p.vy
      p.vx *= damping
      p.vy *= damping
    }
  }

  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight || 0))
  return nodes.map((n) => {
    const p = positions.get(n.id)!
    const d = degree.get(n.id) || 0
    const wRatio = Math.min((n.weight || 0) / maxWeight, 1)
    const hue = 210 - 210 * wRatio
    return {
      ...n,
      x: p.x,
      y: p.y,
      r: 3 + Math.min(Math.floor(Math.log10(Math.max(d, 1))) + 1, 4),
      color: `hsl(${hue}, 75%, 52%)`,
    }
  })
}

const tagNeighbors = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const e of graphEdges.value) {
    if (!map.has(e.source)) map.set(e.source, new Set())
    if (!map.has(e.target)) map.set(e.target, new Set())
    map.get(e.source)!.add(e.target)
    map.get(e.target)!.add(e.source)
  }
  return map
})

const tagNodePosMap = computed(() => {
  const map = new Map<string, TagLayoutNode>()
  for (const n of tagLayoutNodes.value) map.set(n.id, n)
  return map
})

function isTagNodeDimmed(nodeId: string): boolean {
  if (!hoveredTagId.value && !selectedTag.value) return false
  const focusId = hoveredTagId.value || selectedTag.value
  if (nodeId === focusId) return false
  const neighbors = tagNeighbors.value.get(focusId!)
  return !neighbors?.has(nodeId)
}

function isTagEdgeHighlighted(edge: GraphEdge): boolean {
  const focusId = hoveredTagId.value || selectedTag.value
  if (!focusId) return false
  return edge.source === focusId || edge.target === focusId
}

async function loadTagGraph() {
  loadingGraph.value = true
  try {
    const data = await memoryApi.tagGraph()
    graphNodes.value = data.nodes || []
    graphEdges.value = data.edges || []
    tagLayoutNodes.value = forceDirectedLayout(graphNodes.value, graphEdges.value, 700, 700, tagGraphRepulsion.value, tagGraphSpringStrength.value)
  } catch { /* ignore */ }
  finally { loadingGraph.value = false }
}

function svgToView(event: MouseEvent): { x: number; y: number } {
  const svg = tagSvgRef.value
  const rect = svg ? svg.getBoundingClientRect() : null
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
  const scale = Math.min(rect.width / 700, rect.height / 700)
  const offsetX = (rect.width - 700 * scale) / 2
  const offsetY = (rect.height - 700 * scale) / 2
  const viewX = (event.clientX - rect.left - offsetX) / scale
  const viewY = (event.clientY - rect.top - offsetY) / scale
  return { x: (viewX - tagGraphTx.value) / tagGraphScale.value, y: (viewY - tagGraphTy.value) / tagGraphScale.value }
}

function onTagGraphWheel(event: WheelEvent) {
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  tagGraphScale.value = Math.min(3, Math.max(0.4, tagGraphScale.value * delta))
}

function onTagGraphMouseDown(event: MouseEvent) {
  panning.value = true
  panStart.value = { x: event.clientX, y: event.clientY }
}

function onTagGraphMouseMove(event: MouseEvent) {
  if (panning.value && panStart.value) {
    tagGraphTx.value += event.clientX - panStart.value.x
    tagGraphTy.value += event.clientY - panStart.value.y
    panStart.value = { x: event.clientX, y: event.clientY }
  }
  if (draggingTagId.value) {
    const p = svgToView(event)
    const node = tagLayoutNodes.value.find(n => n.id === draggingTagId.value)
    if (node) { node.x = p.x; node.y = p.y }
  }
}

function onTagGraphMouseUp() {
  panning.value = false
  panStart.value = null
  draggingTagId.value = null
}

function onTagNodeMouseDown(event: MouseEvent, nodeId: string) {
  event.stopPropagation()
  draggingTagId.value = nodeId
}

async function selectTagNode(tagId: string) {
  selectedTag.value = selectedTag.value === tagId ? null : tagId
  if (selectedTag.value) {
    try {
      const name = graphNodes.value.find(n => n.id === tagId)?.name || tagId
      selectedTagMemories.value = await memoryApi.byTag('default-user', name)
    } catch { selectedTagMemories.value = [] }
  } else {
    selectedTagMemories.value = []
  }
}

async function selectKeywordNode(nodeId: string) {
  selectedKeyword.value = selectedKeyword.value === nodeId ? null : nodeId
  if (selectedKeyword.value) {
    try {
      const kw = keywordGraphNodes.value.find(n => n.id === nodeId)?.name || nodeId
      const data = await memoryApi.search('default-user', { keyword: kw, limit: 20 })
      selectedKeywordMemories.value = data.memories
    } catch { selectedKeywordMemories.value = [] }
  } else {
    selectedKeywordMemories.value = []
  }
}

const keywordNeighbors = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const e of keywordGraphEdges.value) {
    if (!map.has(e.source)) map.set(e.source, new Set())
    if (!map.has(e.target)) map.set(e.target, new Set())
    map.get(e.source)!.add(e.target)
    map.get(e.target)!.add(e.source)
  }
  return map
})

const keywordNodePosMap = computed(() => {
  const map = new Map<string, TagLayoutNode>()
  for (const n of keywordLayoutNodes.value) map.set(n.id, n)
  return map
})

function isKeywordNodeDimmed(nodeId: string): boolean {
  if (!keywordHoveredId.value && !selectedKeyword.value) return false
  const focusId = keywordHoveredId.value || selectedKeyword.value
  if (nodeId === focusId) return false
  const neighbors = keywordNeighbors.value.get(focusId!)
  return !neighbors?.has(nodeId)
}

function isKeywordEdgeHighlighted(edge: GraphEdge): boolean {
  const focusId = keywordHoveredId.value || selectedKeyword.value
  if (!focusId) return false
  return edge.source === focusId || edge.target === focusId
}

async function loadKeywordGraph() {
  loadingKeywordGraph.value = true
  try {
    const data = await memoryApi.keywordGraph()
    keywordGraphNodes.value = data.nodes || []
    keywordGraphEdges.value = data.edges || []
    keywordLayoutNodes.value = forceDirectedLayout(keywordGraphNodes.value, keywordGraphEdges.value, 700, 700, keywordGraphRepulsion.value, keywordGraphSpringStrength.value)
  } catch { keywordGraphNodes.value = []; keywordGraphEdges.value = []; keywordLayoutNodes.value = [] }
  finally { loadingKeywordGraph.value = false }
}

function keywordSvgToView(event: MouseEvent): { x: number; y: number } {
  const svg = keywordSvgRef.value
  const rect = svg ? svg.getBoundingClientRect() : null
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
  const scale = Math.min(rect.width / 700, rect.height / 700)
  const offsetX = (rect.width - 700 * scale) / 2
  const offsetY = (rect.height - 700 * scale) / 2
  const viewX = (event.clientX - rect.left - offsetX) / scale
  const viewY = (event.clientY - rect.top - offsetY) / scale
  return { x: (viewX - keywordTx.value) / keywordScale.value, y: (viewY - keywordTy.value) / keywordScale.value }
}

function onKeywordGraphWheel(event: WheelEvent) {
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  keywordScale.value = Math.min(3, Math.max(0.4, keywordScale.value * delta))
}

function onKeywordGraphMouseDown(event: MouseEvent) {
  keywordPanning.value = true
  keywordPanStart.value = { x: event.clientX, y: event.clientY }
}

function onKeywordGraphMouseMove(event: MouseEvent) {
  if (keywordPanning.value && keywordPanStart.value) {
    keywordTx.value += event.clientX - keywordPanStart.value.x
    keywordTy.value += event.clientY - keywordPanStart.value.y
    keywordPanStart.value = { x: event.clientX, y: event.clientY }
  }
  if (keywordDraggingId.value) {
    const p = keywordSvgToView(event)
    const node = keywordLayoutNodes.value.find(n => n.id === keywordDraggingId.value)
    if (node) { node.x = p.x; node.y = p.y }
  }
}

function onKeywordGraphMouseUp() {
  keywordPanning.value = false
  keywordPanStart.value = null
  keywordDraggingId.value = null
}

function onKeywordNodeMouseDown(event: MouseEvent, nodeId: string) {
  event.stopPropagation()
  keywordDraggingId.value = nodeId
}

// ---- 一键清理 ----

async function clearTagGraph() {
  if (clearingTagGraph.value) return
  clearingTagGraph.value = true
  try {
    await memoryApi.clearTagGraph()
    graphNodes.value = []
    graphEdges.value = []
    tagLayoutNodes.value = []
    selectedTag.value = null
    selectedTagMemories.value = []
    tagSearch.value = ''
    tagGraphScale.value = 1
    tagGraphTx.value = 0
    tagGraphTy.value = 0
  } catch { /* ignore */ }
  finally { clearingTagGraph.value = false }
}

async function clearKeywordGraph() {
  if (clearingKeywordGraph.value) return
  clearingKeywordGraph.value = true
  try {
    await memoryApi.clearKeywordGraph()
    keywordGraphNodes.value = []
    keywordGraphEdges.value = []
    keywordLayoutNodes.value = []
    selectedKeyword.value = null
    selectedKeywordMemories.value = []
    keywordSearch.value = ''
    keywordScale.value = 1
    keywordTx.value = 0
    keywordTy.value = 0
  } catch { /* ignore */ }
  finally { clearingKeywordGraph.value = false }
}

// ---- 搜索定位居中 ----

async function focusTagNode() {
  const q = tagSearch.value.trim().toLowerCase()
  if (!q) return
  const nodes = tagLayoutNodes.value
  let target = nodes.find((n) => n.name.toLowerCase() === q)
  if (!target) target = nodes.filter((n) => n.name.toLowerCase().includes(q)).sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]
  if (!target) return
  tagGraphScale.value = 1.6
  tagGraphTx.value = 350 - target.x * tagGraphScale.value
  tagGraphTy.value = 350 - target.y * tagGraphScale.value
  selectedTag.value = target.id
  try {
    const name = graphNodes.value.find((n) => n.id === target!.id)?.name || target!.id
    selectedTagMemories.value = await memoryApi.byTag('default-user', name)
  } catch { selectedTagMemories.value = [] }
}

async function focusKeywordNode() {
  const q = keywordSearch.value.trim().toLowerCase()
  if (!q) return
  const nodes = keywordLayoutNodes.value
  let target = nodes.find((n) => n.name.toLowerCase() === q)
  if (!target) target = nodes.filter((n) => n.name.toLowerCase().includes(q)).sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]
  if (!target) return
  keywordScale.value = 1.6
  keywordTx.value = 350 - target.x * keywordScale.value
  keywordTy.value = 350 - target.y * keywordScale.value
  selectedKeyword.value = target.id
  try {
    const kw = keywordGraphNodes.value.find((n) => n.id === target!.id)?.name || target!.id
    const data = await memoryApi.search('default-user', { keyword: kw, limit: 20 })
    selectedKeywordMemories.value = data.memories
  } catch { selectedKeywordMemories.value = [] }
}

function resetTagGraphView() {
  tagGraphScale.value = 1
  tagGraphTx.value = 0
  tagGraphTy.value = 0
}

function resetKeywordGraphView() {
  keywordScale.value = 1
  keywordTx.value = 0
  keywordTy.value = 0
}

// Track which tabs have been loaded (lazy-load on first activation)
const loadedTabs = ref<Set<string>>(new Set())

function loadTabData(tab: InfoTabKey) {
  if (loadedTabs.value.has(tab)) return
  loadedTabs.value = new Set([...loadedTabs.value, tab])
  switch (tab) {
    case 'history':
      loadHistory()
      break
    case 'memory':
      loadMemory()
      loadAllDateCounts().then(() => startDateCountRefresh())
      break
    case 'library':
      loadLibraries()
      break
    case 'tagGraph':
      loadGraphConfigs().then(() => loadTagGraph())
      break
    case 'keywordGraph':
      loadGraphConfigs().then(() => loadKeywordGraph())
      break
    case 'profile':
      loadProfile()
      break
  }
}

onMounted(() => {
  loadTabData(activeTab.value)
  window.addEventListener('scroll', onMemoryScroll, { passive: true })
  document.addEventListener('click', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onMemoryScroll)
  document.removeEventListener('click', closeContextMenu)
  memoryObserver?.disconnect()
  memoryObserver = null
  libraryFileObserver?.disconnect()
  libraryFileObserver = null
  stopDateCountRefresh()
})

watch(activeTab, (val) => {
  localStorage.setItem('brian-info-active-tab', val)
  loadTabData(val)
})

let historySearchTimer: ReturnType<typeof setTimeout> | null = null
watch([historySearch, historyStartTime, historyEndTime], () => {
  if (historySearchTimer) clearTimeout(historySearchTimer)
  historySearchTimer = setTimeout(() => { loadHistory() }, 300)
})

let memorySearchTimer: ReturnType<typeof setTimeout> | null = null
watch([memoryStartTime, memoryEndTime], () => {
  if (memorySearchTimer) clearTimeout(memorySearchTimer)
  memorySearchTimer = setTimeout(() => { loadMemory() }, 300)
})

function searchMemoryByEnter() {
  if (memorySearchTimer) clearTimeout(memorySearchTimer)
  loadMemory()
}
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="sticky top-14 z-30 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <PageBreadcrumb :path="pagePath" />
        </div>
        <div class="px-6">
          <div class="flex items-center gap-1 mt-3 mb-4 border-b border-apple-gray-200 dark:border-apple-gray-700 pb-2">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              :class="[
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key ? 'bg-brian-blue text-white' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
              ]"
              @click="activeTab = tab.key"
            >
              <component :is="tab.icon" :size="15" />
              {{ tab.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- History tab -->
      <div v-if="activeTab === 'history'" class="px-6 pb-8 space-y-4">
        <div v-if="loadingHistory" class="text-center py-8 text-apple-gray-400">加载中...</div>
        <div v-else-if="historyTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无历史会话</div>
        <div v-else class="flex gap-6">
          <div class="w-40 flex-shrink-0">
            <div class="sticky top-[160px] space-y-1 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
              <button
                v-for="group in historyTimeline"
                :key="group.dateKey"
                :id="`history-nav-${group.dateKey}`"
                class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                :class="activeHistoryDate === group.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
                @click="scrollToHistoryDate(group.dateKey)"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeHistoryDate === group.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
                <span>{{ group.label }}</span>
                <span class="ml-auto text-apple-gray-300">{{ group.items.length }}</span>
              </button>
            </div>
          </div>
          <div class="flex-1 min-w-0 space-y-4">
            <div class="sticky top-[160px] z-20 flex items-center gap-3 flex-wrap bg-white dark:bg-apple-dark-bg py-2 -mx-1 px-1 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
              <div class="relative flex-1 max-w-md">
                <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                <input v-model="historySearch" placeholder="搜索会话内容或标题..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
              <div class="flex items-center gap-2 text-xs text-apple-gray-500">
                <input v-model="historyStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <span>至</span>
                <input v-model="historyEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
              <button
                v-if="filteredHistory.length > 0"
                class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brian-blue hover:bg-brian-blue/10 rounded-lg"
                @click="toggleHistorySelectAll"
              >
                <component :is="allHistorySelected ? CheckSquare : Square" :size="14" /> {{ allHistorySelected ? '取消全选' : '全选' }}
              </button>
              <button
                class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg"
                :class="selectedSessions.size > 0 ? '' : 'opacity-40 cursor-not-allowed'"
                :disabled="selectedSessions.size === 0"
                @click="requestBatchDelete()"
              >
                <Trash2 :size="14" /> 删除所选{{ selectedSessions.size > 0 ? `(${selectedSessions.size})` : '' }}
              </button>
            </div>
            <div class="space-y-3">
              <template v-for="group in historyTimeline" :key="group.dateKey">
              <div :id="`history-group-${group.dateKey}`" class="flex items-center gap-2 pt-1 scroll-mt-[210px]">
                <span class="text-sm font-semibold">{{ group.label }}</span>
                <span class="text-xs text-apple-gray-400">({{ group.items.length }})</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                <div
                  v-for="item in group.items"
                  :key="item.sessionId"
                  class="block-card rounded-xl p-3 cursor-pointer flex flex-col gap-1.5 h-44"
                  :class="selectedSessions.has(item.sessionId) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
                  @click="openSession(item.sessionId)"
                >
                  <div class="flex items-start justify-between gap-1">
                    <p class="text-sm font-semibold truncate min-w-0 flex-1">{{ item.sessionTitle || '新会话' }}</p>
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                      <button class="text-apple-gray-300 hover:text-brian-blue" title="选择" @click.stop="toggleHistorySelect(item.sessionId)">
                        <component :is="selectedSessions.has(item.sessionId) ? CheckSquare : Square" :size="14" />
                      </button>
                      <button class="text-apple-gray-400 hover:text-error-red" title="删除" @click.stop="requestDeleteSession(item.sessionId)">
                        <Trash2 :size="14" />
                      </button>
                    </div>
                  </div>
                  <span class="text-xs text-apple-gray-400">{{ formatTime(item.lastTime) }}</span>
                  <div class="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="输入 / 输出 Token">
                      <p class="text-apple-gray-400">Tokens</p>
                      <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">{{ formatTokens(item.inputTokens) }} / {{ formatTokens(item.outputTokens) }}</p>
                    </div>
                    <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="问答次数">
                      <p class="text-apple-gray-400">问答</p>
                      <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200">{{ item.qaCount ?? 0 }}</p>
                    </div>
                    <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="问题 / 回答字符数">
                      <p class="text-apple-gray-400">字数</p>
                      <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">{{ formatTokens(item.questionChars) }} / {{ formatTokens(item.answerChars) }}</p>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1 overflow-hidden flex-1 min-h-0 items-end">
                    <button
                      class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-brian-blue bg-brian-blue/5 hover:bg-brian-blue/10 transition-colors"
                      @click.stop="openViewTags(item)"
                    >
                      <Tag :size="12" /> 查看标签
                    </button>
                  </div>
                </div>
              </div>
            </template>
            </div>
          </div>
        </div>

        <div v-if="historyTimeline.length > 0" class="fixed bottom-6 left-6 z-20 w-40 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-sm rounded-xl p-2 shadow-sm">
          <div class="grid grid-cols-7 gap-0.5">
            <div
              v-for="(cell, i) in historyHeatmapCells"
              :key="i"
              :title="cell.day ? `${cell.day}日: ${cell.count} 个会话` : ''"
              class="aspect-square rounded-[3px]"
              :class="[
                cell.day ? historyHeatmapColor(cell.count) : 'bg-transparent',
                cell.day ? 'cursor-pointer hover:ring-2 hover:ring-brian-blue/60' : '',
                cell.day && isHistoryHeatmapCellActive(cell.day) ? 'ring-2 ring-brian-blue' : '',
              ]"
              @click="clickHistoryHeatmapDay(cell.day)"
            />
          </div>
          <div class="flex items-center justify-center mt-2">
            <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ historyHeatmapYear }}/{{ String(historyHeatmapMonth).padStart(2, '0') }}</span>
          </div>
        </div>

        <!-- 删除确认弹窗 -->
        <div v-if="deleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="deleteConfirm = null">
          <div class="block-card w-full max-w-sm mx-4 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">确认删除</h3>
              <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="deleteConfirm = null"><X :size="18" /></button>
            </div>
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
              {{ deleteConfirm.type === 'batch' ? `确定删除选中的 ${selectedSessions.size} 个会话及其全部消息吗？` : '确定删除该会话及其全部消息吗？' }}
            </p>
            <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的记忆、标签与向量数据，且不可恢复。</p>
            <div class="flex justify-end gap-2 mt-6">
              <button class="btn-secondary" @click="deleteConfirm = null">取消</button>
              <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmDelete">确认删除</button>
            </div>
          </div>
        </div>

        <!-- 查看标签弹窗 -->
        <div v-if="viewingTagsSession" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="viewingTagsSession = null">
          <div class="block-card w-full max-w-md mx-4 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">会话标签</h3>
              <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="viewingTagsSession = null"><X :size="18" /></button>
            </div>
            <p class="text-sm text-apple-gray-500 mb-3 truncate">{{ viewingTagsSession.sessionTitle || '新会话' }}</p>
            <div v-if="!viewingTagsSession.tags || viewingTagsSession.tags.length === 0" class="text-sm text-apple-gray-400 py-4 text-center">无标签</div>
            <div v-else class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              <span v-for="tag in viewingTagsSession.tags" :key="tag" class="px-2.5 py-1 rounded-full text-sm bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Memory tab -->
      <div v-if="activeTab === 'memory'" class="px-6 pb-8 space-y-4">
        <div v-if="loadingMemory" class="text-center py-8 text-apple-gray-400">加载中...</div>
        <div v-else-if="dateNavTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无记忆</div>
        <div v-else class="flex gap-6">
          <div class="w-40 flex-shrink-0">
            <div class="sticky top-[160px] space-y-1 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
              <button
                v-for="item in dateNavTimeline"
                :key="item.dateKey"
                :id="`memory-nav-${item.dateKey}`"
                class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                :class="activeMemoryDate === item.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
                @click="clickDateNav(item.dateKey)"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeMemoryDate === item.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
                <span>{{ item.label }}</span>
                <span class="ml-auto text-apple-gray-300">{{ item.count }}</span>
              </button>
            </div>
          </div>
          <div class="flex-1 min-w-0 space-y-4">
            <div v-if="memoryDateFilter" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-brian-blue/5 text-sm text-brian-blue">
              <span>已筛选: {{ dateNavTimeline.find(i => i.dateKey === memoryDateFilter)?.label || memoryDateFilter }}</span>
              <button class="ml-auto px-2 py-0.5 text-xs rounded bg-brian-blue/10 hover:bg-brian-blue/20 transition-colors" @click="clickDateNav(memoryDateFilter)">清除筛选</button>
            </div>
            <div class="sticky top-[160px] z-20 flex items-center gap-3 flex-wrap bg-white dark:bg-apple-dark-bg py-2 -mx-1 px-1 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
              <div class="relative flex-1 max-w-md">
                <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                <input v-model="memorySearch" placeholder="搜索记忆内容..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="searchMemoryByEnter" />
              </div>
              <input v-model="memoryTag" placeholder="按标签搜索..." class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="searchMemoryByEnter" />
              <div class="flex items-center gap-2 text-xs text-apple-gray-500">
                <input v-model="memoryStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <span>至</span>
                <input v-model="memoryEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
              <button
                v-if="memories.length > 0"
                class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brian-blue hover:bg-brian-blue/10 rounded-lg"
                @click="toggleSelectAllMemory"
              >
                <component :is="allMemoriesSelected ? CheckSquare : Square" :size="14" /> {{ allMemoriesSelected ? '取消全选' : '全选' }}
              </button>
              <button
                class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg"
                :class="selectedMemories.size > 0 ? '' : 'opacity-40 cursor-not-allowed'"
                :disabled="selectedMemories.size === 0"
                @click="requestMemoryDelete()"
              >
                <Trash2 :size="14" /> 删除所选{{ selectedMemories.size > 0 ? `(${selectedMemories.size})` : '' }}
              </button>
            </div>
            <div class="space-y-3">
              <template v-for="group in memoryTimeline" :key="group.dateKey">
                <div :id="`memory-group-${group.dateKey}`" :data-memory-date="group.dateKey" class="flex items-center gap-2 pt-1 scroll-mt-[210px]">
                  <span class="text-sm font-semibold">{{ group.label }}</span>
                  <span class="text-xs text-apple-gray-400">({{ getDateCount(group.dateKey) }})</span>
                </div>
                <div
                  v-for="mem in group.items"
                  :key="mem.id"
                  class="block-card rounded-xl overflow-hidden cursor-pointer"
                  :class="selectedMemories.has(mem.id) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
                  @click="expandedMemory = expandedMemory === mem.id ? null : mem.id"
                >
                  <div class="p-4 flex items-start gap-3">
                    <button class="mt-0.5 text-apple-gray-300 hover:text-brian-blue flex-shrink-0" @click.stop="toggleMemorySelect(mem.id)">
                      <component :is="selectedMemories.has(mem.id) ? CheckSquare : Square" :size="16" />
                    </button>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-apple-gray-400">{{ new Date(mem.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
                          <span class="text-xs text-apple-gray-300">#{{ mem.id.slice(-8) }}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span :class="['px-2 py-0.5 rounded text-xs font-medium', typeColors[mem.type] || 'bg-gray-100 text-gray-600']">{{ typeLabels[mem.type] || mem.type }}</span>
                          <button class="p-1 rounded-lg text-apple-gray-400 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" title="删除" @click.stop="requestMemoryDelete(mem.id)">
                            <Trash2 :size="14" />
                          </button>
                        </div>
                      </div>
                      <p class="text-sm" :class="expandedMemory === mem.id ? '' : 'line-clamp-2'">{{ mem.content }}</p>
                      <div class="flex items-center gap-3 mt-2">
                        <div v-if="mem.tags?.length" class="flex flex-wrap gap-1">
                          <span v-for="tag in mem.tags" :key="tag" class="px-1.5 py-0.5 rounded text-xs bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
                        </div>
                        <span class="text-xs text-apple-gray-400 ml-auto">置信度: {{ Math.round((mem.confidence ?? 0) * 100) }}%</span>
                        <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="expandedMemory === mem.id ? 'rotate-90' : ''" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <div v-if="memoryDateFilter && memoryTimeline.length === 0 && !loadingMemory" class="text-center py-8 text-apple-gray-400">该日期暂无记忆</div>
              <div ref="memorySentinel" v-if="!memoryDateFilter && (hasMoreMemory || loadingMoreMemory)" class="text-center py-4 text-xs text-apple-gray-400">
                {{ loadingMoreMemory ? '加载中...' : '继续上滑加载更多' }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="dateNavTimeline.length > 0" class="fixed bottom-6 left-6 z-20 w-32 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-sm rounded-xl p-1.5 shadow-sm">
          <div class="grid grid-cols-7 gap-1">
            <div
              v-for="(cell, i) in heatmapCells"
              :key="i"
              :title="cell.day ? `${cell.day}日: ${cell.count} 条记忆` : ''"
              class="aspect-square rounded-[3px]"
              :class="[
                cell.day ? heatmapColor(cell.count) : 'bg-transparent',
                cell.day ? 'cursor-pointer hover:ring-2 hover:ring-brian-blue/60' : '',
                cell.day && isHeatmapCellActive(cell.day) ? 'ring-2 ring-brian-blue' : '',
              ]"
              @click="clickHeatmapDay(cell.day)"
            />
          </div>
          <div class="flex items-center justify-between mt-2">
            <button
              class="p-0.5 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
              @click="prevHeatmapMonth"
            >
              <ChevronLeft :size="14" />
            </button>
            <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ heatmapYear }}/{{ String(heatmapMonth).padStart(2, '0') }}</span>
            <button
              class="p-0.5 rounded transition-colors"
              :class="isCurrentHeatmapMonth() ? 'text-apple-gray-300 cursor-not-allowed' : 'text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10'"
              :disabled="isCurrentHeatmapMonth()"
              @click="nextHeatmapMonth"
            >
              <ChevronRight :size="14" />
            </button>
          </div>
        </div>
        <!-- 记忆删除确认弹窗 -->
        <div v-if="memoryDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="memoryDeleteConfirm = null">
          <div class="block-card w-full max-w-sm mx-4 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">确认删除</h3>
              <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="memoryDeleteConfirm = null"><X :size="18" /></button>
            </div>
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
              {{ memoryDeleteConfirm.type === 'batch' ? `确定删除选中的 ${selectedMemories.size} 条记忆吗？` : '确定删除该条记忆吗？' }}
            </p>
            <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的标签、摘要、关键词与向量数据，且不可恢复。</p>
            <div class="flex justify-end gap-2 mt-6">
              <button class="btn-secondary" @click="memoryDeleteConfirm = null">取消</button>
              <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmMemoryDelete">确认删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Library tab -->
      <div v-if="activeTab === 'library'" class="px-6 pb-8 space-y-4">
        <div v-if="!libraryDetail">
          <h3 class="text-lg font-semibold mb-4">资料库</h3>
          <div v-if="loadingLibs" class="text-center py-8 text-apple-gray-400">加载中...</div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <button class="flex flex-col items-center justify-center border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-lg text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors aspect-[3/2]" @click="showAddLib = true">
              <Plus :size="24" class="mb-1.5" />
              <span class="text-xs font-medium">添加资料库</span>
            </button>
            <div
              v-for="lib in libraries"
              :key="lib.id"
              class="relative p-4 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 hover:shadow-sm transition-all aspect-[3/2] flex flex-col cursor-pointer"
              @click="openLibraryDetail(lib)"
            >
              <div class="flex items-center gap-2 mb-2">
                <div class="p-1.5 bg-brian-blue/10 rounded-lg flex-shrink-0">
                  <Folder :size="16" class="text-brian-blue" />
                </div>
                <h4 class="text-sm font-semibold truncate flex-1 min-w-0">{{ lib.name }}</h4>
                <button class="p-1 rounded-lg text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" @click.stop="handleDeleteLibrary(lib.id)">
                  <Trash2 :size="13" />
                </button>
              </div>
              <p class="text-[11px] text-apple-gray-400 truncate font-mono">{{ lib.path }}</p>
              <p class="text-xs text-apple-gray-500 line-clamp-2 mt-1.5 flex-1 min-h-0">{{ lib.description || '暂无描述' }}</p>
              <div class="flex items-center justify-between mt-auto pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <span class="text-[11px] text-apple-gray-400">{{ lib.learnedFiles || 0 }}/{{ lib.totalFiles || 0 }} 文件</span>
                <button class="flex items-center gap-1.5" @click.stop="handleToggleLibrary(lib)">
                  <span class="relative w-8 h-4 rounded-full transition-colors" :class="lib.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
                    <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="lib.enableSelfLearning ? 'translate-x-4' : ''" />
                  </span>
                  <span class="text-[11px]" :class="lib.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ lib.enableSelfLearning ? '启用' : '禁用' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Add library modal -->
          <div v-if="showAddLib" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAddLib = false">
            <div class="block-card w-full max-w-md mx-4 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold">添加资料库</h3>
                <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="showAddLib = false"><X :size="18" /></button>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库名称</label>
                  <input v-model="newLib.name" placeholder="输入名称..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                </div>
                <div>
                  <label class="text-xs font-medium text-apple-gray-500 mb-1 block">摘要</label>
                  <input v-model="newLib.description" placeholder="输入摘要..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                </div>
                <div>
                  <label class="text-xs font-medium text-apple-gray-500 mb-1 block">路径</label>
                  <div class="flex gap-2">
                    <input v-model="newLib.path" placeholder="/path/to/library" class="flex-1 px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                    <button class="px-3 py-2 text-xs font-medium btn-secondary whitespace-nowrap" :disabled="checkingPath || !newLib.path" @click="checkLibPath">{{ checkingPath ? '检查中...' : '检查路径' }}</button>
                  </div>
                  <div v-if="pathCheckResult" class="mt-2 flex items-center gap-3 text-xs">
                    <span :class="pathCheckResult.exists ? 'text-success-green' : 'text-error-red'">{{ pathCheckResult.exists ? '✓ 路径存在' : '✗ 路径不存在' }}</span>
                  </div>
                </div>
              </div>
              <div class="flex justify-end gap-2 mt-6">
                <button class="btn-secondary" @click="showAddLib = false">取消</button>
                <button class="btn-primary" :disabled="!newLib.name || !newLib.path" @click="handleAddLibrary">提交</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Library detail -->
        <div v-else>
          <!-- 文档展示区 -->
          <div v-if="selectedFile || selectedFileLoading">
            <div class="flex items-center gap-2 mb-4">
              <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="closeFileModal">
                <ArrowLeft :size="16" /> {{ libraryDetail.name }}
              </button>
              <ChevronRight :size="14" class="text-apple-gray-400" />
              <span class="text-sm font-medium flex items-center gap-1.5"><FileText :size="14" class="text-brian-blue" /> {{ selectedFile?.name || '加载中...' }}</span>
            </div>

            <div ref="contentAreaRef" class="relative flex gap-6" :style="{ minHeight: '70vh' }">
              <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 0; overflow: visible;">
                <path
                  v-for="line in annotationLines"
                  :key="line.id"
                  :d="`M ${line.x1} ${line.y1} L ${(line.x1 + line.x2) / 2} ${line.y1} L ${(line.x1 + line.x2) / 2} ${line.y2} L ${line.x2} ${line.y2}`"
                  :stroke="activeAnnotationId === line.id ? '#ff9500' : '#0071e3'"
                  :stroke-width="activeAnnotationId === line.id ? 2 : 1.5"
                  fill="none" stroke-dasharray="4,3"
                />
              </svg>

              <div class="w-64 flex-shrink-0 relative z-10">
                <div class="text-xs font-semibold text-apple-gray-500 mb-2">章节</div>
                <div class="space-y-1">
                  <button
                    v-for="sec in articleSections"
                    :key="sec.id"
                    class="w-full text-left text-xs text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue transition-colors truncate"
                    :style="{ paddingLeft: `${(sec.level - 1) * 12}px` }"
                    @click="scrollToSection(sec)"
                  >
                    {{ sec.title }}
                  </button>
                  <div v-if="articleSections.length === 0" class="text-xs text-apple-gray-400">暂无章节</div>
                </div>
              </div>

              <div class="flex-1 min-w-0 relative z-10">
                <div v-if="selectedFileLoading" class="text-center py-12 text-apple-gray-400">加载中...</div>
                <div v-else class="markdown-body select-text" @contextmenu.prevent="handleFileContextMenu" v-html="renderMarkdown(selectedFile!.content)"></div>
              </div>

              <div class="w-64 flex-shrink-0 relative z-10 space-y-3">
                <div
                  v-for="ann in annotations"
                  :key="ann.id"
                  :data-card-id="ann.id"
                  class="p-3 rounded-lg border cursor-pointer transition-all"
                  :class="activeAnnotationId === ann.id ? 'border-warning-orange/50 bg-warning-orange/10' : 'border-brian-blue/20 bg-brian-blue/5'"
                  @click="handleCardClick(ann.id)"
                >
                  <div class="text-xs font-medium mb-1" :class="activeAnnotationId === ann.id ? 'text-warning-orange' : 'text-brian-blue'">咨询</div>
                  <p class="text-xs text-apple-gray-500 mb-1 line-clamp-2">{{ ann.question }}</p>
                  <p class="text-sm whitespace-pre-wrap text-apple-gray-700 dark:text-apple-gray-300">{{ ann.result }}</p>
                </div>
                <div v-if="annotations.length === 0" class="text-xs text-apple-gray-400">选中内容后右键可咨询</div>
              </div>
            </div>
          </div>

          <!-- 目录浏览 -->
          <template v-else>
            <div class="flex items-center gap-2 mb-4">
              <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="libraryDetail = null">
                <ArrowLeft :size="16" /> 资料库
              </button>
              <ChevronRight :size="14" class="text-apple-gray-400" />
              <span class="text-sm font-medium">{{ libraryDetail.name }}</span>
              <button class="ml-auto flex items-center gap-1.5" @click="handleToggleLibrary(libraryDetail)">
                <span class="relative w-8 h-4 rounded-full transition-colors" :class="libraryDetail.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
                  <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="libraryDetail.enableSelfLearning ? 'translate-x-4' : ''" />
                </span>
                <span class="text-xs" :class="libraryDetail.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ libraryDetail.enableSelfLearning ? '启用' : '禁用' }}</span>
              </button>
            </div>

            <div class="flex items-center gap-3 mb-4 flex-wrap">
              <div class="flex items-center gap-1 text-sm flex-wrap">
                <template v-for="(crumb, i) in libraryBreadcrumb" :key="crumb.path">
                  <ChevronRight v-if="i > 0" :size="14" class="text-apple-gray-300 flex-shrink-0" />
                  <button class="hover:text-brian-blue transition-colors" :class="i === libraryBreadcrumb.length - 1 ? 'text-apple-gray-900 dark:text-apple-gray-50 font-medium' : 'text-apple-gray-500'" @click="enterDirectory(crumb.path)">{{ crumb.label }}</button>
                </template>
              </div>
              <button v-if="currentDirectory" class="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 hover:text-brian-blue transition-colors" @click="goUpDirectory">
                <ArrowLeft :size="12" /> 上级
              </button>
              <div class="relative flex-1 max-w-xs ml-auto">
                <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                <input v-model="fileKeyword" placeholder="搜索文件..." class="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
            </div>

            <div class="flex gap-4">
              <div class="w-56 flex-shrink-0 block-card rounded-xl p-3 max-h-[70vh] overflow-y-auto">
                <div class="text-xs font-semibold text-apple-gray-500 mb-2 px-2">目录</div>
                <LibraryTreeItem
                  v-for="node in libraryTree"
                  :key="node.file_id"
                  :node="node"
                  :depth="0"
                  @enter="(p: string) => enterDirectory(p)"
                />
                <div v-if="libraryTree.length === 0" class="text-xs text-apple-gray-400 px-2 py-2">暂无目录</div>
              </div>

              <div class="flex-1 min-w-0">
                <div v-if="fileLoading" class="text-center py-12 text-apple-gray-400">加载中...</div>
                <div v-else-if="libraryFiles.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">该目录下暂无文件</div>
                <div v-else class="space-y-1.5">
                  <div
                    v-for="file in libraryFiles"
                    :key="file.id"
                    class="flex items-center gap-3 p-3 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 transition-all cursor-pointer"
                    @click="openFile(file)"
                  >
                    <Folder v-if="file.isDirectory" :size="18" class="text-brian-blue flex-shrink-0" />
                    <FileText v-else :size="18" class="text-apple-gray-400 flex-shrink-0" />
                    <span class="text-sm truncate flex-1 min-w-0">{{ file.name }}</span>
                    <span v-if="!file.isDirectory" class="text-[11px] text-apple-gray-400 flex-shrink-0">{{ formatFileSize(file.size) }}</span>
                    <ChevronRight v-if="file.isDirectory" :size="14" class="text-apple-gray-300 flex-shrink-0" />
                  </div>
                  <div ref="libraryFileSentinel" v-if="fileHasMore || fileLoadingMore" class="text-center py-3 text-xs text-apple-gray-400">
                    {{ fileLoadingMore ? '加载中...' : '继续滚动加载更多' }}
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 询问弹窗 -->
          <Teleport to="body">
            <div v-if="askDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" @click.self="askDialog = null">
              <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-apple-gray-800 shadow-xl p-6">
                <h3 class="text-lg font-semibold mb-2 flex items-center gap-1.5"><Sparkles :size="16" class="text-brian-blue" /> 询问大模型</h3>
                <p class="text-xs text-apple-gray-400 mb-4">选中内容：<span class="text-apple-gray-600 dark:text-apple-gray-300">{{ askDialog.selectionText.slice(0, 80) }}{{ askDialog.selectionText.length > 80 ? '…' : '' }}</span></p>
                <textarea v-model="askDialog.question" rows="3" class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" placeholder="输入你想咨询的问题，例如：这段内容是什么意思？"></textarea>
                <div class="flex justify-end gap-2 mt-4">
                  <button class="btn-secondary" @click="askDialog = null">取消</button>
                  <button class="btn-primary flex items-center gap-1.5" :disabled="asking" @click="submitAsk">
                    <Loader2 v-if="asking" :size="14" class="animate-spin" /> 咨询
                  </button>
                </div>
              </div>
            </div>
          </Teleport>

          <!-- 文档选中右键菜单 -->
          <Teleport to="body">
            <div v-if="contextMenu" class="fixed z-[60] bg-white dark:bg-apple-gray-800 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[160px]" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
              <button class="w-full text-left px-3 py-2 text-sm text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 flex items-center gap-2" @click="openAskDialog">
                <Sparkles :size="14" class="text-brian-blue" /> 询问大模型
              </button>
            </div>
          </Teleport>
        </div>
      </div>

      <!-- Tag graph tab -->
      <div v-if="activeTab === 'tagGraph'" class="px-6 pb-8 flex flex-col" :style="{ height: 'calc(100vh - 200px)' }">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <div class="relative">
            <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="tagSearch" placeholder="搜索标签并定位..." class="pl-8 pr-3 py-1.5 w-44 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="focusTagNode" />
          </div>
          <button class="px-3 py-1.5 text-sm rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="focusTagNode">定位</button>
          <button class="px-3 py-1.5 text-sm rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="resetTagGraphView">重置视图</button>
          <span class="text-xs text-apple-gray-400">共 {{ graphNodes.length }} 节点</span>
          <div class="h-4 w-px bg-apple-gray-200 dark:bg-apple-gray-700" />
          <button class="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="tagGraphShowLabels = !tagGraphShowLabels" :title="tagGraphShowLabels ? '隐藏名称' : '显示名称'">
            <component :is="tagGraphShowLabels ? Eye : EyeOff" :size="13" />
          </button>
          <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="排斥力">
            <span class="shrink-0">斥力</span>
            <input type="range" min="10" max="10000" step="100" v-model.number="tagGraphRepulsion" class="w-16 h-1 accent-brian-blue" />
          </label>
          <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="引力">
            <span class="shrink-0">引力</span>
            <input type="range" min="1" max="100" step="1" :value="Math.round(tagGraphSpringStrength * 100)" @input="tagGraphSpringStrength = Number(($event.target as HTMLInputElement).value) / 100" class="w-16 h-1 accent-brian-blue" />
          </label>
          <button class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-error-red hover:bg-error-red/10 border border-error-red/30" :disabled="clearingTagGraph" @click="clearTagGraph">
            <Trash2 :size="14" /> {{ clearingTagGraph ? '清理中...' : '一键清理' }}
          </button>
        </div>
        <div class="flex gap-4 flex-1 min-h-0">
          <div class="flex-1 overflow-hidden relative" :class="panning || draggingTagId ? 'cursor-grabbing' : 'cursor-grab'">
            <div class="absolute top-3 right-3 z-10 w-60 rounded-xl border border-apple-gray-200/70 dark:border-apple-gray-700 bg-white/90 dark:bg-apple-gray-900/90 backdrop-blur-sm shadow-sm p-3 text-xs text-apple-gray-600 dark:text-apple-gray-300 pointer-events-none">
              <ul class="space-y-2.5">
                <li class="flex items-center gap-2.5">
                  <span class="flex items-end gap-1 shrink-0 w-9">
                    <span class="inline-block rounded-full bg-apple-gray-400" style="width:7px;height:7px"></span>
                    <span class="inline-block rounded-full bg-apple-gray-400" style="width:13px;height:13px"></span>
                  </span>
                  <span>节点大小：越大连接度越高</span>
                </li>
                <li class="flex items-center gap-2.5">
                  <span class="shrink-0 w-9 h-2 rounded-full" style="background: linear-gradient(to right, hsl(210,75%,52%), hsl(0,75%,52%));"></span>
                  <span>节点颜色：蓝=低频 → 红=高频</span>
                </li>
                <li class="flex items-center gap-2.5">
                  <svg class="shrink-0" width="36" height="12" viewBox="0 0 36 12">
                    <line x1="0" y1="6" x2="8" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                    <line x1="28" y1="6" x2="36" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                    <circle cx="0" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="8" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="28" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="36" cy="6" r="2" fill="#8e8e93" />
                  </svg>
                  <span>连线长度：越短关联越强</span>
                </li>
              </ul>
            </div>
            <svg
              ref="tagSvgRef"
              viewBox="0 0 700 700"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              style="touch-action: none;"
              @wheel.prevent="onTagGraphWheel"
              @mousedown="onTagGraphMouseDown"
              @mousemove="onTagGraphMouseMove"
              @mouseup="onTagGraphMouseUp"
              @mouseleave="onTagGraphMouseUp"
            >
              <g :transform="`translate(${tagGraphTx},${tagGraphTy}) scale(${tagGraphScale})`">
                <line
                  v-for="(edge, i) in graphEdges" :key="'e-' + i"
                  :x1="tagNodePosMap.get(edge.source)?.x ?? 0" :y1="tagNodePosMap.get(edge.source)?.y ?? 0"
                  :x2="tagNodePosMap.get(edge.target)?.x ?? 0" :y2="tagNodePosMap.get(edge.target)?.y ?? 0"
                  :stroke="isTagEdgeHighlighted(edge) ? '#0071e3' : '#d1d1d6'"
                  :stroke-width="isTagEdgeHighlighted(edge) ? 2 : 1"
                  :opacity="isTagEdgeHighlighted(edge) ? 0.9 : Math.min(0.15 + edge.weight * 0.1, 0.55)"
                />
                <g
                  v-for="node in tagLayoutNodes" :key="node.id"
                  class="cursor-pointer"
                  @click="selectTagNode(node.id)"
                  @mouseenter="hoveredTagId = node.id"
                  @mouseleave="hoveredTagId = null"
                  @mousedown.stop="onTagNodeMouseDown($event, node.id)"
                >
                  <circle
                    :cx="node.x" :cy="node.y" :r="node.r"
                    :fill="selectedTag === node.id || hoveredTagId === node.id ? '#0071e3' : node.color"
                    :opacity="isTagNodeDimmed(node.id) ? 0.12 : 0.9"
                    class="transition-opacity"
                  />
                  <text :x="node.x" :y="node.y + node.r + 10" text-anchor="middle" class="text-[7px] font-medium pointer-events-none" fill="#6e6e73" v-if="tagGraphShowLabels">{{ node.name }}</text>
                </g>
                <g v-if="hoveredTagId" pointer-events="none">
                  <template v-for="node in tagLayoutNodes.filter(n => n.id === hoveredTagId)" :key="'tooltip-' + node.id">
                    <rect :x="node.x - 70" :y="node.y - node.r - 46" width="140" height="38" rx="6" fill="rgba(0,0,0,0.78)" />
                    <text :x="node.x" :y="node.y - node.r - 28" text-anchor="middle" class="text-[11px] font-medium" fill="#ffffff">{{ node.name }}</text>
                    <text :x="node.x" :y="node.y - node.r - 15" text-anchor="middle" class="text-[10px]" fill="#d1d1d6">关联 {{ node.degree }} · 激活 {{ node.weight }}</text>
                  </template>
                </g>
              </g>
            </svg>
          </div>
          <div v-if="selectedTag" class="w-80 flex-shrink-0 block-card rounded-xl p-4 max-h-[600px] overflow-y-auto">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold">Tag: {{ graphNodes.find(n => n.id === selectedTag)?.name }}</h4>
              <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedTag = null; selectedTagMemories = []"><X :size="14" /></button>
            </div>
            <div v-if="selectedTagMemories.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">暂无关联内容</div>
            <div v-else class="space-y-2">
              <div v-for="mem in selectedTagMemories" :key="mem.id" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
                <p class="text-xs line-clamp-3">{{ mem.content }}</p>
                <span class="text-xs text-apple-gray-400 mt-1 block">{{ new Date(mem.createdAt).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Keyword graph tab -->
      <div v-if="activeTab === 'keywordGraph'" class="px-6 pb-8 flex flex-col" :style="{ height: 'calc(100vh - 200px)' }">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <div class="relative">
            <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="keywordSearch" placeholder="搜索关键词并定位..." class="pl-8 pr-3 py-1.5 w-44 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="focusKeywordNode" />
          </div>
          <button class="px-3 py-1.5 text-sm rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="focusKeywordNode">定位</button>
          <button class="px-3 py-1.5 text-sm rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="resetKeywordGraphView">重置视图</button>
          <span class="text-xs text-apple-gray-400">共 {{ keywordGraphNodes.length }} 节点</span>
          <div class="h-4 w-px bg-apple-gray-200 dark:bg-apple-gray-700" />
          <button class="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="keywordGraphShowLabels = !keywordGraphShowLabels" :title="keywordGraphShowLabels ? '隐藏名称' : '显示名称'">
            <component :is="keywordGraphShowLabels ? Eye : EyeOff" :size="13" />
          </button>
          <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="排斥力">
            <span class="shrink-0">斥力</span>
            <input type="range" min="10" max="10000" step="100" v-model.number="keywordGraphRepulsion" class="w-16 h-1 accent-brian-blue" />
          </label>
          <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="引力">
            <span class="shrink-0">引力</span>
            <input type="range" min="1" max="100" step="1" :value="Math.round(keywordGraphSpringStrength * 100)" @input="keywordGraphSpringStrength = Number(($event.target as HTMLInputElement).value) / 100" class="w-16 h-1 accent-brian-blue" />
          </label>
          <button class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-error-red hover:bg-error-red/10 border border-error-red/30" :disabled="clearingKeywordGraph" @click="clearKeywordGraph">
            <Trash2 :size="14" /> {{ clearingKeywordGraph ? '清理中...' : '一键清理' }}
          </button>
        </div>
        <div v-if="loadingKeywordGraph" class="text-center py-16 text-apple-gray-400 flex-1">加载中...</div>
        <div v-else-if="keywordGraphNodes.length === 0" class="text-center py-16 text-apple-gray-400 text-sm flex-1">暂无关键词数据</div>
        <div v-else class="flex gap-4 flex-1 min-h-0">
          <div class="flex-1 overflow-hidden relative" :class="keywordPanning || keywordDraggingId ? 'cursor-grabbing' : 'cursor-grab'">
            <div class="absolute top-3 right-3 z-10 w-60 rounded-xl border border-apple-gray-200/70 dark:border-apple-gray-700 bg-white/90 dark:bg-apple-gray-900/90 backdrop-blur-sm shadow-sm p-3 text-xs text-apple-gray-600 dark:text-apple-gray-300 pointer-events-none">
              <ul class="space-y-2.5">
                <li class="flex items-center gap-2.5">
                  <span class="flex items-end gap-1 shrink-0 w-9">
                    <span class="inline-block rounded-full bg-apple-gray-400" style="width:7px;height:7px"></span>
                    <span class="inline-block rounded-full bg-apple-gray-400" style="width:13px;height:13px"></span>
                  </span>
                  <span>节点大小：越大连接度越高</span>
                </li>
                <li class="flex items-center gap-2.5">
                  <span class="shrink-0 w-9 h-2 rounded-full" style="background: linear-gradient(to right, hsl(210,75%,52%), hsl(0,75%,52%));"></span>
                  <span>节点颜色：蓝=低频 → 红=高频</span>
                </li>
                <li class="flex items-center gap-2.5">
                  <svg class="shrink-0" width="36" height="12" viewBox="0 0 36 12">
                    <line x1="0" y1="6" x2="8" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                    <line x1="28" y1="6" x2="36" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                    <circle cx="0" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="8" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="28" cy="6" r="2" fill="#8e8e93" />
                    <circle cx="36" cy="6" r="2" fill="#8e8e93" />
                  </svg>
                  <span>连线长度：越短关联越强</span>
                </li>
              </ul>
            </div>
            <svg
              ref="keywordSvgRef"
              viewBox="0 0 700 700"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              style="touch-action: none;"
              @wheel.prevent="onKeywordGraphWheel"
              @mousedown="onKeywordGraphMouseDown"
              @mousemove="onKeywordGraphMouseMove"
              @mouseup="onKeywordGraphMouseUp"
              @mouseleave="onKeywordGraphMouseUp"
            >
              <g :transform="`translate(${keywordTx},${keywordTy}) scale(${keywordScale})`">
                <line
                  v-for="(edge, i) in keywordGraphEdges" :key="'ke-' + i"
                  :x1="keywordNodePosMap.get(edge.source)?.x ?? 0" :y1="keywordNodePosMap.get(edge.source)?.y ?? 0"
                  :x2="keywordNodePosMap.get(edge.target)?.x ?? 0" :y2="keywordNodePosMap.get(edge.target)?.y ?? 0"
                  :stroke="isKeywordEdgeHighlighted(edge) ? '#0071e3' : '#d1d1d6'"
                  :stroke-width="isKeywordEdgeHighlighted(edge) ? 2 : 1"
                  :opacity="isKeywordEdgeHighlighted(edge) ? 0.9 : Math.min(0.15 + edge.weight * 0.1, 0.55)"
                />
                <g
                  v-for="node in keywordLayoutNodes" :key="node.id"
                  class="cursor-pointer"
                  @click="selectKeywordNode(node.id)"
                  @mouseenter="keywordHoveredId = node.id"
                  @mouseleave="keywordHoveredId = null"
                  @mousedown.stop="onKeywordNodeMouseDown($event, node.id)"
                >
                  <circle
                    :cx="node.x" :cy="node.y" :r="node.r"
                    :fill="selectedKeyword === node.id || keywordHoveredId === node.id ? '#0071e3' : node.color"
                    :opacity="isKeywordNodeDimmed(node.id) ? 0.12 : 0.9"
                    class="transition-opacity"
                  />
                  <text :x="node.x" :y="node.y + node.r + 10" text-anchor="middle" class="text-[7px] font-medium pointer-events-none" fill="#6e6e73" v-if="keywordGraphShowLabels">{{ node.name }}</text>
                </g>
                <g v-if="keywordHoveredId" pointer-events="none">
                  <template v-for="node in keywordLayoutNodes.filter(n => n.id === keywordHoveredId)" :key="'kt-' + node.id">
                    <rect :x="node.x - 70" :y="node.y - node.r - 46" width="140" height="38" rx="6" fill="rgba(0,0,0,0.78)" />
                    <text :x="node.x" :y="node.y - node.r - 28" text-anchor="middle" class="text-[11px] font-medium" fill="#ffffff">{{ node.name }}</text>
                    <text :x="node.x" :y="node.y - node.r - 15" text-anchor="middle" class="text-[10px]" fill="#d1d1d6">关联 {{ node.degree }} · 激活 {{ node.weight }}</text>
                  </template>
                </g>
              </g>
            </svg>
          </div>
          <div v-if="selectedKeyword" class="w-80 flex-shrink-0 block-card rounded-xl p-4 overflow-y-auto">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold">关键词: {{ keywordGraphNodes.find(n => n.id === selectedKeyword)?.name }}</h4>
              <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedKeyword = null; selectedKeywordMemories = []"><X :size="14" /></button>
            </div>
            <div v-if="selectedKeywordMemories.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">暂无关联信息</div>
            <div v-else class="space-y-2">
              <div v-for="mem in selectedKeywordMemories" :key="mem.id" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
                <p class="text-xs line-clamp-3">{{ mem.content }}</p>
                <span class="text-xs text-apple-gray-400 mt-1 block">{{ new Date(mem.createdAt).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Profile tab -->
      <div v-if="activeTab === 'profile'" class="px-6 pb-8 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UserRound :size="20" class="text-brian-blue" /> 用户画像
          </h3>
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800 transition-colors disabled:opacity-60"
              :disabled="resettingProfile || generatingProfile"
              @click="handleResetProfile"
            >
              <Trash2 :size="13" />
              {{ resettingProfile ? '重置中...' : '重置画像' }}
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
              :disabled="generatingProfile"
              @click="handleGenerateProfile"
            >
              <RefreshCw :size="13" :class="generatingProfile ? 'animate-spin' : ''" />
              {{ generatingProfile ? '生成中...' : '生成画像' }}
            </button>
          </div>
        </div>

        <div v-if="loadingProfile" class="text-center py-16 text-apple-gray-400">
          <Loader2 :size="24" class="animate-spin mx-auto mb-2" />
          <p class="text-sm">加载画像...</p>
        </div>
        <div v-else-if="!profile || profile.profile_version === 0" class="text-center py-16">
          <Sparkles :size="32" class="text-apple-gray-300 mx-auto mb-3" />
          <p class="text-sm text-apple-gray-500">暂无画像数据</p>
          <p class="text-xs text-apple-gray-400 mt-1">点击右上角「生成画像」基于用户对话生成第一版画像</p>
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- 画像总结 + 维度 -->
          <div class="lg:col-span-2 space-y-4">
            <!-- 画像总结 -->
            <div class="block-card rounded-xl p-5">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles :size="15" class="text-brian-blue" /> 画像总结
                </h4>
                <span class="text-xs text-apple-gray-400">版本 v{{ profile.profile_version }}</span>
              </div>
              <p class="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-300">{{ profile.profile_summary || '暂无总结' }}</p>
              <p class="text-xs text-apple-gray-400 mt-3">生成时间: {{ formatProfileTime(profile.generated_at) }}</p>
            </div>

            <!-- 维度列表 -->
            <div class="block-card rounded-xl p-5">
              <h4 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Brain :size="15" class="text-brian-blue" /> 画像维度
              </h4>
              <div v-if="Object.keys(profile.dimensions).length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
                暂无维度数据
              </div>
              <div v-else class="space-y-3">
                <div v-for="(dim, key) in profile.dimensions" :key="key" class="p-4 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium">{{ dim.direction_name || key }}</span>
                    <div class="flex items-center gap-2">
                      <span v-if="dim.stability" :class="['px-2 py-0.5 rounded text-xs font-medium', stabilityClass(dim.stability)]">{{ stabilityLabel(dim.stability) }}</span>
                      <span class="text-xs text-apple-gray-400">置信度: {{ Math.round((dim.confidence || 0) * 100) }}%</span>
                    </div>
                  </div>
                  <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300">{{ dimensionDisplayValue(dim.value) }}</p>
                  <div v-if="dim.evidence && dim.evidence.length" class="mt-2 space-y-1">
                    <p v-for="(ev, i) in dim.evidence" :key="i" class="text-xs text-apple-gray-400">
                      · {{ formatEvidence(ev) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 历史版本 -->
          <div class="space-y-4">
            <div class="block-card rounded-xl p-5">
              <h4 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <History :size="15" class="text-brian-blue" /> 历史版本
              </h4>
              <div v-if="profileHistory.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
                暂无历史版本
              </div>
              <div v-else class="space-y-2 max-h-[480px] overflow-y-auto">
                <button
                  v-for="item in profileHistory"
                  :key="item.id"
                  class="w-full text-left p-3 rounded-lg border border-transparent hover:border-brian-blue/30 hover:bg-brian-blue/5 transition-colors"
                  @click="openVersion(item.version)"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">v{{ item.version }}</span>
                    <span class="text-xs text-apple-gray-400">{{ formatProfileTime(item.generated_at) }}</span>
                  </div>
                  <p class="text-xs text-apple-gray-400 mt-1 line-clamp-2">{{ item.change_summary || item.profile_summary || '—' }}</p>
                </button>
              </div>
            </div>

            <!-- 版本详情 -->
            <div v-if="selectedVersion || loadingVersion" class="block-card rounded-xl p-5">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-semibold">版本详情</h4>
                <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedVersion = null"><X :size="14" /></button>
              </div>
              <div v-if="loadingVersion" class="text-center py-6 text-apple-gray-400 text-sm">加载中...</div>
              <div v-else-if="selectedVersion" class="space-y-3">
                <p class="text-xs text-apple-gray-400">版本 v{{ selectedVersion.version }} · {{ formatProfileTime(selectedVersion.generated_at) }}</p>
                <p class="text-sm">{{ selectedVersion.profile_summary || '暂无总结' }}</p>
                <div v-if="Object.keys(selectedVersion.dimensions).length" class="space-y-2">
                  <div v-for="(dim, key) in selectedVersion.dimensions" :key="key" class="p-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50">
                    <span class="text-xs font-medium block">{{ dim.direction_name || key }}</span>
                    <span class="text-xs text-apple-gray-500 block mt-0.5">{{ dimensionDisplayValue(dim.value) }}</span>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

        <!-- 重置画像确认弹窗 -->
        <div v-if="resetProfileConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="resetProfileConfirm = false">
          <div class="block-card w-full max-w-sm mx-4 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">确认重置画像</h3>
              <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="resetProfileConfirm = false"><X :size="18" /></button>
            </div>
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
              确定要重置画像吗？将清空画像内容（总结、维度数据与历史版本）。
            </p>
            <p class="text-xs text-apple-gray-400 mt-1">画像维度配置将保留，此操作不可恢复。</p>
            <div class="flex justify-end gap-2 mt-6">
              <button class="btn-secondary" @click="resetProfileConfirm = false">取消</button>
              <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmResetProfile">确认重置</button>
            </div>
          </div>
        </div>
        </div>
      </div>

  </div>
</template>

<style scoped>
.doc-annotation-mark {
  background: transparent;
  border-bottom: 2px dashed #0071e3;
  color: inherit;
  padding: 0;
  cursor: pointer;
}

.markdown-body {
  line-height: 1.75;
  color: inherit;
  word-break: break-word;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-weight: 600;
  margin: 1.2em 0 0.6em;
}
.markdown-body :deep(h1) { font-size: 1.6em; }
.markdown-body :deep(h2) { font-size: 1.35em; }
.markdown-body :deep(h3) { font-size: 1.15em; }
.markdown-body :deep(p) { margin: 0.6em 0; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-left: 1.5em; margin: 0.6em 0; }
.markdown-body :deep(li) { margin: 0.25em 0; }
.markdown-body :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.05);
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.8em 0;
}
.markdown-body :deep(pre code) { background: transparent; padding: 0; }
.markdown-body :deep(blockquote) {
  border-left: 3px solid #d1d1d6;
  padding-left: 1em;
  margin: 0.8em 0;
  color: #6e6e73;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.8em 0;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #d1d1d6;
  padding: 0.4em 0.8em;
  text-align: left;
}
.markdown-body :deep(a) { color: #0071e3; text-decoration: underline; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid #d1d1d6; margin: 1.2em 0; }
</style>
