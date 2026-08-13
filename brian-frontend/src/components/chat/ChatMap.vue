<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { visualizationApi } from '@/api'
import type { AgentDAG } from '@/api/types'
import { Loader2, X } from '@lucide/vue'

const sessionStore = useSessionStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const selectedNodeId = ref<string | null>(null)
const nodeDetail = ref<Record<string, unknown> | null>(null)
const loadingDetail = ref(false)

const nodes = computed(() => sessionStore.dagNodes)
const edges = computed(() => sessionStore.dagEdges)
const workId = computed(() => sessionStore.dagWorkId)

async function loadNodeDetail(agentId: string) {
  if (!workId.value) { nodeDetail.value = null; return }
  loadingDetail.value = true
  nodeDetail.value = null
  try {
    const dag: AgentDAG = await visualizationApi.agentDAG(workId.value, true)
    const dagNodes = (dag.graph?.nodes ?? dag.nodes ?? []) as Array<Record<string, unknown>>
    const found = dagNodes.find(n => String(n.agent_id ?? '') === agentId)
    nodeDetail.value = found ?? null
  } catch { nodeDetail.value = null }
  finally { loadingDetail.value = false }
}

watch(selectedNodeId, (id) => {
  if (id) loadNodeDetail(id)
  else nodeDetail.value = null
})

const _WIDTH = 800
const _HEIGHT = 600

function drawMap() {
  const cvs = canvasRef.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  if (!ctx) return

  cvs.width = cvs.offsetWidth * window.devicePixelRatio
  cvs.height = cvs.offsetHeight * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const w = cvs.offsetWidth
  const h = cvs.offsetHeight

  ctx.clearRect(0, 0, w, h)

  ctx.save()
  ctx.translate(offset.value.x + w / 2, offset.value.y + h / 2)
  ctx.scale(scale.value, scale.value)

  const isDark = document.documentElement.classList.contains('dark')

  // Draw edges
  for (const edge of edges.value) {
    const src = nodes.value.find(n => n.id === edge.source)
    const tgt = nodes.value.find(n => n.id === edge.target)
    if (!src || !tgt) continue

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    const cp1x = src.x + (tgt.x - src.x) * 0.5
    const cp1y = src.y
    const cp2x = tgt.x - (tgt.x - src.x) * 0.5
    const cp2y = tgt.y
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tgt.x, tgt.y)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Arrow
    const arrowSize = 6
    const dx = tgt.x - cp2x
    const dy = tgt.y - cp2y
    const angle = Math.atan2(dy, dx)
    ctx.beginPath()
    ctx.moveTo(tgt.x, tgt.y)
    ctx.lineTo(tgt.x - arrowSize * Math.cos(angle - Math.PI / 6), tgt.y - arrowSize * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(tgt.x, tgt.y)
    ctx.lineTo(tgt.x - arrowSize * Math.cos(angle + Math.PI / 6), tgt.y - arrowSize * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes.value) {
    const isSelected = selectedNodeId.value === node.id
    const statusColor = node.status === 'running' ? '#FF9500' : node.status === 'done' ? '#34C759' : node.status === 'error' ? '#FF3B30' : '#8E8E93'

    // Card
    const w2 = 80, h2 = 50
    ctx.fillStyle = isSelected ? (isDark ? '#2C2C2E' : '#FFFFFF') : (isDark ? 'rgba(44,44,46,0.8)' : 'rgba(255,255,255,0.9)')
    ctx.strokeStyle = isSelected ? '#007AFF' : (isDark ? '#48484A' : '#D1D1D6')
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.beginPath()
    roundRect(ctx, node.x - w2, node.y - h2, w2 * 2, h2 * 2, 8)
    ctx.fill()
    ctx.stroke()

    // Top status bar
    ctx.fillStyle = statusColor
    ctx.beginPath()
    ctx.arc(node.x, node.y - h2 + 10, 4, 0, Math.PI * 2)
    ctx.fill()

    // Label
    ctx.fillStyle = isDark ? '#F5F5F7' : '#1D1D1F'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(truncate(node.label, 12), node.x, node.y + 4)
  }

  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
}

function truncate(s: string, len: number) {
  return s.length > len ? s.slice(0, len) + '...' : s
}

function getMousePos(e: MouseEvent) {
  const cvs = canvasRef.value!
  const rect = cvs.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.2, Math.min(3, scale.value * delta))
  drawMap()
}

function handleMouseDown(e: MouseEvent) {
  const pos = getMousePos(e)
  const ctx = canvasRef.value?.getContext('2d')
  if (!ctx) return

  // Check if clicking a node
  const w = canvasRef.value!.offsetWidth
  const h = canvasRef.value!.offsetHeight
  const mx = (pos.x - offset.value.x - w / 2) / scale.value
  const my = (pos.y - offset.value.y - h / 2) / scale.value

  let hitNode = false
  for (const node of nodes.value) {
    if (Math.abs(mx - node.x) < 80 && Math.abs(my - node.y) < 50) {
      selectedNodeId.value = selectedNodeId.value === node.id ? null : node.id
      hitNode = true
      break
    }
  }

  if (!hitNode) {
    selectedNodeId.value = null
    isPanning.value = true
    panStart.value = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
  }
  drawMap()
}

function handleMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    offset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
    drawMap()
  }
}

function handleMouseUp() {
  isPanning.value = false
}

watch([nodes, edges], () => drawMap(), { deep: true })
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="nodes.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400 text-sm">
      <p>暂无 ChatMap 数据</p>
      <p class="text-xs mt-1">发送消息后将生成对话图谱</p>
    </div>
    <canvas
      ref="canvasRef"
      class="w-full h-full cursor-grab"
      :class="{ 'cursor-grabbing': isPanning }"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    />

    <!-- 节点详情面板 -->
    <div v-if="selectedNodeId" class="absolute top-2 right-2 w-72 max-h-[calc(100%-1rem)] overflow-y-auto rounded-xl bg-white/95 dark:bg-apple-gray-800/95 border border-apple-gray-200 dark:border-apple-gray-700 shadow-lg p-4 backdrop-blur">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-semibold">Agent 详情</span>
        <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedNodeId = null"><X :size="14" /></button>
      </div>

      <div v-if="loadingDetail" class="flex items-center justify-center py-8 text-apple-gray-400">
        <Loader2 :size="18" class="animate-spin" />
      </div>
      <div v-else-if="!nodeDetail" class="text-center py-8 text-apple-gray-400 text-sm">暂无详情</div>
      <div v-else class="space-y-4">
        <!-- 基本信息 -->
        <div>
          <p class="text-xs font-medium text-apple-gray-500 mb-1">基本信息</p>
          <div class="space-y-1 text-sm">
            <p><span class="text-apple-gray-400">名称：</span>{{ nodeDetail.agent_name || String(nodeDetail.agent_id || '').slice(0, 8) }}</p>
            <p><span class="text-apple-gray-400">类型：</span>{{ nodeDetail.agent_type || '—' }}</p>
            <p><span class="text-apple-gray-400">状态：</span>{{ nodeDetail.status || '—' }}</p>
            <p v-if="nodeDetail.runtime"><span class="text-apple-gray-400">迭代：</span>{{ (nodeDetail.runtime as Record<string, unknown>).iterations ?? 0 }} 次 · {{ (nodeDetail.runtime as Record<string, unknown>).elapsed_ms ?? 0 }}ms</p>
          </div>
        </div>

        <!-- 组件 -->
        <div>
          <p class="text-xs font-medium text-apple-gray-500 mb-1">使用组件</p>
          <div class="space-y-1.5 text-sm">
            <p v-if="nodeDetail.llm_detail">
              <span class="text-apple-gray-400">LLM：</span>{{ (nodeDetail.llm_detail as Record<string, unknown>).llm_title || (nodeDetail.llm_detail as Record<string, unknown>).id || '—' }}
            </p>
            <p v-if="nodeDetail.soul_detail">
              <span class="text-apple-gray-400">Soul：</span>{{ (nodeDetail.soul_detail as Record<string, unknown>).soul_brief || (nodeDetail.soul_detail as Record<string, unknown>).id || '—' }}
            </p>
            <div v-if="nodeDetail.skill_details && (nodeDetail.skill_details as unknown[]).length">
              <span class="text-apple-gray-400">Skill：</span>
              <span v-for="(s, i) in (nodeDetail.skill_details as Record<string, unknown>[])" :key="i" class="inline-block mr-1 px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue text-xs">
                {{ (s as Record<string, unknown>).skill_brief || (s as Record<string, unknown>).id || '—' }}
              </span>
            </div>
            <div v-if="nodeDetail.mcp_details && (nodeDetail.mcp_details as unknown[]).length">
              <span class="text-apple-gray-400">MCP：</span>
              <span v-for="(m, i) in (nodeDetail.mcp_details as Record<string, unknown>[])" :key="i" class="inline-block mr-1 px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue text-xs">
                {{ (m as Record<string, unknown>).mcp_title || (m as Record<string, unknown>).id || '—' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 评估 -->
        <div v-if="nodeDetail.eval_detail">
          <p class="text-xs font-medium text-apple-gray-500 mb-1">评估结果</p>
          <p class="text-sm">{{ (nodeDetail.eval_detail as Record<string, unknown>).scores || (nodeDetail.eval_detail as Record<string, unknown>).overall || '—' }}</p>
        </div>
      </div>
    </div>

    <div class="absolute bottom-2 right-2 flex items-center gap-1">
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.min(3, scale + 0.2); drawMap()">+</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.max(0.2, scale - 0.2); drawMap()">-</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = 1; offset = { x: 0, y: 0 }; drawMap()">重置</button>
    </div>
  </div>
</template>
