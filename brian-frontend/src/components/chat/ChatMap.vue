<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useSessionStore } from '@/stores/session'
import { Pin, PinOff, ChevronDown, CornerUpRight } from '@lucide/vue'
import type { ChatMapNode } from '@/api/types'

const sessionStore = useSessionStore()

const containerRef = ref<HTMLDivElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 40, y: 40 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const expandedCiting = ref<string | null>(null)
const expandedCited = ref<string | null>(null)

// 选中状态：activeNodeId 选中消息展示框，activeEdgeId 选中单条连线
const activeNodeId = ref<string | null>(null)
const activeEdgeId = ref<string | null>(null)

const NODE_W = 220
const NODE_H = 108

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

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nodeStyle(n: ChatMapNode) {
  return { left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px` }
}

function edgeKey(e: { source: string; target: string; edgeType: string }) {
  return `${e.edgeType}-${e.source}-${e.target}`
}

// 连线路径：
// 1. QUESTION_ANSWER：从提问方 (REQUEST) 下边中点指向回答方 (RESPONSE) 上边中点（向下箭头）
// 2. CITATION：从被引用方 (s) 右边中点指向引用方 (t) 左边中点（向右箭头）
function edgePath(e: { source: string; target: string; edgeType: string }) {
  const s = nodeMap.value.get(e.source)
  const t = nodeMap.value.get(e.target)
  if (!s || !t) return ''

  if (e.edgeType === 'QUESTION_ANSWER') {
    const sx = s.x + NODE_W / 2
    const sy = s.y + NODE_H
    const tx = t.x + NODE_W / 2
    const ty = t.y
    const midY = (sy + ty) / 2
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
  }

  // CITATION: 从被引用方右边中点指向引用方左边中点
  const sx = s.x + NODE_W
  const sy = s.y + NODE_H / 2
  const tx = t.x
  const ty = t.y + NODE_H / 2

  if (tx >= sx) {
    const midX = (sx + tx) / 2
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`
  } else {
    const offsetSide = 24
    return `M ${sx} ${sy} L ${sx + offsetSide} ${sy} L ${sx + offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${(sy + ty) / 2} L ${tx - offsetSide} ${ty} L ${tx} ${ty}`
  }
}

