<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Clock, Brain, Database, Network, GitBranch,
  Search, Trash2, Plus, ChevronRight, ArrowLeft,
  Folder, X, CheckSquare, Square, FileText,
  UserRound, History, RefreshCw, Sparkles, Loader2,
} from '@lucide/vue'
import { chatApi, memoryApi, libraryApi, userProfileApi, visualizationApi } from '@/api'
import type { ChatSession, MemoryItem, GraphNode, GraphEdge, LibraryPath, UserProfileData, ProfileHistoryItem, ProfileVersionData, MessageGraphNode, MessageGraphEdge } from '@/api/types'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'

const router = useRouter()

// Tabs
const activeTab = ref<'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph' | 'profile' | 'messageGraph'>('history')
const tabs = [
  { key: 'history' as const, label: '历史', icon: Clock },
  { key: 'memory' as const, label: '记忆', icon: Brain },
  { key: 'library' as const, label: '资料库', icon: Database },
  { key: 'tagGraph' as const, label: 'Tag图', icon: Network },
  { key: 'keywordGraph' as const, label: '关键词图', icon: GitBranch },
  { key: 'profile' as const, label: '画像', icon: UserRound },
  { key: 'messageGraph' as const, label: '消息图', icon: GitBranch },
]

// History tab
const historySearch = ref('')
const historyStartTime = ref('')
const historyEndTime = ref('')
const chatList = ref<ChatSession[]>([])
const loadingHistory = ref(false)
const selectedSessions = ref<Set<string>>(new Set())

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

const activeMemoryDate = ref<string | null>(null)

function scrollMemoryNavToActive(dateKey: string) {
  document.getElementById(`memory-nav-${dateKey}`)?.scrollIntoView({ block: 'nearest' })
}

