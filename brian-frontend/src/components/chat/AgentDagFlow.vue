<script setup lang="ts">
import { ref } from 'vue'
import { Network, ArrowRight, Clock, Zap, Layers, Sparkles } from '@lucide/vue'

export interface DagNodeItem {
  id: string
  label: string
  domain?: string
  content?: string
  status?: string
  agentName?: string
  input?: string
  output?: string
  elapsedMs?: number
  tokenUsage?: number
}

export interface DagEdgeItem {
  source: string
  target: string
  label?: string
}

export interface AgentDagData {
  planId?: string
  totalCount?: number
  nodes: DagNodeItem[]
  edges: DagEdgeItem[]
}

const props = defineProps<{
  dag: AgentDagData
}>()

const activeNode = ref<DagNodeItem | null>(null)

function formatJson(val: unknown): string {
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}
</script>

<template>
  <div v-if="dag && dag.nodes && dag.nodes.length > 0" class="agent-dag-flow my-2.5 p-3 rounded-xl border border-purple-200/80 dark:border-purple-800/60 bg-gradient-to-br from-purple-50/60 to-blue-50/40 dark:from-purple-950/30 dark:to-blue-950/20 shadow-sm">
    <div class="flex items-center justify-between pb-2 border-b border-purple-100 dark:border-purple-900/40">
      <div class="flex items-center gap-2">
        <Network :size="16" class="text-purple-600 dark:text-purple-400" />
        <span class="text-xs font-bold text-purple-900 dark:text-purple-200">
          长程多 Agent 协同依赖 DAG 网络 (共 {{ dag.nodes.length }} 个工作节点)
        </span>
      </div>

      <div class="flex items-center gap-2 text-[10px] text-purple-600 dark:text-purple-300">
        <span class="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50">
          Planning 策略拆解
        </span>
      </div>
    </div>

    <!-- 节点链路行 -->
    <div class="py-3 overflow-x-auto">
      <div class="flex items-center gap-2 min-w-max">
        <template v-for="(node, idx) in dag.nodes" :key="node.id">
          <!-- 节点卡片 -->
          <button
            class="group relative flex flex-col items-start p-2.5 rounded-lg border text-left transition-all max-w-[180px]"
            :class="[
              activeNode?.id === node.id
                ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400'
                : 'bg-white dark:bg-apple-gray-800/90 border-purple-200/80 dark:border-purple-800/60 hover:border-purple-400 hover:shadow-sm'
            ]"
            @click="activeNode = (activeNode?.id === node.id ? null : node)"
          >
            <div class="flex items-center justify-between w-full gap-1 mb-1">
              <span
                class="text-[10px] font-bold truncate px-1.5 py-0.2 rounded"
                :class="activeNode?.id === node.id ? 'bg-white/20 text-white' : 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'"
              >
                {{ node.domain || `Task #${idx + 1}` }}
              </span>

              <span v-if="node.tokenUsage" class="text-[9px]" :class="activeNode?.id === node.id ? 'text-white/80' : 'text-apple-gray-400'">
                {{ node.tokenUsage }}t
              </span>
            </div>

            <p
              class="text-xs font-semibold truncate w-full"
              :class="activeNode?.id === node.id ? 'text-white' : 'text-apple-gray-800 dark:text-apple-gray-100'"
              :title="node.label || node.content"
            >
              {{ node.label }}
            </p>

            <p
              v-if="node.content"
              class="text-[10px] truncate w-full mt-0.5 opacity-80"
              :class="activeNode?.id === node.id ? 'text-white/90' : 'text-apple-gray-500 dark:text-apple-gray-400'"
              :title="node.content"
            >
              {{ node.content }}
            </p>

            <div v-if="node.elapsedMs" class="flex items-center gap-1 mt-1 text-[9px]" :class="activeNode?.id === node.id ? 'text-white/70' : 'text-apple-gray-400'">
              <Clock :size="10" />
              <span>{{ node.elapsedMs }}ms</span>
            </div>
          </button>

          <!-- 连接箭头 -->
          <div v-if="idx < dag.nodes.length - 1" class="flex items-center text-purple-300 dark:text-purple-700">
            <ArrowRight :size="14" />
          </div>
        </template>
      </div>
    </div>

    <!-- 点击节点的具体输入输出与 Token 详情展示区 -->
    <div v-if="activeNode" class="mt-2 p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-white/90 dark:bg-apple-gray-900/90 text-xs space-y-2">
      <div class="flex items-center justify-between font-bold text-purple-900 dark:text-purple-200 border-b pb-1">
        <span>节点详情: {{ activeNode.label }}</span>
        <div class="flex items-center gap-3 text-[11px] font-normal text-apple-gray-500">
          <span v-if="activeNode.elapsedMs" class="flex items-center gap-1"><Clock :size="11" /> {{ activeNode.elapsedMs }}ms</span>
          <span v-if="activeNode.tokenUsage" class="flex items-center gap-1"><Zap :size="11" /> {{ activeNode.tokenUsage }} tokens</span>
        </div>
      </div>

      <div v-if="activeNode.input" class="p-2 rounded bg-purple-50/50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
        <span class="font-semibold text-purple-800 dark:text-purple-300">子任务指令 (Input):</span>
        <pre class="mt-0.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap max-h-24 overflow-y-auto">{{ formatJson(activeNode.input) }}</pre>
      </div>

      <div v-if="activeNode.output" class="p-2 rounded bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
        <span class="font-semibold text-emerald-800 dark:text-emerald-300">子任务产出 (Output):</span>
        <pre class="mt-0.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap max-h-36 overflow-y-auto">{{ formatJson(activeNode.output) }}</pre>
      </div>
    </div>
  </div>
</template>