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

// 消息框尺寸：宽/高在原始基础上放大为 1.5 倍（220→330，108→162）
const NODE_W = 330
const NODE_H = 162

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
  return maxX + NODE_W + 160
})

const worldHeight = computed(() => {
  let maxY = 0
  for (const n of nodes.value) maxY = Math.max(maxY, n.y)
  return maxY + NODE_H + 160
})

function nodeStyle(n: ChatMapNode) {
  return { left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px`, minHeight: `${NODE_H}px` }
}

function edgeKey(e: { source: string; target: string; edgeType: string }) {
  return `${e.edgeType}-${e.source}-${e.target}`
}

// 连线路径：
// 1. QUESTION_ANSWER / FOLLOW_UP（纵向）：从提问方 (REQUEST) 下边中点指向回答方 (RESPONSE) 上边中点（向下箭头）
// 2. CITATION（横向）：从被引用方 (s) 右边中点指向引用方 (t) 左边中点（向右箭头）
function isVerticalEdge(e: { edgeType: string }) {
  return e.edgeType === 'QUESTION_ANSWER' || e.edgeType === 'FOLLOW_UP'
}

function verticalEdgePath(s: ChatMapNode, t: ChatMapNode) {
  const sx = s.x + NODE_W / 2
  const sy = s.y + NODE_H
  const tx = t.x + NODE_W / 2
  const ty = t.y
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
}

function citationEdgePath(s: ChatMapNode, t: ChatMapNode) {
  const sx = s.x + NODE_W
  const sy = s.y + NODE_H / 2
  const tx = t.x
  const ty = t.y + NODE_H / 2
  if (tx >= sx) {
    const midX = (sx + tx) / 2
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`
  }
  const offsetSide = 24
  return `M ${sx} ${sy} L ${sx + offsetSide} ${sy} L ${sx + offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${ty} L ${tx} ${ty}`
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
    return '#2563eb' // 单选连线高亮
  }
  if (activeNodeId.value) {
    if (e.source === activeNodeId.value) {
      // 当前节点是被引用方（被引用的连线发向别处）
      return '#8b5cf6' // 紫色高亮
    }
    if (e.target === activeNodeId.value) {
      // 当前节点是引用方（引用的连线来自别处）
      return '#0284c7' // 天蓝色高亮
    }
    return 'rgba(160, 175, 195, 0.2)' // 未选中连线淡化
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

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.chat-map-node') || (e.target as HTMLElement).closest('.chat-map-edge')) return
  isPanning.value = true
  panStart.value = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
}

function onMouseMove(e: MouseEvent) {
  if (!isPanning.value) return
  offset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
}

function onMouseUp() {
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
    :class="{ 'cursor-grabbing': isPanning, 'cursor-grab': !isPanning }"
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
        :style="nodeStyle(n)"
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
