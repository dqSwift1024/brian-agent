<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useSessionStore } from '@/stores/session'
import { chatApi } from '@/api'
import type { ChatMapNode } from '@/api/types'
import MessageCard from './MessageCard.vue'

const sessionStore = useSessionStore()

const containerRef = ref<HTMLDivElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 40, y: 40 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

// 选中状态：activeNodeId 选中消息展示框，activeEdgeId 选中单条连线
const activeNodeId = ref<string | null>(null)
const activeEdgeId = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)

// 消息框尺寸：宽/高在原始基础上放大为 1.5 倍（220→330，108→162）
const NODE_W = 330
const NODE_H = 162

// 对齐吸附阈值（像素）
const SNAP_THRESHOLD = 8

// 拖动状态
const draggingNodeId = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
const dragStartPos = ref({ x: 0, y: 0 })

// 对齐吸附引导线
interface SnapGuide {
  type: 'vertical' | 'horizontal'
  position: number
  start: number
  end: number
}
const snapGuides = ref<SnapGuide[]>([])

const nodes = computed(() => sessionStore.chatMapNodes)
const edges = computed(() => sessionStore.chatMapEdges)

const nodeMap = computed(() => {
  const m = new Map<string, ChatMapNode>()
  for (const n of nodes.value) m.set(n.id, n)
  return m
})

const worldWidth = computed(() => {
  let maxX = 0
  for (const n of nodes.value) maxX = Math.max(maxX, n.x)
  return maxX + NODE_W + 200
})

const worldHeight = computed(() => {
  let maxY = 0
  for (const n of nodes.value) maxY = Math.max(maxY, n.y)
  return maxY + NODE_H + 200
})

// ===== 原始 nodeStyle（保留作为参考） =====
// function nodeStyle(n: ChatMapNode) {
//   return {
//     left: `${n.x}px`,
//     top: `${n.y}px`,
//     width: `${NODE_W}px`,
//     minHeight: `${NODE_H}px`,
//     zIndex: draggingNodeId.value === n.id ? 10 : 1,
//   }
// }

// ===== 修改后：基于位置和状态的 z-index 分层，避免遮挡 =====
function nodeStyle(n: ChatMapNode) {
  let z = 1
  if (draggingNodeId.value === n.id) {
    z = 100
  } else if (hoveredNodeId.value === n.id || activeNodeId.value === n.id) {
    z = 50
  } else {
    // 右下方的节点 z-index 更高，避免重叠时上方节点遮挡下方
    z = Math.round(n.y / 100) * 10 + Math.round(n.x / 100)
  }
  return {
    left: `${n.x}px`,
    top: `${n.y}px`,
    width: `${NODE_W}px`,
    minHeight: `${NODE_H}px`,
    zIndex: z,
  }
}

function edgeKey(e: { source: string; target: string; edgeType: string }) {
  return `${e.edgeType}-${e.source}-${e.target}`
}

// ===== 连线路径：使用贝塞尔曲线使连线更美观 =====
function isVerticalEdge(e: { edgeType: string }) {
  return e.edgeType === 'QUESTION_ANSWER' || e.edgeType === 'FOLLOW_UP'
}

// ===== 原始 verticalEdgePath（保留作为参考）=====
// function verticalEdgePath(s: ChatMapNode, t: ChatMapNode) {
//   const sx = s.x + NODE_W / 2
//   const sy = s.y + NODE_H
//   const tx = t.x + NODE_W / 2
//   const ty = t.y
//   const midY = (sy + ty) / 2
//   return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
// }

// ===== 修改后：纵向连线使用平滑贝塞尔曲线 =====
function verticalEdgePath(s: ChatMapNode, t: ChatMapNode) {
  const sx = s.x + NODE_W / 2
  const sy = s.y + NODE_H
  const tx = t.x + NODE_W / 2
  const ty = t.y
  const dx = Math.abs(tx - sx)
  const dy = Math.abs(ty - sy)
  const cpOffset = Math.min(dy * 0.4, 80)
  if (dx < 5) {
    // 几乎同列：直接用竖直贝塞尔
    return `M ${sx} ${sy} C ${sx} ${sy + cpOffset}, ${tx} ${ty - cpOffset}, ${tx} ${ty}`
  }
  // 不同列：弯折贝塞尔
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} C ${sx} ${sy + cpOffset}, ${sx} ${midY}, ${(sx + tx) / 2} ${midY} S ${tx} ${ty - cpOffset}, ${tx} ${ty}`
}

// ===== 原始 citationEdgePath（保留作为参考）=====
// function citationEdgePath(s: ChatMapNode, t: ChatMapNode) {
//   const sx = s.x + NODE_W
//   const sy = s.y + NODE_H / 2
//   const tx = t.x
//   const ty = t.y + NODE_H / 2
//   if (tx >= sx) {
//     const midX = (sx + tx) / 2
//     return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`
//   }
//   const offsetSide = 24
//   return `M ${sx} ${sy} L ${sx + offsetSide} ${sy} L ${sx + offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${ty} L ${tx} ${ty}`
// }

