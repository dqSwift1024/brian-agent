<!--
上下文 (Context) 展示区："思考过程"弹窗的第 1 部分
聚合展示本轮工作使用的全部上下文信息（用户画像 / 引用历史消息 / 最近工作 / 记忆知识 / 编排策略）
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Database, UserRound, MessagesSquare, History, BrainCircuit, ShieldCheck } from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{
  blocks: ThinkingBlock[]
}>()

interface ContextView {
  userProfile?: Record<string, unknown>
  citingMessages?: unknown[]
  recentWorks?: unknown[]
  customContext?: string
  strategy?: string
}

const agg = computed<ContextView>(() => {
  const out: ContextView = {}
  for (const b of props.blocks) {
    const ctx = b.context
    if (!ctx) continue
    if (!out.userProfile && ctx.userProfile && Object.keys(ctx.userProfile).length > 0) {
      out.userProfile = ctx.userProfile
    }
    if ((!out.citingMessages || out.citingMessages.length === 0) && ctx.citingMessages && ctx.citingMessages.length > 0) {
      out.citingMessages = ctx.citingMessages
    }
    if ((!out.recentWorks || out.recentWorks.length === 0) && ctx.recentWorks && ctx.recentWorks.length > 0) {
      out.recentWorks = ctx.recentWorks
    }
    if (!out.customContext && ctx.customContext) out.customContext = ctx.customContext
    if (!out.strategy && ctx.strategy) out.strategy = ctx.strategy
  }
  return out
})

const hasAny = computed(() => Boolean(
  (agg.value.userProfile && Object.keys(agg.value.userProfile).length > 0) ||
  (agg.value.citingMessages && agg.value.citingMessages.length > 0) ||
  (agg.value.recentWorks && agg.value.recentWorks.length > 0) ||
  agg.value.customContext ||
  agg.value.strategy,
))

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
  <div v-if="hasAny" class="my-2.5 p-3 rounded-xl border border-purple-200/90 dark:border-purple-800/80 bg-gradient-to-br from-purple-50/70 to-blue-50/40 dark:from-purple-950/40 dark:to-blue-950/20 shadow-sm select-text">
    <div class="flex items-center justify-between pb-2 border-b border-purple-100 dark:border-purple-900/40 mb-2">
      <div class="flex items-center gap-2">
        <Database :size="15" class="text-purple-600 dark:text-purple-400" />
        <span class="text-xs font-bold text-purple-900 dark:text-purple-200">运行与对话上下文环境 (Context)</span>
      </div>
      <span v-if="agg.strategy" class="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
        策略: {{ agg.strategy }}
      </span>
    </div>

    <div class="space-y-2 text-xs">
      <!-- 用户画像 -->
      <div v-if="agg.userProfile" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-300 text-[11px] mb-1">
          <UserRound :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>用户画像与交互偏好 (Profile)</span>
        </div>
        <pre class="text-[10px] text-apple-gray-700 dark:text-apple-gray-300 overflow-x-auto">{{ formatJson(agg.userProfile) }}</pre>
      </div>

      <!-- 引用的历史上下文消息 -->
      <div v-if="agg.citingMessages" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-300 text-[11px] mb-1">
          <MessagesSquare :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>引用的历史上下文消息</span>
          <span class="ml-auto text-[10px] text-apple-gray-400 font-normal">{{ agg.citingMessages.length }} 条关联</span>
        </div>
        <ul class="space-y-1">
          <li v-for="(msg, mIdx) in agg.citingMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-purple-50/40 dark:bg-purple-900/20 p-1.5 rounded">
            • {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 最近工作 -->
      <div v-if="agg.recentWorks" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-300 text-[11px] mb-1">
          <History :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>最近工作 (Recent Works)</span>
        </div>
        <ul class="space-y-1">
          <li v-for="(w, wIdx) in agg.recentWorks" :key="wIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-purple-50/40 dark:bg-purple-900/20 p-1.5 rounded">
            • {{ formatJson(w) }}
          </li>
        </ul>
      </div>

      <!-- 相关知识 / 记忆背景 -->
      <div v-if="agg.customContext" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-300 text-[11px] mb-1">
          <BrainCircuit :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>相关知识 / 记忆背景</span>
        </div>
        <p class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 whitespace-pre-wrap">{{ agg.customContext }}</p>
      </div>

      <!-- 编排策略 -->
      <div v-if="agg.strategy" class="flex items-center gap-1.5 p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <ShieldCheck :size="12" class="text-purple-600 dark:text-purple-400" />
        <span class="font-semibold text-purple-800 dark:text-purple-300 text-[11px]">编排策略:</span>
        <span class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300">{{ agg.strategy }}</span>
      </div>
    </div>
  </div>
</template>
