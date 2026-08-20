<!--
TaskDAG Canvas 图：将 Planner 的任务级拆解以分层 DAG 画布方式展示
（含依赖箭头，节点展示任务域 / 复杂度 / 优先级 / 内容摘要）
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Layers } from '@lucide/vue'
import type { TaskDagData } from '@/api/types'
import { layoutDag, DAG_NODE_W, DAG_NODE_H } from './dagLayout'

const props = defineProps<{
  dag: TaskDagData | null
}>()

const nodes = computed(() => (props.dag?.nodes ?? []) as unknown as Parameters<typeof layoutDag>[0])
const edges = computed(() =>
  (props.dag?.edges ?? []).map((e) => ({ source: e.source, target: e.target })),
)

const layout = computed(() => layoutDag(nodes.value, edges.value))

const containerStyle = computed(() => {
  const l = layout.value
  const h = Math.max(l.totalHeight, DAG_NODE_H) + 8
  return { width: `${l.totalWidth}px`, height: `${h}px` }
})

function nodeStyle(id: string) {
  const pos = layout.value.positions.get(id)
  if (!pos) return {}
  return {
    left: `${pos.x}px`,
    top: `${pos.y + 4}px`,
    width: `${DAG_NODE_W}px`,
    height: `${DAG_NODE_H - 8}px`,
    overflow: 'hidden',
  }
}

function edgePath(source: string, target: string): string {
  const p = layout.value.positions
  const s = p.get(source)
  const t = p.get(target)
  if (!s || !t) return ''
  const sy = s.y + 4 + DAG_NODE_H / 2
  const ty = t.y + 4 + DAG_NODE_H / 2
  const sx = s.x + DAG_NODE_W
  const tx = t.x
  const mx = (sx + tx) / 2
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`
}

function dependencyIndex(depId: string): number {
  const arr = props.dag?.nodes ?? []
  const idx = arr.findIndex((n) => n.id === depId)
  return idx >= 0 ? idx : -1
}
</script>

<template>
  <div v-if="dag && dag.nodes && dag.nodes.length > 0" class="task-dag-flow my-2.5 p-3 rounded-xl border border-purple-200/80 dark:border-purple-800/60 bg-gradient-to-br from-purple-50/60 to-indigo-50/30 dark:from-purple-950/30 dark:to-indigo-950/20 shadow-sm select-text">
    <div class="flex items-center justify-between pb-2 border-b border-purple-100 dark:border-purple-900/40 mb-2">
      <div class="flex items-center gap-2">
        <Layers :size="15" class="text-purple-600 dark:text-purple-400" />
        <span class="text-xs font-bold text-purple-900 dark:text-purple-200">任务拆解 (Task DAG)</span>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
        {{ dag.nodes.length }} 个子任务
      </span>
    </div>

    <div class="overflow-x-auto">
      <div class="relative" :style="containerStyle">
        <!-- 依赖箭头 (SVG 覆盖层) -->
        <svg
          class="absolute inset-0 pointer-events-none"
          :width="layout.totalWidth"
          :height="Math.max(layout.totalHeight, DAG_NODE_H) + 8"
        >
          <defs>
            <marker id="taskdag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
            </marker>
          </defs>
          <path
            v-for="(e, idx) in dag.edges"
            :key="idx"
            :d="edgePath(e.source, e.target)"
            fill="none"
            stroke="#a78bfa"
            stroke-width="1.8"
            stroke-dasharray="4 3"
            marker-end="url(#taskdag-arrow)"
            opacity="0.75"
          />
        </svg>

        <!-- 任务节点 -->
        <div
          v-for="(task, idx) in dag.nodes"
          :key="task.id"
          class="absolute rounded-lg border bg-white dark:bg-apple-gray-800/90 border-purple-200/70 dark:border-purple-800/50 p-2 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          :style="nodeStyle(task.id)"
          :title="task.content || task.label"
        >
          <div class="flex items-center gap-1 flex-wrap">
            <span class="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
              {{ idx + 1 }}
            </span>
            <span v-if="task.domain" class="px-1 py-0.5 rounded text-[9px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40 truncate">
              {{ task.domain }}
            </span>
            <span v-if="task.complexity" class="px-1 py-0.5 rounded text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
              复杂度{{ task.complexity }}
            </span>
            <span v-if="task.priority" class="px-1 py-0.5 rounded text-[9px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              优先级{{ task.priority }}
            </span>
          </div>
          <p class="text-[11px] text-apple-gray-700 dark:text-apple-gray-200 mt-1 leading-snug line-clamp-2 break-words">
            {{ task.content || task.label }}
          </p>
          <p v-if="task.dependencies && task.dependencies.length > 0" class="text-[9px] text-apple-gray-400 mt-0.5 truncate">
            依赖: {{ task.dependencies.map((d) => dependencyIndex(d) >= 0 ? `#${dependencyIndex(d) + 1}` : d).join(', ') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
