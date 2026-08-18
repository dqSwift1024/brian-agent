<!--
===== 原始 ThinkingBlock.vue 代码（保留作为参考） =====
<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, Loader2 } from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{ block: ThinkingBlock }>()
const isExpanded = ref(false)

const isStreaming = computed(() => props.block.meta.status === 'streaming')
</script>

<template>
  <div class="py-1">
    <div class="block-card border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
      <button
        class="w-full flex items-center justify-between px-3 py-2 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2">
          <ChevronRight
            :size="14"
            class="text-purple-500 transition-transform"
            :class="{ 'rotate-90': isExpanded }"
          />
          <span class="text-xs font-medium text-purple-600 dark:text-purple-400">
            {{ block.agentInfo?.name || 'Agent' }} · {{ isStreaming ? '思考中' : '思考过程' }}
          </span>
          <Loader2 v-if="isStreaming" :size="12" class="animate-spin text-purple-400" />
        </div>
        <span class="text-xs text-apple-gray-400">{{ block.durationMs ? `${block.durationMs}ms` : '' }}</span>
      </button>

      <div v-if="isExpanded" class="px-4 pb-3">
        <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap mt-2">
          {{ block.content || '思考中...' }}
          <span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-purple-400 animate-cursor-blink align-middle ml-0.5" />
        </p>
      </div>
    </div>
  </div>
</template>
-->

<!-- ===== 修改后的 ThinkingBlock.vue 组件：支持完整 Agent 信息、上下文、输入输出、Think/Act/Reflect 步骤 ===== -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  ChevronRight,
  Loader2,
  Cpu,
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  ArrowRight,
  Database,
  Code
} from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'
import CanvasReActFlow from '../chat/CanvasReActFlow.vue'

const props = defineProps<{ block: ThinkingBlock }>()
const isExpanded = ref(false)
const activeTab = ref<'chain' | 'context' | 'io'>('chain')

const isStreaming = computed(() => props.block.meta.status === 'streaming')

const agentTypeLabel = computed(() => {
  const type = (props.block.agentInfo?.type || 'WORKER').toUpperCase()
  switch (type) {
    case 'PLANNER': return '规划 Agent'
    case 'WRITER': return '表达 Agent'
    case 'EVOLUTOR': return '进化 Agent'
    default: return '执行 Agent'
  }
})

const hasContext = computed(() => {
  const ctx = props.block.context
  if (!ctx) return false
  return Boolean(
    (ctx.userProfile && Object.keys(ctx.userProfile).length > 0) ||
    (ctx.citingMessages && ctx.citingMessages.length > 0) ||
    (ctx.recentWorks && ctx.recentWorks.length > 0) ||
    ctx.customContext
  )
})

