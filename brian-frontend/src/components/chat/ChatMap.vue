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
  return maxX + NODE_W + 120
})

const worldHeight = computed(() => {
  let maxY = 0
  for (const n of nodes.value) maxY = Math.max(maxY, n.y)
  return maxY + NODE_H + 120
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

// 正交连线：回复(垂直)向下箭头、引用(水平)向右箭头
function edgePath(e: { source: string; target: string; edgeType: string }) {
  const s = nodeMap.value.get(e.source)
  const t = nodeMap.value.get(e.target)
  if (!s || !t) return ''
  const sx = s.x + NODE_W / 2
  const sy = s.y + NODE_H
  const tx = t.x + NODE_W / 2
  const ty = t.y
  if (e.edgeType === 'QUESTION_ANSWER') {
    const midY = (sy + ty) / 2
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
  }
  const midX = (sx + tx) / 2
  return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`
}

function arrowPoint(e: { source: string; target: string; edgeType: string }): string {
  const t = nodeMap.value.get(e.target)
  if (!t) return ''
  const tx = t.x + NODE_W / 2
  const ty = t.y
  if (e.edgeType === 'QUESTION_ANSWER') {
    // 向下箭头
    return `${tx - 5},${ty - 10} ${tx + 5},${ty - 10} ${tx},${ty}`
  }
  // 向右箭头
  return `${tx - 10},${ty - 5} ${tx - 10},${ty + 5} ${tx},${ty}`
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.2, Math.min(2.5, scale.value * delta))
}

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.chat-map-node')) return
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

function onNodeClick(n: ChatMapNode) {
  sessionStore.triggerFocus(n.infoId)
}

function togglePin(n: ChatMapNode) {
  sessionStore.togglePin(n.infoId)
}

function jumpTo(infoId: string) {
  expandedCiting.value = null
  expandedCited.value = null
  sessionStore.triggerFocus(infoId)
}

// 列表点击消息 -> 平移 ChatMap 使该消息居中
watch(() => sessionStore.centerInfoId, async (id) => {
  if (!id) return
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
      <svg :width="worldWidth" :height="worldHeight" class="absolute top-0 left-0">
        <g v-for="e in edges" :key="e.source + '-' + e.target">
          <path
            :d="edgePath(e)"
            fill="none"
            stroke="rgba(120,130,150,0.45)"
            stroke-width="1.5"
          />
          <polygon :points="arrowPoint(e)" fill="rgba(120,130,150,0.7)" />
        </g>
      </svg>

      <!-- 节点 -->
      <div
        v-for="n in nodes"
        :key="n.id"
        class="chat-map-node absolute rounded-lg border bg-white/95 dark:bg-apple-gray-800/95 shadow-sm text-xs"
        :style="nodeStyle(n)"
        :class="n.infoType === 'REQUEST' ? 'border-brian-blue/40' : 'border-apple-gray-200 dark:border-apple-gray-700'"
        @click.stop="onNodeClick(n)"
      >
        <!-- 复选框 + 钉住 -->
        <div class="flex items-center justify-between px-2 pt-1.5">
          <label
            v-if="sessionStore.citingMode"
            class="flex items-center gap-1 cursor-pointer"
            @click.stop
          >
            <input
              type="checkbox"
              class="accent-brian-blue"
              :checked="sessionStore.selectedMsgIds.has(n.infoId)"
              @change="sessionStore.toggleMsgSelection(n.infoId)"
            />
          </label>
          <span v-else class="text-[10px] text-apple-gray-400">{{ formatTime(n.created) }}</span>

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
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue text-[10px]"
            @click.stop="expandedCited = expandedCited === n.id ? null : n.id"
          >
            引用 {{ n.citedCount }}
            <ChevronDown :size="10" :class="expandedCited === n.id ? 'rotate-180' : ''" />
          </button>
          <button
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 text-[10px]"
            @click.stop="expandedCiting = expandedCiting === n.id ? null : n.id"
          >
            被引用 {{ n.citingCount }}
            <ChevronDown :size="10" :class="expandedCiting === n.id ? 'rotate-180' : ''" />
          </button>
          <span class="ml-auto text-[10px] text-apple-gray-300">{{ n.infoLength }}字</span>
        </div>

        <!-- 展开：被引用列表 -->
        <div v-if="expandedCiting === n.id" class="px-2 pb-1.5 space-y-0.5">
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

        <!-- 展开：引用列表 -->
        <div v-if="expandedCited === n.id" class="px-2 pb-1.5 space-y-0.5">
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