function scrollToMemoryDate(dateKey: string) {
  activeMemoryDate.value = dateKey
  scrollMemoryNavToActive(dateKey)
  document.getElementById(`memory-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onMemoryScroll() {
  const groupEls = Array.from(document.querySelectorAll<HTMLElement>('[data-memory-date]'))
  if (groupEls.length === 0) return
  const topOffset = 140
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

// Profile tab
const profile = ref<UserProfileData | null>(null)
const profileHistory = ref<ProfileHistoryItem[]>([])
const loadingProfile = ref(false)
const generatingProfile = ref(false)
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

// Message graph tab
const messageGraphSessionId = ref('')
const messageGraphNodes = ref<MessageGraphNode[]>([])
const messageGraphEdges = ref<MessageGraphEdge[]>([])
const loadingMessageGraph = ref(false)
const selectedMsgNodeId = ref<string | null>(null)

async function loadMessageGraph() {
  if (!messageGraphSessionId.value) { messageGraphNodes.value = []; messageGraphEdges.value = []; return }
  loadingMessageGraph.value = true
  try {
    const data = await visualizationApi.messageGraph(messageGraphSessionId.value)
    messageGraphNodes.value = data.graph?.nodes || []
    messageGraphEdges.value = data.graph?.edges || []
  } catch { messageGraphNodes.value = []; messageGraphEdges.value = [] }
  finally { loadingMessageGraph.value = false }
}

const messageGraphLayout = computed(() => {
  const n = messageGraphNodes.value.length
  if (n === 0) return { nodes: [] as Array<MessageGraphNode & { x: number; y: number }>, edges: [] as Array<MessageGraphEdge & { x1: number; y1: number; x2: number; y2: number }> }
  const cx = 250, cy = 250, radius = 180
  const nodeMap = new Map(messageGraphNodes.value.map((nd) => [nd.id, nd]))
  const nodes = messageGraphNodes.value.map((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
  const edges = messageGraphEdges.value.map(e => {
    const src = nodeMap.get(e.from) || messageGraphNodes.value.find(nd => nd.info_id === e.citing_info_id)
    const tgt = nodeMap.get(e.to) || messageGraphNodes.value.find(nd => nd.info_id === e.cited_info_id)
    if (!src || !tgt) return null
    const s = nodes.find(nd => nd.id === src.id)!
    const t = nodes.find(nd => nd.id === tgt.id)!
    return { ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y }
  }).filter(Boolean) as Array<MessageGraphEdge & { x1: number; y1: number; x2: number; y2: number }>
  return { nodes, edges }
})

// Tag graph tab
interface LayoutNode extends GraphNode { x: number; y: number; r: number; color: string }
interface LayoutEdge { source: string; target: string; weight: number; x1: number; y1: number; x2: number; y2: number; strokeWidth: number; highlighted?: boolean }

const graphNodes = ref<GraphNode[]>([])
const graphEdges = ref<GraphEdge[]>([])
const loadingGraph = ref(false)
const selectedTag = ref<string | null>(null)
const selectedTagMemories = ref<MemoryItem[]>([])
const hoveredEdge = ref<LayoutEdge | null>(null)
const keywordGraphNodes = ref<GraphNode[]>([])
const keywordGraphEdges = ref<GraphEdge[]>([])
const loadingKeywordGraph = ref(false)
const hoveredKeyword = ref<GraphNode | null>(null)
const selectedKeyword = ref<string | null>(null)
const selectedKeywordMemories = ref<MemoryItem[]>([])

async function loadTagGraph() {
  loadingGraph.value = true
  try {
    const data = await memoryApi.tagGraph()
    graphNodes.value = data.nodes || []
    graphEdges.value = data.edges || []
  } catch { /* ignore */ }
  finally { loadingGraph.value = false }
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

async function loadKeywordGraph() {
  loadingKeywordGraph.value = true
  try {
    const data = await memoryApi.keywordGraph()
    keywordGraphNodes.value = data.nodes || []
    keywordGraphEdges.value = data.edges || []
  } catch { keywordGraphNodes.value = []; keywordGraphEdges.value = [] }
  finally { loadingKeywordGraph.value = false }
}

const tagGraphLayout = computed(() => {
  const n = graphNodes.value.length
  if (n === 0) return { nodes: [] as LayoutNode[], edges: [] as LayoutEdge[] }
  const cx = 250, cy = 250, radius = 180
  const weights = graphNodes.value.map(nd => nd.weight)
  const maxW = Math.max(...weights, 1)
  const minW = Math.min(...weights, 1)
  const minR = 14, maxR = minR * 3

  return {
    nodes: graphNodes.value.map((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ratio = maxW > minW ? (node.weight - minW) / (maxW - minW) : 0.5
      const r = minR + ratio * (maxR - minR)
      return {
        ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r,
        color: selectedTag.value === node.id ? '#0071e3' : node.degree > 3 ? '#5856d6' : '#8e8e93',
      }
    }),
    edges: graphEdges.value.map(e => {
      const fi = graphNodes.value.findIndex(nd => nd.id === e.source)
      const ti = graphNodes.value.findIndex(nd => nd.id === e.target)
      if (fi === -1 || ti === -1) return null
      const aF = (fi / n) * Math.PI * 2 - Math.PI / 2
      const aT = (ti / n) * Math.PI * 2 - Math.PI / 2
      return {
        ...e, x1: cx + radius * Math.cos(aF), y1: cy + radius * Math.sin(aF),
        x2: cx + radius * Math.cos(aT), y2: cy + radius * Math.sin(aT),
        strokeWidth: 1 + e.weight,
        highlighted: !!selectedTag.value && (e.source === selectedTag.value || e.target === selectedTag.value),
      }
    }).filter(Boolean) as LayoutEdge[],
  }
})

const keywordLayout = computed(() => {
  const top = [...keywordGraphNodes.value].sort((a, b) => b.weight - a.weight).slice(0, 12)
  const topIds = new Set(top.map(n => n.id))
  const topEdges = keywordGraphEdges.value.filter(e => topIds.has(e.source) && topIds.has(e.target))
  const n = top.length
  if (n === 0) return { nodes: [] as LayoutNode[], edges: [] as LayoutEdge[] }
  const cx = 250, cy = 250, radius = 160
  const maxW = Math.max(...top.map(nd => nd.weight), 1)
  const minR = 16, maxR = minR * 3
  const colors = ['#0071e3', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00']

  return {
    nodes: top.map((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ratio = maxW > 0 ? node.weight / maxW : 0.5
      return {
        ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle),
        r: minR + ratio * (maxR - minR), color: colors[i % colors.length],
      }
    }),
    edges: topEdges.map(e => {
      const fi = top.findIndex(nd => nd.id === e.source)
      const ti = top.findIndex(nd => nd.id === e.target)
      if (fi === -1 || ti === -1) return null
      const aF = (fi / n) * Math.PI * 2 - Math.PI / 2
      const aT = (ti / n) * Math.PI * 2 - Math.PI / 2
      return { ...e, x1: cx + radius * Math.cos(aF), y1: cy + radius * Math.sin(aF), x2: cx + radius * Math.cos(aT), y2: cy + radius * Math.sin(aT), strokeWidth: 2 + e.weight, highlighted: undefined }
    }).filter(Boolean) as LayoutEdge[],
  }
})

onMounted(() => {
  loadHistory()
  loadMemory()
  loadLibraries()
  loadTagGraph()
  loadKeywordGraph()
  window.addEventListener('scroll', onMemoryScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onMemoryScroll)
  memoryObserver?.disconnect()
  memoryObserver = null
})

watch(activeTab, (val) => {
  if (val === 'profile') loadProfile()
  if (val === 'messageGraph' && messageGraphSessionId.value) loadMessageGraph()
})

let historySearchTimer: ReturnType<typeof setTimeout> | null = null
watch([historySearch, historyStartTime, historyEndTime], () => {
  if (historySearchTimer) clearTimeout(historySearchTimer)
  historySearchTimer = setTimeout(() => { loadHistory() }, 300)
})

let memorySearchTimer: ReturnType<typeof setTimeout> | null = null
watch([memorySearch, memoryTag, memoryStartTime, memoryEndTime], () => {
  if (memorySearchTimer) clearTimeout(memorySearchTimer)
  memorySearchTimer = setTimeout(() => { loadMemory() }, 300)
})
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="['信息']" />
      </div>
    </div>
    <div class="px-6 pb-6 min-h-screen relative z-10">
      <!-- Tab navigation -->
      <div class="flex items-center gap-1 mb-6 border-b border-apple-gray-200 dark:border-apple-gray-700 pb-2">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="[
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === tab.key ? 'bg-brian-blue text-white' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
          ]"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.label }}
        </button>
      </div>

      <!-- History tab -->
      <div v-if="activeTab === 'history'" class="space-y-3">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="relative flex-1 max-w-md">
            <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="historySearch" placeholder="搜索会话内容或标题..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <div class="flex items-center gap-2 text-xs text-apple-gray-500">
            <input v-model="historyStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <span>至</span>
            <input v-model="historyEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <button v-if="filteredHistory.length > 0" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-apple-gray-500 hover:text-brian-blue" @click="toggleHistorySelectAll">
            <component :is="allHistorySelected ? CheckSquare : Square" :size="14" />
            {{ allHistorySelected ? '取消全选' : '全选' }}
          </button>
          <button v-if="selectedSessions.size > 0" class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg" @click="requestBatchDelete">
            <Trash2 :size="12" /> 批量删除({{ selectedSessions.size }})
          </button>
        </div>
        <div v-if="loadingHistory" class="text-center py-8 text-apple-gray-400">加载中...</div>
        <div v-else-if="filteredHistory.length === 0" class="text-center py-8 text-apple-gray-400">暂无历史会话</div>
        <div v-else class="grid gap-3 max-w-3xl">
          <div
            v-for="item in filteredHistory"
            :key="item.sessionId"
            class="flex items-start justify-between p-4 block-card rounded-xl cursor-pointer"
            :class="selectedSessions.has(item.sessionId) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
            @click="openSession(item.sessionId)"
          >
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <button class="mt-1 text-apple-gray-300 hover:text-brian-blue flex-shrink-0" @click.stop="toggleHistorySelect(item.sessionId)">
                <component :is="selectedSessions.has(item.sessionId) ? CheckSquare : Square" :size="16" />
              </button>
              <div class="flex-1 min-w-0">
                <span class="text-xs text-apple-gray-400">{{ formatTime(item.lastTime) }}</span>
                <p class="text-sm font-medium truncate mt-1">{{ item.lastMessage || '新会话' }}</p>
                <p class="text-xs text-apple-gray-400 mt-1 truncate">{{ (item.lastMessage || '').slice(0, 50) }}</p>
              </div>
            </div>
            <button class="ml-3 p-1.5 rounded-lg text-apple-gray-400 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" @click.stop="requestDeleteSession(item.sessionId)">
              <Trash2 :size="16" />
            </button>
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
      </div>

      <!-- Memory tab -->
      <div v-if="activeTab === 'memory'" class="space-y-4">
        <div v-if="loadingMemory" class="text-center py-8 text-apple-gray-400">加载中...</div>
        <div v-else-if="memoryTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无记忆</div>
        <div v-else class="flex gap-6">
          <div class="w-40 flex-shrink-0">
            <div class="sticky top-4 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
              <button
                v-for="group in memoryTimeline"
                :key="group.dateKey"
                :id="`memory-nav-${group.dateKey}`"
                class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                :class="activeMemoryDate === group.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
                @click="scrollToMemoryDate(group.dateKey)"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeMemoryDate === group.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
                <span>{{ group.label }}</span>
                <span class="ml-auto text-apple-gray-300">{{ group.items.length }}</span>
              </button>
            </div>
          </div>
          <div class="flex-1 min-w-0 space-y-4">
            <div class="flex items-center gap-3 flex-wrap">
              <div class="relative flex-1 max-w-md">
                <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                <input v-model="memorySearch" placeholder="搜索记忆内容..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
              <input v-model="memoryTag" placeholder="按标签搜索..." class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              <div class="flex items-center gap-2 text-xs text-apple-gray-500">
                <input v-model="memoryStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <span>至</span>
                <input v-model="memoryEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
              </div>
            </div>
            <div class="space-y-3">
              <template v-for="group in memoryTimeline" :key="group.dateKey">
                <div :id="`memory-group-${group.dateKey}`" :data-memory-date="group.dateKey" class="flex items-center gap-2 pt-1 scroll-mt-32">
                  <span class="text-sm font-semibold">{{ group.label }}</span>
                  <span class="text-xs text-apple-gray-400">({{ group.items.length }})</span>
                </div>
                <div
                  v-for="mem in group.items"
                  :key="mem.id"
                  class="block-card rounded-xl overflow-hidden cursor-pointer"
                  @click="expandedMemory = expandedMemory === mem.id ? null : mem.id"
                >
                  <div class="p-4">
                    <div class="flex items-start justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-apple-gray-400">{{ new Date(mem.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
                        <span class="text-xs text-apple-gray-300">#{{ mem.id.slice(-8) }}</span>
                      </div>
                      <span :class="['px-2 py-0.5 rounded text-xs font-medium', typeColors[mem.type] || 'bg-gray-100 text-gray-600']">{{ mem.type }}</span>
                    </div>
                    <p class="text-sm" :class="expandedMemory === mem.id ? '' : 'line-clamp-2'">{{ mem.content }}</p>
                    <div class="flex items-center gap-3 mt-2">
                      <div v-if="mem.tags?.length" class="flex flex-wrap gap-1">
                        <span v-for="tag in mem.tags" :key="tag" class="px-1.5 py-0.5 rounded text-xs bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
                      </div>
                      <span class="text-xs text-apple-gray-400 ml-auto">置信度: {{ Math.round((mem.confidence || 0) * 100) }}%</span>
                      <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="expandedMemory === mem.id ? 'rotate-90' : ''" />
                    </div>
                  </div>
                </div>
              </template>
              <div ref="memorySentinel" v-if="hasMoreMemory || loadingMoreMemory" class="text-center py-4 text-xs text-apple-gray-400">
                {{ loadingMoreMemory ? '加载中...' : '继续上滑加载更多' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Library tab -->
      <div v-if="activeTab === 'library'" class="space-y-4">
        <div v-if="!libraryDetail">
          <h3 class="text-lg font-semibold mb-4">资料库</h3>
          <div v-if="loadingLibs" class="text-center py-8 text-apple-gray-400">加载中...</div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <button class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-xl text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors min-h-[140px]" @click="showAddLib = true">
              <Plus :size="32" class="mb-2" />
              <span class="text-sm font-medium">添加资料库</span>
            </button>
            <div
              v-for="lib in libraries"
              :key="lib.id"
              class="relative p-4 block-card rounded-xl cursor-pointer hover:border-brian-blue/30"
              @click="libraryDetail = lib"
            >
              <div class="flex items-start gap-3 mb-2">
                <div class="p-2 bg-brian-blue/10 rounded-lg flex-shrink-0">
                  <Folder :size="20" class="text-brian-blue" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-semibold truncate">{{ lib.name }}</h4>
                  <p class="text-xs text-apple-gray-400 truncate mt-0.5">{{ lib.path }}</p>
                </div>
              </div>
              <p class="text-xs text-apple-gray-500 line-clamp-2 min-h-[32px]">{{ lib.description || '暂无描述' }}</p>
              <div class="flex items-center justify-between mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <span class="text-xs text-apple-gray-400">{{ lib.category }}</span>
              </div>
              <button class="absolute top-3 right-3 p-1.5 rounded-lg text-apple-gray-300 hover:text-error-red hover:bg-error-red/10" @click.stop="handleDeleteLibrary(lib.id)">
                <Trash2 :size="14" />
              </button>
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
          <div class="flex items-center gap-2 mb-4">
            <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="libraryDetail = null">
              <ArrowLeft :size="16" /> 资料库
            </button>
            <ChevronRight :size="14" class="text-apple-gray-400" />
            <span class="text-sm font-medium">{{ libraryDetail.name }}</span>
          </div>
          <div class="block-card rounded-xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="p-3 bg-brian-blue/10 rounded-lg"><Folder :size="24" class="text-brian-blue" /></div>
              <div><h4 class="text-lg font-semibold">{{ libraryDetail.name }}</h4><p class="text-sm text-apple-gray-400">{{ libraryDetail.path }}</p></div>
            </div>
            <div class="text-center py-12 text-apple-gray-400">
              <FileText :size="32" class="mx-auto mb-2 text-apple-gray-300" />
              <p class="text-sm">该资料库暂无可浏览的文件</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tag graph tab -->
      <div v-if="activeTab === 'tagGraph'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Tag 关系图</h3>
          <div class="flex items-center gap-3 text-xs text-apple-gray-400">
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-indigo-500" /> 高关联</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-gray-400" /> 普通</span>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="flex-1 block-card rounded-xl p-4">
            <svg viewBox="0 0 500 500" class="w-full" style="aspect-ratio: 1; max-height: 600px;">
              <line
                v-for="(edge, i) in tagGraphLayout.edges" :key="'e-' + i"
                :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
                :stroke-width="edge.strokeWidth"
                :stroke="edge.highlighted ? '#0071e3' : '#d1d1d6'"
                :opacity="selectedTag && !edge.highlighted ? 0.2 : 0.6"
                class="cursor-pointer transition-all"
                @mouseenter="hoveredEdge = edge"
                @mouseleave="hoveredEdge = null"
              />
              <text v-if="hoveredEdge" :x="(hoveredEdge.x1 + hoveredEdge.x2) / 2" :y="(hoveredEdge.y1 + hoveredEdge.y2) / 2 - 5" text-anchor="middle" class="text-xs font-medium pointer-events-none" fill="#0071e3">权重: {{ hoveredEdge.weight.toFixed(2) }}</text>
              <g v-for="node in tagGraphLayout.nodes" :key="node.id" class="cursor-pointer" @click="selectTagNode(node.id)">
                <circle :cx="node.x" :cy="node.y" :r="node.r" :fill="node.color" :opacity="selectedTag && selectedTag !== node.id ? 0.3 : 0.85" class="transition-all" />
                <text :x="node.x" :y="node.y + 4" text-anchor="middle" class="text-xs font-medium pointer-events-none" fill="white">{{ node.name }}</text>
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
      <div v-if="activeTab === 'keywordGraph'" class="space-y-4">
        <h3 class="text-lg font-semibold">关键词关联图</h3>
        <div v-if="loadingKeywordGraph" class="text-center py-16 text-apple-gray-400">加载中...</div>
        <div v-else-if="keywordGraphNodes.length === 0" class="text-center py-16 text-apple-gray-400 text-sm">暂无关键词数据</div>
        <div v-else class="flex gap-4">
          <div class="flex-1 block-card rounded-xl p-4">
            <svg viewBox="0 0 500 500" class="w-full" style="aspect-ratio: 1; max-height: 600px;">
              <line v-for="(edge, i) in keywordLayout.edges" :key="'ke-' + i" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" :stroke-width="edge.strokeWidth" stroke="#d1d1d6" opacity="0.3" />
              <g v-for="node in keywordLayout.nodes" :key="'kn-' + node.id" class="cursor-pointer" @click="selectKeywordNode(node.id)" @mouseenter="hoveredKeyword = node" @mouseleave="hoveredKeyword = null">
                <circle :cx="node.x" :cy="node.y" :r="node.r" :fill="node.color" :opacity="selectedKeyword && selectedKeyword !== node.id ? 0.3 : (hoveredKeyword === node ? 1 : 0.85)" class="transition-all" :stroke="hoveredKeyword === node || selectedKeyword === node.id ? '#0071e3' : 'none'" :stroke-width="2" />
                <text :x="node.x" :y="node.y + 5" text-anchor="middle" class="text-sm font-semibold pointer-events-none" fill="white">{{ node.name }}</text>
                <text v-if="hoveredKeyword === node" :x="node.x" :y="node.y + node.r + 14" text-anchor="middle" class="text-xs pointer-events-none" fill="#0071e3">激活: {{ node.weight }}</text>
              </g>
            </svg>
          </div>
          <div v-if="selectedKeyword" class="w-80 flex-shrink-0 block-card rounded-xl p-4 max-h-[600px] overflow-y-auto">
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
      <div v-if="activeTab === 'profile'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UserRound :size="20" class="text-brian-blue" /> 用户画像
          </h3>
          <button
            class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
            :disabled="generatingProfile"
            @click="handleGenerateProfile"
          >
            <RefreshCw :size="13" :class="generatingProfile ? 'animate-spin' : ''" />
            {{ generatingProfile ? '生成中...' : '生成画像' }}
          </button>
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
                    <span class="text-sm font-medium">{{ key }}</span>
                    <div class="flex items-center gap-2">
                      <span v-if="dim.stability" :class="['px-2 py-0.5 rounded text-xs font-medium', stabilityClass(dim.stability)]">{{ stabilityLabel(dim.stability) }}</span>
                      <span class="text-xs text-apple-gray-400">置信度: {{ Math.round((dim.confidence || 0) * 100) }}%</span>
                    </div>
                  </div>
                  <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300">{{ dimensionDisplayValue(dim.value) }}</p>
                  <div v-if="dim.evidence && dim.evidence.length" class="mt-2 space-y-1">
                    <p v-for="(ev, i) in dim.evidence" :key="i" class="text-xs text-apple-gray-400">
                      · {{ ev.source || '证据' }}<template v-if="ev.detail">: {{ ev.detail }}</template>
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
                    <span class="text-xs font-medium block">{{ key }}</span>
                    <span class="text-xs text-apple-gray-500 block mt-0.5">{{ dimensionDisplayValue(dim.value) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Message graph tab -->
      <div v-if="activeTab === 'messageGraph'" class="space-y-4">
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold">消息引用关系图</h3>
          <select
            v-model="messageGraphSessionId"
            class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue"
            @change="loadMessageGraph"
          >
            <option value="">选择会话...</option>
            <option v-for="s in chatList" :key="s.sessionId" :value="s.sessionId">{{ s.lastMessage || s.sessionId }}</option>
          </select>
          <span v-if="messageGraphNodes.length" class="text-xs text-apple-gray-400">{{ messageGraphNodes.length }} 节点 · {{ messageGraphEdges.length }} 边</span>
        </div>

        <div v-if="loadingMessageGraph" class="text-center py-16 text-apple-gray-400">加载中...</div>
        <div v-else-if="!messageGraphSessionId" class="text-center py-16 text-apple-gray-400 text-sm">请选择会话查看消息引用关系</div>
        <div v-else-if="messageGraphNodes.length === 0" class="text-center py-16 text-apple-gray-400 text-sm">该会话暂无消息引用关系</div>
        <div v-else class="block-card rounded-xl p-4">
          <svg viewBox="0 0 500 500" class="w-full" style="aspect-ratio: 1; max-height: 600px;">
            <line
              v-for="(edge, i) in messageGraphLayout.edges" :key="'mg-e-' + i"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              :stroke="edge.edge_type === 'REPLY' ? '#0071e3' : '#d1d1d6'"
              :stroke-width="1.5"
              :stroke-dasharray="edge.edge_type === 'CITATION' ? '4,3' : ''"
              opacity="0.6"
            />
            <g v-for="node in messageGraphLayout.nodes" :key="'mg-n-' + node.id" class="cursor-pointer" @click="selectedMsgNodeId = selectedMsgNodeId === node.id ? null : node.id">
              <circle :cx="node.x" :cy="node.y" :r="16" :fill="node.info_type === 'REQUEST' ? '#0071e3' : '#8e8e93'" :opacity="selectedMsgNodeId && selectedMsgNodeId !== node.id ? 0.3 : 0.9" />
              <text :x="node.x" :y="node.y + 4" text-anchor="middle" class="text-xs font-medium pointer-events-none" fill="white">{{ node.info_id.slice(0, 6) }}</text>
              <text v-if="selectedMsgNodeId === node.id" :x="node.x" :y="node.y - 24" text-anchor="middle" class="text-[10px] pointer-events-none" fill="#0071e3">{{ node.info_summary || node.info_id }}</text>
            </g>
          </svg>
          <div class="flex items-center gap-4 mt-2 text-xs text-apple-gray-400">
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-brian-blue inline-block" /> 用户消息</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-apple-gray-400 inline-block" /> 回复</span>
            <span class="flex items-center gap-1"><span class="inline-block w-4 border-t border-brian-blue" /> 问答边</span>
            <span class="flex items-center gap-1"><span class="inline-block w-4 border-t border-dashed border-apple-gray-400" /> 引用边</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