const hasIO = computed(() => {
  return Boolean(props.block.input || props.block.output)
})

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
  <div class="py-1 select-text">
    <div class="block-card border-purple-200/80 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl overflow-hidden shadow-sm">
      <!-- Header 标题栏 -->
      <button
        class="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-purple-100/40 dark:hover:bg-purple-900/30 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2 min-w-0">
          <ChevronRight
            :size="14"
            class="text-purple-500 flex-shrink-0 transition-transform duration-200"
            :class="{ 'rotate-90': isExpanded }"
          />
          <Brain :size="15" class="text-purple-600 dark:text-purple-400 flex-shrink-0" />
          
          <span class="text-xs font-semibold text-purple-900 dark:text-purple-200 truncate">
            {{ block.agentInfo?.name || 'Agent' }}
          </span>

          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex-shrink-0">
            {{ agentTypeLabel }}
          </span>

          <span v-if="block.agentInfo?.llmId" class="hidden sm:inline-flex items-center gap-1 text-[10px] text-apple-gray-500 dark:text-apple-gray-400">
            <Cpu :size="11" />
            {{ block.agentInfo.llmId }}
          </span>

          <span v-if="isStreaming" class="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
            <Loader2 :size="12" class="animate-spin text-purple-500" />
            <span>思考中...</span>
          </span>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 text-[11px] text-apple-gray-400">
          <span v-if="block.tokenUsage" class="hidden sm:inline">
            {{ block.tokenUsage }} tokens
          </span>
          <span v-if="block.durationMs">
            {{ block.durationMs }}ms
          </span>
        </div>
      </button>

      <!-- Expanded Detail 展开面板 -->
      <div v-if="isExpanded" class="border-t border-purple-100 dark:border-purple-900/40 bg-white/60 dark:bg-apple-gray-900/40 p-3.5 space-y-3">
        
        <!-- 1. 【最最最顶部置顶展示】Context 上下文信息环境 -->
        <div v-if="hasContext" class="p-3 rounded-lg border border-purple-200/90 dark:border-purple-800/80 bg-gradient-to-r from-purple-50/80 to-blue-50/50 dark:from-purple-950/40 dark:to-blue-950/30 text-xs space-y-2">
          <div class="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-200 border-b pb-1">
            <Database :size="13" class="text-purple-600 dark:text-purple-400" />
            <span>对话与 Agent 运行上下文环境 (Context)</span>
          </div>

          <div v-if="block.context?.userProfile" class="p-2 rounded bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
            <span class="font-semibold text-purple-800 dark:text-purple-300 text-[11px]">用户画像 Profile:</span>
            <pre class="mt-0.5 text-[10px] text-apple-gray-700 dark:text-apple-gray-300 overflow-x-auto">{{ formatJson(block.context.userProfile) }}</pre>
          </div>

          <div v-if="block.context?.citingMessages?.length" class="p-2 rounded bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
            <span class="font-semibold text-purple-800 dark:text-purple-300 text-[11px]">引用的历史上下文消息:</span>
            <ul class="mt-1 space-y-1">
              <li v-for="(msg, mIdx) in block.context.citingMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300">
                • {{ formatJson(msg) }}
              </li>
            </ul>
          </div>

          <div v-if="block.context?.customContext" class="p-2 rounded bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
            <span class="font-semibold text-purple-800 dark:text-purple-300 text-[11px]">相关知识/上下文背景:</span>
            <p class="mt-0.5 text-[11px] text-apple-gray-600 dark:text-apple-gray-300 whitespace-pre-wrap">{{ block.context.customContext }}</p>
          </div>
        </div>

        <!-- 2. Sub-Header Badges (Agent 规范: Soul, LLM, Skills) -->
        <div class="flex items-center gap-2 flex-wrap text-[11px] pb-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <div v-if="block.agentInfo?.soulId" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50">
            <Sparkles :size="11" />
            <span>Soul: {{ block.agentInfo.soulId }}</span>
          </div>

          <div v-if="block.agentInfo?.skills?.length" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50">
            <Wrench :size="11" />
            <span>技能: {{ block.agentInfo.skills.join(', ') }}</span>
          </div>

          <div v-if="block.agentInfo?.mcps?.length" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
            <Layers :size="11" />
            <span>MCP: {{ block.agentInfo.mcps.join(', ') }}</span>
          </div>
        </div>

        <!-- 3. Canvas ReAct / CoT 执行状态机流程图 -->
        <CanvasReActFlow
          :steps="block.steps || []"
          :input="block.input"
          :output="block.output"
        />

        <!-- 4. Navigation Tabs (思维链 / 输入输出) -->
        <div class="flex items-center gap-1 border-b border-apple-gray-100 dark:border-apple-gray-800 pb-1">
          <button
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'chain' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' : 'text-apple-gray-500 hover:text-purple-600'"
            @click="activeTab = 'chain'"
          >
            <Brain :size="12" />
            思考与步骤
          </button>

          <button
            v-if="hasIO"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'io' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' : 'text-apple-gray-500 hover:text-purple-600'"
            @click="activeTab = 'io'"
          >
            <Code :size="12" />
            任务输入与阶段输出
          </button>
        </div>

        <!-- Tab 1: 思考链 & 步骤 (Chain & Steps) -->
        <div v-if="activeTab === 'chain'" class="space-y-2.5 text-xs">
          <!-- 结构化步骤列表 -->
          <template v-if="block.steps && block.steps.length > 0">
            <div
              v-for="(step, idx) in block.steps"
              :key="idx"
              class="p-2.5 rounded-lg border bg-apple-gray-50/60 dark:bg-apple-gray-800/40 border-apple-gray-200/60 dark:border-apple-gray-700/60 space-y-1.5"
            >
              <div class="flex items-center justify-between font-medium">
                <div class="flex items-center gap-1.5">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    :class="[
                      step.phase === 'THINK' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300' :
                      step.phase === 'ACT' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' :
                      'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    ]"
                  >
                    {{ step.phase }}
                  </span>
                  <span class="text-apple-gray-700 dark:text-apple-gray-200">
                    Step {{ step.iteration ?? (idx + 1) }}
                  </span>
                </div>

                <span v-if="step.elapsedMs" class="text-[10px] text-apple-gray-400">
                  {{ step.elapsedMs }}ms
                </span>
              </div>

              <!-- THINK Phase Content -->
              <div v-if="step.phase === 'THINK' && step.content" class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap pl-1 border-l-2 border-purple-300 dark:border-purple-700">
                {{ step.content }}
              </div>

              <!-- ACT Phase Tools -->
              <div v-if="step.phase === 'ACT'" class="space-y-1.5">
                <div v-for="(tc, tIdx) in step.toolCalls" :key="tIdx" class="p-2 rounded bg-white dark:bg-apple-gray-900 border border-apple-gray-200/50 dark:border-apple-gray-700/50 space-y-1">
                  <div class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                    <Wrench :size="12" />
                    <span>工具调用: {{ tc.toolName || tc.toolType || 'Tool' }}</span>
                  </div>
                  <details v-if="tc.params && Object.keys(tc.params).length > 0" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">输入参数 (Params)</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px]">{{ formatJson(tc.params) }}</pre>
                  </details>
                  <details v-if="tc.result" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">返回结果 (Result)</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px] max-h-36 overflow-y-auto">{{ formatJson(tc.result) }}</pre>
                  </details>
                </div>
              </div>

              <!-- REFLECT Phase -->
              <div v-if="step.phase === 'REFLECT'" class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <component :is="step.passed ? CheckCircle2 : XCircle" :size="13" :class="step.passed ? 'text-emerald-500' : 'text-amber-500'" />
                  <span class="font-medium" :class="step.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                    {{ step.passed ? '自我反思通过' : '需求进一步优化' }}
                  </span>
                </div>
                <p v-if="step.reflection" class="text-apple-gray-600 dark:text-apple-gray-300 text-[11px]">
                  {{ step.reflection }}
                </p>
              </div>
            </div>
          </template>

          <!-- 备用降级文本展示 -->
          <div v-else class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap leading-relaxed">
            {{ block.content || '思考中...' }}
            <span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-purple-500 animate-cursor-blink align-middle ml-0.5" />
          </div>
        </div>

        <!-- Tab 2: 输入与输出 (IO) -->
        <div v-if="activeTab === 'io'" class="space-y-2.5 text-xs">
          <div v-if="block.input" class="p-2.5 rounded-lg border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20">
            <div class="flex items-center gap-1 text-blue-700 dark:text-blue-300 font-semibold mb-1">
              <ArrowRight :size="12" />
              <span>Agent 任务输入 (Input)</span>
            </div>
            <pre class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap overflow-x-auto">{{ formatJson(block.input) }}</pre>
          </div>

          <div v-if="block.output" class="p-2.5 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20">
            <div class="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
              <Sparkles :size="12" />
              <span>Agent 节点输出 (Output)</span>
            </div>
            <pre class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap overflow-x-auto">{{ formatJson(block.output) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