function arrowPoint(e: { source: string; target: string; edgeType: string }): string {
  const s = nodeMap.value.get(e.source)
  const t = nodeMap.value.get(e.target)
  if (!s || !t) return ''

  if (e.edgeType === 'QUESTION_ANSWER') {
    const tx = t.x + NODE_W / 2
    const ty = t.y
    return `${tx - 5},${ty - 8} ${tx + 5},${ty - 8} ${tx},${ty}`
  }

  // CITATION: 箭头指向引用方左侧中点，方向向右
  const tx = t.x
  const ty = t.y + NODE_H / 2
  return `${tx - 8},${ty - 4} ${tx - 8},${ty + 4} ${tx},${ty}`
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
  if (e.edgeType === 'CITATION') {
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
  if (e.edgeType === 'CITATION') {
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
  expandedCiting.value = null
  expandedCited.value = null
  activeNodeId.value = infoId
  sessionStore.triggerFocus(infoId)
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
        class="chat-map-node absolute rounded-lg border bg-white/95 dark:bg-apple-gray-800/95 shadow-sm text-xs transition-all duration-200"
        :style="nodeStyle(n)"
        :class="[
          n.infoType === 'REQUEST' ? 'border-brian-blue/40' : 'border-apple-gray-200 dark:border-apple-gray-700',
          activeNodeId === n.id ? 'ring-2 ring-brian-blue shadow-lg border-brian-blue' : 'hover:border-brian-blue/60'
        ]"
        @click.stop="onNodeClick(n)"
      >
        <!-- 复选框 + 钉住 -->
        <div class="flex items-center justify-between px-2 pt-1.5">
          <div class="flex items-center gap-1.5">
            <label
              class="flex items-center gap-1 cursor-pointer"
              title="勾选以指定本次问答上下文"
              @click.stop
            >
              <input
                type="checkbox"
                class="accent-brian-blue rounded h-3.5 w-3.5 cursor-pointer"
                :checked="sessionStore.selectedMsgIds.has(n.infoId)"
                @change="sessionStore.toggleMsgSelection(n.infoId)"
              />
            </label>
            <span class="text-[10px] text-apple-gray-400">{{ formatTime(n.created) }}</span>
          </div>

          <button
            class="p-0.5 rounded text-apple-gray-400 hover:text-brian-blue"
            :class="n.pin ? 'text-warning-orange' : ''"
            :title="n.pin ? '取消钉住' : '钉住'"
            @click.stop="togglePin(n)"
          >
            <component :is="n.pin ? Pin : PinOff" :size="12" />
          </button>
        </div>

        <!-- 摘要 -->
        <div class="px-2 py-0.5 text-apple-gray-700 dark:text-apple-gray-200 truncate" :title="n.summary">
          {{ n.summary || '(无内容)' }}
        </div>

        <!-- 原文（折叠） -->
        <details class="px-2 pb-0.5 text-apple-gray-500 dark:text-apple-gray-400">
          <summary class="cursor-pointer text-[10px]">原文</summary>
          <p class="whitespace-pre-wrap break-all text-[11px] max-h-20 overflow-y-auto">{{ n.info }}</p>
        </details>

        <!-- 引用 / 被引用 胶囊 -->
        <div class="flex items-center gap-1.5 px-2 pb-1.5">
          <button
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue text-[10px] hover:bg-brian-blue/20 transition-colors"
            @click.stop="expandedCited = expandedCited === n.id ? null : n.id"
          >
            引用 {{ n.citedCount }}
            <ChevronDown :size="10" :class="expandedCited === n.id ? 'rotate-180' : ''" />
          </button>
          <button
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 text-[10px] hover:bg-apple-gray-200 transition-colors"
            @click.stop="expandedCiting = expandedCiting === n.id ? null : n.id"
          >
            被引用 {{ n.citingCount }}
            <ChevronDown :size="10" :class="expandedCiting === n.id ? 'rotate-180' : ''" />
          </button>
          <span class="ml-auto text-[10px] text-apple-gray-300">{{ n.infoLength }}字</span>
        </div>

        <!-- 展开：引用列表 -->
        <div v-if="expandedCited === n.id" class="px-2 pb-1.5 space-y-0.5 border-t border-apple-gray-100 dark:border-apple-gray-700 pt-1">
          <p class="text-[10px] text-apple-gray-400">引用以下消息：</p>
          <button
            v-for="cid in n.citedInfoIds"
            :key="cid"
            class="flex items-center gap-1 w-full text-left text-[10px] text-apple-gray-500 hover:text-brian-blue truncate"
            @click.stop="jumpTo(cid)"
          >
            <CornerUpRight :size="10" class="flex-shrink-0" />
            {{ nodeMap.get(cid)?.summary || cid.slice(0, 8) }}
          </button>
          <p v-if="n.citedInfoIds.length === 0" class="text-[10px] text-apple-gray-300">无</p>
        </div>

        <!-- 展开：被引用列表 -->
        <div v-if="expandedCiting === n.id" class="px-2 pb-1.5 space-y-0.5 border-t border-apple-gray-100 dark:border-apple-gray-700 pt-1">
          <p class="text-[10px] text-apple-gray-400">被以下消息引用：</p>
          <button
            v-for="cid in n.citingInfoIds"
            :key="cid"
            class="flex items-center gap-1 w-full text-left text-[10px] text-apple-gray-500 hover:text-brian-blue truncate"
            @click.stop="jumpTo(cid)"
          >
            <CornerUpRight :size="10" class="flex-shrink-0" />
            {{ nodeMap.get(cid)?.summary || cid.slice(0, 8) }}
          </button>
          <p v-if="n.citingInfoIds.length === 0" class="text-[10px] text-apple-gray-300">无</p>
        </div>
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
