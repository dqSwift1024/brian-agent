/**
 * @fileoverview 信息页「标签图谱」页签的业务逻辑组合式函数（Obsidian 风格力导向图）。
 *
 * 从 InfoView.vue 分离：图谱数据加载、力导向布局、画布交互与缩放、配置持久化。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { configApi, memoryApi } from '../api'
import type { GraphEdge, GraphNode, MemoryItem } from '../api/types'
import type { InfoTabKey } from '../api/types'

/**
 * 标签图谱页签状态与操作。
 */
/** 标签图谱页签依赖的跨页签能力（由 InfoView 注入） */
export interface TagGraphTabDeps {
  activeTab: Ref<InfoTabKey>
  closeContextMenu: () => void
  loadHistory: () => void
  loadMemory: () => void
  loadAllDateCounts: () => PromiseLike<unknown> | unknown
  loadLibraries: () => void
  loadProfile: () => void
  onMemoryScroll: () => void
  startDateCountRefresh: () => void
  stopDateCountRefresh: () => void
}

export function useTagGraphTab({ activeTab, closeContextMenu, loadHistory, loadMemory, loadAllDateCounts, loadLibraries, loadProfile, onMemoryScroll, startDateCountRefresh, stopDateCountRefresh }: TagGraphTabDeps) {
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
      Promise.resolve(loadAllDateCounts()).then(() => startDateCountRefresh())
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
  stopDateCountRefresh()
})

watch(activeTab, (val) => {
  localStorage.setItem('brian-info-active-tab', val)
  loadTabData(val)
})

watch(activeTab, (val) => {
  localStorage.setItem('brian-info-active-tab', val)
  loadTabData(val)
})

  return {
    clearKeywordGraph,
    clearTagGraph,
    clearingKeywordGraph,
    clearingTagGraph,
    draggingTagId,
    focusKeywordNode,
    focusTagNode,
    forceDirectedLayout,
    graphEdges,
    graphNodes,
    hoveredTagId,
    isKeywordEdgeHighlighted,
    isKeywordNodeDimmed,
    isTagEdgeHighlighted,
    isTagNodeDimmed,
    keywordDraggingId,
    keywordGraphEdges,
    keywordGraphNodes,
    keywordGraphRepulsion,
    keywordGraphShowLabels,
    keywordGraphSpringStrength,
    keywordHoveredId,
    keywordLayoutNodes,
    keywordNeighbors,
    keywordNodePosMap,
    keywordPanStart,
    keywordPanning,
    keywordScale,
    keywordSearch,
    keywordSvgRef,
    keywordSvgToView,
    keywordTx,
    keywordTy,
    loadGraphConfigs,
    loadKeywordGraph,
    loadTabData,
    loadTagGraph,
    loadedTabs,
    loadingGraph,
    loadingKeywordGraph,    onKeywordGraphMouseDown,
    onKeywordGraphMouseMove,
    onKeywordGraphMouseUp,
    onKeywordGraphWheel,
    onKeywordNodeMouseDown,
    onTagGraphMouseDown,
    onTagGraphMouseMove,
    onTagGraphMouseUp,
    onTagGraphWheel,
    onTagNodeMouseDown,
    panStart,
    panning,
    rerunLayouts,
    resetKeywordGraphView,
    resetTagGraphView,
    saveKeywordGraphConfig,
    saveTagGraphConfig,
    selectKeywordNode,
    selectTagNode,
    selectedKeyword,
    selectedKeywordMemories,
    selectedTag,
    selectedTagMemories,
    svgToView,
    tagGraphRepulsion,
    tagGraphScale,
    tagGraphShowLabels,
    tagGraphSpringStrength,
    tagGraphTx,
    tagGraphTy,
    tagLayoutNodes,
    tagNeighbors,
    tagNodePosMap,
    tagSearch,
    tagSvgRef,
  }
}
