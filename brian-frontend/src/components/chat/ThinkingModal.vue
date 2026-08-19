<script setup lang="ts">
import { computed } from 'vue'
import { X, Brain, Loader2 } from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import ThinkingBlockView from '@/components/blocks/ThinkingBlock.vue'
import PlanningBreakdown from './PlanningBreakdown.vue'
import type { ThinkingBlock, PlanningData } from '@/api/types'

const sessionStore = useSessionStore()

const visible = computed(() => sessionStore.thinkingModalVisible)
const targetMsgId = computed(() => sessionStore.thinkingTargetMsgId)

// 指定消息（思考过程按钮）→ 展示后端接口采集的思考块；未指定（流式期间自动弹出）→ 展示当前流式思考块
const thinkingBlocks = computed<ThinkingBlock[]>(() => {
  if (targetMsgId.value) {
    return sessionStore.thinkingBlocks as ThinkingBlock[]
  }
  return sessionStore.blocks.filter(
    (b): b is ThinkingBlock => b.type === 'ThinkingChain' && b.meta.status === 'streaming',
  )
})

// Planning 策略拆解：指定消息 → 接口采集的 Task/Agent DAG；流式期间 → 实时拆解数据
const planningData = computed<PlanningData | null>(() => {
  if (targetMsgId.value) {
    const dag = sessionStore.thinkingDag
    if (!dag || (!dag.nodes.length && !dag.taskDag)) return null
    return {
      planId: dag.planId,
      taskDag: dag.taskDag,
      agentDag: { planId: dag.planId, totalCount: dag.totalCount, nodes: dag.nodes, edges: dag.edges },
      status: 'done',
    }
  }
  const p = sessionStore.planning
  if (!p.taskDag && !p.agentDag && !(p.executionSteps && p.executionSteps.length > 0)) return null
  return p
})

const isStreaming = computed(() => thinkingBlocks.value.some((b) => b.meta.status === 'streaming'))

function close() {
  sessionStore.closeThinkingModal()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <Brain :size="16" class="text-purple-600 dark:text-purple-400" />
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">思考过程</h3>
            <Loader2 v-if="isStreaming" :size="13" class="animate-spin text-purple-500" />
          </div>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 flex-1 overflow-y-auto space-y-2">
          <!-- Planning 策略拆解（Task DAG / Agent DAG / 编排执行步骤） -->
          <PlanningBreakdown v-if="planningData" :planning="planningData" />

          <template v-if="thinkingBlocks.length > 0">
            <ThinkingBlockView v-for="block in thinkingBlocks" :key="block.id" :block="block" />
          </template>
          <div v-else-if="!planningData" class="flex flex-col items-center justify-center py-12 text-apple-gray-400 text-sm">
            <Brain :size="32" class="mb-3 text-apple-gray-300" />
            <p>暂无思考过程</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