// ===== 修改后：引用连线使用平滑贝塞尔曲线 =====
function citationEdgePath(s: ChatMapNode, t: ChatMapNode) {
  const sx = s.x + NODE_W
  const sy = s.y + NODE_H / 2
  const tx = t.x
  const ty = t.y + NODE_H / 2
  const dx = Math.abs(tx - sx)
  if (tx >= sx) {
    const cpOffset = Math.min(dx * 0.4, 80)
    return `M ${sx} ${sy} C ${sx + cpOffset} ${sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`
  }
  // 引用节点在左侧：弧形绕行
  const offsetSide = Math.min(40, dx * 0.3)
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} C ${sx + offsetSide} ${sy}, ${sx + offsetSide} ${midY}, ${(sx + tx) / 2} ${midY} S ${tx - offsetSide} ${ty}, ${tx} ${ty}`
}

function edgePath(e: { source: string; target: string; edgeType: string }) {
  const s = nodeMap.value.get(e.source)
  const t = nodeMap.value.get(e.target)
  if (!s || !t) return ''
  return isVerticalEdge(e) ? verticalEdgePath(s, t) : citationEdgePath(s, t)
}

function verticalArrowPoint(t: ChatMapNode) {
  const tx = t.x + NODE_W / 2
  const ty = t.y
  return `${tx - 5},${ty - 8} ${tx + 5},${ty - 8} ${tx},${ty}`
}

function citationArrowPoint(t: ChatMapNode) {
  const tx = t.x
  const ty = t.y + NODE_H / 2
  return `${tx - 8},${ty - 4} ${tx - 8},${ty + 4} ${tx},${ty}`
}

function arrowPoint(e: { source: string; target: string; edgeType: string }): string {
  const s = nodeMap.value.get(e.source)
  const t = nodeMap.value.get(e.target)
  if (!s || !t) return ''
  return isVerticalEdge(e) ? verticalArrowPoint(t) : citationArrowPoint(t)
}

function isEdgeSelected(e: { source: string; target: string; edgeType: string }) {
  return activeEdgeId.value === edgeKey(e)
}

function isEdgeHighlightedByNode(e: { source: string; target: string; edgeType: string }) {
  if (!activeNodeId.value) return false
  return e.source === activeNodeId.value || e.target === activeNodeId.value
}

function getEdgeStroke(e: { source: string; target: string; edgeType: string }) {
  if (isEdgeSelected(e)) {
    return '#2563eb'
  }
  if (activeNodeId.value) {
    if (e.source === activeNodeId.value) {
      return '#8b5cf6'
    }
    if (e.target === activeNodeId.value) {
      return '#0284c7'
    }
    return 'rgba(160, 175, 195, 0.2)'
  }
  if (e.edgeType === 'CITATION' || e.edgeType === 'FOLLOW_UP') {
    return '#3b82f6'
  }
  return 'rgba(120, 130, 150, 0.45)'
}

function getEdgeStrokeWidth(e: { source: string; target: string; edgeType: string }) {
  if (isEdgeSelected(e)) return 3
  if (isEdgeHighlightedByNode(e)) return 2.5
  return 1.5
}

function getEdgeDashArray(e: { source: string; target: string; edgeType: string }) {
  if (e.edgeType === 'CITATION' || e.edgeType === 'FOLLOW_UP') {
    return isEdgeSelected(e) || isEdgeHighlightedByNode(e) ? 'none' : '5 3'
  }
  return 'none'
}

function getArrowFill(e: { source: string; target: string; edgeType: string }) {
  return getEdgeStroke(e)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.2, Math.min(2.5, scale.value * delta))
}

// ===== 坐标转换：屏幕坐标 → 世界坐标（考虑缩放和偏移） =====
function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
  if (!containerRef.value) return { x: 0, y: 0 }
  const rect = containerRef.value.getBoundingClientRect()
  const sx = (clientX - rect.left - offset.value.x) / scale.value
  const sy = (clientY - rect.top - offset.value.y) / scale.value
  return { x: sx, y: sy }
}

function onMouseDown(e: MouseEvent) {
  const nodeEl = (e.target as HTMLElement).closest('.chat-map-node') as HTMLElement | null
  if (nodeEl) {
    const nodeId = nodeEl.dataset.nodeId
    if (nodeId) {
      startDrag(nodeId, e)
    }
    return
  }
  if ((e.target as HTMLElement).closest('.chat-map-edge')) return
  isPanning.value = true
  panStart.value = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
}

function startDrag(nodeId: string, e: MouseEvent) {
  const node = nodeMap.value.get(nodeId)
  if (!node) return
  draggingNodeId.value = nodeId
  const world = screenToWorld(e.clientX, e.clientY)
  dragOffset.value = { x: world.x - node.x, y: world.y - node.y }
  dragStartPos.value = { x: node.x, y: node.y }
  isPanning.value = false
}

function onMouseMove(e: MouseEvent) {
  if (draggingNodeId.value) {
    handleDrag(e)
    return
  }
  if (!isPanning.value) return
  offset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
}

// ===== 碰撞检测：两个矩形是否重叠 =====
function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

// ===== 碰撞推离：将拖动节点从重叠的其他节点中完全推出 =====
function pushOutOfOverlap(
  dragX: number, dragY: number, dragW: number, dragH: number,
  otherNodes: ChatMapNode[], excludeId: string,
): { x: number; y: number } {
  let x = dragX
  let y = dragY
  let hasOverlap = true
  let iterations = 0
  const maxIterations = 10

  while (hasOverlap && iterations < maxIterations) {
    hasOverlap = false
    iterations++
    for (const other of otherNodes) {
      if (other.id === excludeId) continue
      if (!rectsOverlap(x, y, dragW, dragH, other.x, other.y, NODE_W, NODE_H)) continue
      hasOverlap = true

      const overlapRight = (x + dragW) - other.x
      const overlapLeft = (other.x + NODE_W) - x
      const overlapBottom = (y + dragH) - other.y
      const overlapTop = (other.y + NODE_H) - y
      const minOverlap = Math.min(overlapRight, overlapLeft, overlapBottom, overlapTop)

      if (minOverlap === overlapRight) {
        x = other.x - dragW - 8
      } else if (minOverlap === overlapLeft) {
        x = other.x + NODE_W + 8
      } else if (minOverlap === overlapBottom) {
        y = other.y - dragH - 8
      } else {
        y = other.y + NODE_H + 8
      }
    }
  }
  return { x, y }
}

// ===== 对齐吸附计算 + 碰撞避免 =====
function handleDrag(e: MouseEvent) {
  const nodeId = draggingNodeId.value
  if (!nodeId) return
  const node = nodeMap.value.get(nodeId)
  if (!node) return

  const world = screenToWorld(e.clientX, e.clientY)
  let newX = world.x - dragOffset.value.x
  let newY = world.y - dragOffset.value.y

  const otherNodes = nodes.value.filter((n) => n.id !== nodeId)

  // 第一步：碰撞推离，确保不重叠
  const pushed = pushOutOfOverlap(newX, newY, NODE_W, NODE_H, otherNodes, nodeId)
  newX = pushed.x
  newY = pushed.y

  // 第二步：对齐吸附
  const dragLeft = newX
  const dragRight = newX + NODE_W
  const dragTop = newY
  const dragBottom = newY + NODE_H
  const dragCenterX = newX + NODE_W / 2
  const dragCenterY = newY + NODE_H / 2

  const guides: SnapGuide[] = []
  let bestSnapX = newX
  let bestSnapY = newY
  let bestSnapDistX = SNAP_THRESHOLD + 1
  let bestSnapDistY = SNAP_THRESHOLD + 1

  for (const other of otherNodes) {
    const oLeft = other.x
    const oRight = other.x + NODE_W
    const oTop = other.y
    const oBottom = other.y + NODE_H
    const oCenterX = other.x + NODE_W / 2
    const oCenterY = other.y + NODE_H / 2

    const xCandidates = [
      { dragEdge: dragLeft, otherEdge: oLeft, snapX: oLeft },
      { dragEdge: dragLeft, otherEdge: oRight, snapX: oRight },
      { dragEdge: dragRight, otherEdge: oLeft, snapX: oLeft - NODE_W },
      { dragEdge: dragRight, otherEdge: oRight, snapX: oRight - NODE_W },
      { dragEdge: dragCenterX, otherEdge: oCenterX, snapX: oCenterX - NODE_W / 2 },
    ]

    for (const c of xCandidates) {
      const dist = Math.abs(c.dragEdge - c.otherEdge)
      if (dist < bestSnapDistX) {
        bestSnapDistX = dist
        bestSnapX = c.snapX
      }
    }

    const yCandidates = [
      { dragEdge: dragTop, otherEdge: oTop, snapY: oTop },
      { dragEdge: dragTop, otherEdge: oBottom, snapY: oBottom },
      { dragEdge: dragBottom, otherEdge: oTop, snapY: oTop - NODE_H },
      { dragEdge: dragBottom, otherEdge: oBottom, snapY: oBottom - NODE_H },
      { dragEdge: dragCenterY, otherEdge: oCenterY, snapY: oCenterY - NODE_H / 2 },
    ]

    for (const c of yCandidates) {
      const dist = Math.abs(c.dragEdge - c.otherEdge)
      if (dist < bestSnapDistY) {
        bestSnapDistY = dist
        bestSnapY = c.snapY
      }
    }
  }

  if (bestSnapDistX <= SNAP_THRESHOLD) {
    newX = bestSnapX
    const guideYStart = Math.min(newY, ...otherNodes.map((n) => n.y))
    const guideYEnd = Math.max(newY + NODE_H, ...otherNodes.map((n) => n.y + NODE_H))
    guides.push({ type: 'vertical', position: newX, start: guideYStart, end: guideYEnd })
    guides.push({ type: 'vertical', position: newX + NODE_W / 2, start: guideYStart, end: guideYEnd })
  }

  if (bestSnapDistY <= SNAP_THRESHOLD) {
    newY = bestSnapY
    const guideXStart = Math.min(newX, ...otherNodes.map((n) => n.x))
    const guideXEnd = Math.max(newX + NODE_W, ...otherNodes.map((n) => n.x + NODE_W))
    guides.push({ type: 'horizontal', position: newY, start: guideXStart, end: guideXEnd })
    guides.push({ type: 'horizontal', position: newY + NODE_H / 2, start: guideXStart, end: guideXEnd })
  }

  // 第三步：吸附后再次碰撞推离，确保吸附没有导致重叠
  const pushed2 = pushOutOfOverlap(newX, newY, NODE_W, NODE_H, otherNodes, nodeId)
  newX = pushed2.x
  newY = pushed2.y

  snapGuides.value = guides
  node.x = newX
  node.y = newY
}

function onMouseUp() {
  if (draggingNodeId.value) {
    snapGuides.value = []
    draggingNodeId.value = null
  }
  isPanning.value = false
}

function onContainerClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.chat-map-node') || (e.target as HTMLElement).closest('.chat-map-edge')) return
  activeNodeId.value = null
  activeEdgeId.value = null
}

function onNodeClick(n: ChatMapNode) {
  activeNodeId.value = n.id
  activeEdgeId.value = null
  sessionStore.triggerFocus(n.infoId)
}

function onEdgeClick(e: { source: string; target: string; edgeType: string }) {
  activeEdgeId.value = edgeKey(e)
  activeNodeId.value = null
}

function togglePin(n: ChatMapNode) {
  sessionStore.togglePin(n.infoId)
}

function jumpTo(infoId: string) {
  activeNodeId.value = infoId
  sessionStore.triggerFocus(infoId)
}

// ===== 原始 showThinking 实现（保留参考） =====
/*
async function showThinking(infoId: string) {
  sessionStore.openThinkingModal(infoId)
  try {
    const res = await chatApi.thinking(infoId)
    sessionStore.openThinkingModal(infoId, res.blocks)
  } catch {
    sessionStore.openThinkingModal(infoId, [])
  }
}
*/

// ===== 修改后：思考过程独立按模块并发加载（DAG 与 ThinkingBlocks 独立加载与渐进式展示） =====
async function showThinking(infoId: string) {
  sessionStore.startThinkingLoading(infoId)

  const dagPromise = chatApi.thinking(infoId, 'dag')
    .then(res => sessionStore.setThinkingDag(res.dag ?? null))
    .catch(() => sessionStore.setThinkingDag(null))

  const blocksPromise = chatApi.thinking(infoId, 'blocks')
    .then(res => sessionStore.setThinkingBlocks(res.blocks ?? []))
    .catch(() => sessionStore.setThinkingBlocks([]))

  await Promise.allSettled([dagPromise, blocksPromise])
}

// 列表点击消息 -> 平移 ChatMap 使该消息居中并高亮
watch(() => sessionStore.centerInfoId, async (id) => {
  if (!id) return
  activeNodeId.value = id
  activeEdgeId.value = null
  const node = nodeMap.value.get(id)
  if (!node || !containerRef.value) return
  await nextTick()
  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  offset.value = {
    x: -(node.x + NODE_W / 2) * scale.value + cw / 2,
    y: -(node.y + NODE_H / 2) * scale.value + ch / 2,
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full overflow-hidden select-none"
    :class="{ 'cursor-grabbing': isPanning || draggingNodeId, 'cursor-grab': !isPanning && !draggingNodeId }"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @click="onContainerClick"
  >
    <div
      v-if="nodes.length === 0"
      class="absolute inset-0 flex flex-col items-center justify-center text-apple-gray-400 text-sm"
    >
      <p>暂无 ChatMap 数据</p>
      <p class="text-xs mt-1">发送消息后将生成对话图谱</p>
    </div>

    <div
      v-else
      class="absolute top-0 left-0"
      :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: `${worldWidth}px`, height: `${worldHeight}px` }"
    >
      <!-- 连线 -->
      <svg :width="worldWidth" :height="worldHeight" class="absolute top-0 left-0 pointer-events-none">
        <!-- 对齐吸附引导线 -->
        <g v-if="snapGuides.length > 0">
          <line
            v-for="(guide, i) in snapGuides"
            :key="`guide-${i}`"
            :x1="guide.type === 'vertical' ? guide.position : guide.start"
            :y1="guide.type === 'vertical' ? guide.start : guide.position"
            :x2="guide.type === 'vertical' ? guide.position : guide.end"
            :y2="guide.type === 'vertical' ? guide.end : guide.position"
            stroke="#2563eb"
            stroke-width="1"
            stroke-dasharray="4 4"
            opacity="0.6"
          />
        </g>

        <g
          v-for="e in edges"
          :key="edgeKey(e)"
          class="chat-map-edge pointer-events-auto cursor-pointer"
          @click.stop="onEdgeClick(e)"
        >
          <!-- 隐形点击响应热区 -->
          <path
            :d="edgePath(e)"
            fill="none"
            stroke="transparent"
            stroke-width="14"
          />
          <!-- 实际连线 -->
          <path
            :d="edgePath(e)"
            fill="none"
            :stroke="getEdgeStroke(e)"
            :stroke-width="getEdgeStrokeWidth(e)"
            :stroke-dasharray="getEdgeDashArray(e)"
            class="transition-colors duration-200"
          />
          <!-- 箭头 -->
          <polygon
            :points="arrowPoint(e)"
            :fill="getArrowFill(e)"
            class="transition-colors duration-200"
          />
        </g>
      </svg>

      <!-- 节点 -->
      <div
        v-for="n in nodes"
        :key="n.id"
        class="chat-map-node absolute"
        :data-node-id="n.id"
        :style="nodeStyle(n)"
        @mouseenter="hoveredNodeId = n.id"
        @mouseleave="hoveredNodeId = null"
      >
        <MessageCard
          :id="n.id"
          :info-id="n.infoId"
          :role="n.role || n.infoType"
          :content="n.info"
          :summary="n.summary"
          :timestamp="n.created"
          :pin="n.pin"
          :selected="sessionStore.selectedMsgIds.has(n.infoId)"
          :cited-count="n.citedCount"
          :citing-count="n.citingCount"
          :cited-info-ids="n.citedInfoIds"
          :citing-info-ids="n.citingInfoIds"
          :trace-id="n.traceId"
          :work-id="n.workId"
          mode="map"
          :active="activeNodeId === n.id"
          :node-map="nodeMap"
          @toggle-select="sessionStore.toggleMsgSelection"
          @toggle-pin="togglePin(n)"
          @click-card="onNodeClick(n)"
          @jump-to="jumpTo"
          @show-thinking="showThinking"
          @show-eval="sessionStore.openEvalResult"
        />
      </div>
    </div>

    <!-- 缩放控制 -->
    <div class="absolute bottom-2 right-2 flex items-center gap-1 z-10">
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.min(2.5, scale + 0.2)">+</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.max(0.2, scale - 0.2)">-</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = 1; offset = { x: 40, y: 40 }">重置</button>
    </div>
  </div>
</template>