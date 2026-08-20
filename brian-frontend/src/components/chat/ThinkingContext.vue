<!--
上下文 (Context) 展示区："思考过程"弹窗的第 1 部分
完整展示本次问答使用的上下文信息，包含：
1. 会话内：基于时间线的信息 或 引用的消息（二选一）
2. 会话内：钉住的消息
3. 全系统：语义相似消息
4. 全系统：标签相关性消息
5. 全系统：关键词相关消息
6. 会话内：随机消息（受配置中心百分比上限约束）
7. 按消息选择方式分类保存的上下文 ID 列表
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  Database,
  UserRound,
  MessagesSquare,
  History,
  BrainCircuit,
  ShieldCheck,
  Pin,
  Clock,
  Sparkles,
  Tag,
  Key,
  Shuffle,
  ListOrdered
} from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{
  blocks: ThinkingBlock[]
}>()

interface ContextView {
  userProfile?: Record<string, unknown>
  recentWorks?: unknown[]
  citingMessages?: unknown[]
  timelineMessages?: unknown[]
  pinnedMessages?: unknown[]
  similarityMessages?: unknown[]
  tagRelativeMessages?: unknown[]
  keywordMessages?: unknown[]
  randomMessages?: unknown[]
  randomMaxPercent?: number
  categoryIds?: {
    selected?: string[]
    pinned?: string[]
    timeline?: string[]
    citing?: string[]
    tag_relative?: string[]
    similarity?: string[]
    keyword?: string[]
    random?: string[]
  }
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
    if ((!out.timelineMessages || out.timelineMessages.length === 0) && ctx.timelineMessages && ctx.timelineMessages.length > 0) {
      out.timelineMessages = ctx.timelineMessages
    }
    if ((!out.pinnedMessages || out.pinnedMessages.length === 0) && ctx.pinnedMessages && ctx.pinnedMessages.length > 0) {
      out.pinnedMessages = ctx.pinnedMessages
    }
    if ((!out.similarityMessages || out.similarityMessages.length === 0) && ctx.similarityMessages && ctx.similarityMessages.length > 0) {
      out.similarityMessages = ctx.similarityMessages
    }
    if ((!out.tagRelativeMessages || out.tagRelativeMessages.length === 0) && ctx.tagRelativeMessages && ctx.tagRelativeMessages.length > 0) {
      out.tagRelativeMessages = ctx.tagRelativeMessages
    }
    if ((!out.keywordMessages || out.keywordMessages.length === 0) && ctx.keywordMessages && ctx.keywordMessages.length > 0) {
      out.keywordMessages = ctx.keywordMessages
    }
    if ((!out.randomMessages || out.randomMessages.length === 0) && ctx.randomMessages && ctx.randomMessages.length > 0) {
      out.randomMessages = ctx.randomMessages
    }
    if (ctx.randomMaxPercent !== undefined) {
      out.randomMaxPercent = ctx.randomMaxPercent
    }
    if (!out.categoryIds && ctx.categoryIds) {
      out.categoryIds = ctx.categoryIds
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
  (agg.value.timelineMessages && agg.value.timelineMessages.length > 0) ||
  (agg.value.pinnedMessages && agg.value.pinnedMessages.length > 0) ||
  (agg.value.similarityMessages && agg.value.similarityMessages.length > 0) ||
  (agg.value.tagRelativeMessages && agg.value.tagRelativeMessages.length > 0) ||
  (agg.value.keywordMessages && agg.value.keywordMessages.length > 0) ||
  (agg.value.randomMessages && agg.value.randomMessages.length > 0) ||
  agg.value.categoryIds ||
  (agg.value.recentWorks && agg.value.recentWorks.length > 0) ||
  agg.value.customContext ||
  agg.value.strategy,
))

// 判断二选一的主导方式：存在显示引用的消息则为 CITING，否则为 TIMELINE
const isCitingActive = computed(() => {
  return Boolean(agg.value.citingMessages && agg.value.citingMessages.length > 0)
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
  <div v-if="hasAny" class="my-2.5 p-3 rounded-xl border border-purple-200/90 dark:border-purple-800/80 bg-gradient-to-br from-purple-50/70 to-blue-50/40 dark:from-purple-950/40 dark:to-blue-950/20 shadow-sm select-text">
    <div class="flex items-center justify-between pb-2 border-b border-purple-100 dark:border-purple-900/40 mb-2">
      <div class="flex items-center gap-2">
        <Database :size="15" class="text-purple-600 dark:text-purple-400" />
        <span class="text-xs font-bold text-purple-900 dark:text-purple-200">运行与对话上下文环境 (Context)</span>
      </div>
      <span v-if="agg.strategy" class="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-medium">
        策略: {{ agg.strategy }}
      </span>
    </div>

    <div class="space-y-2.5 text-xs">
      <!-- 1. 用户画像 -->
      <div v-if="agg.userProfile" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-300 text-[11px] mb-1">
          <UserRound :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>用户画像与交互偏好 (Profile)</span>
        </div>
        <pre class="text-[10px] text-apple-gray-700 dark:text-apple-gray-300 overflow-x-auto">{{ formatJson(agg.userProfile) }}</pre>
      </div>

      <!-- 2. 会话内：基于时间线的信息 或 引用的消息（二选一） -->
      <div class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-purple-800 dark:text-purple-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <MessagesSquare v-if="isCitingActive" :size="12" class="text-blue-600 dark:text-blue-400" />
            <Clock v-else :size="12" class="text-purple-600 dark:text-purple-400" />
            <span>{{ isCitingActive ? '引用的消息 (会话内)' : '基于时间线的信息 (会话内)' }}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              二选一: {{ isCitingActive ? '显示引用模式' : '时间线模式' }}
            </span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">
            {{ isCitingActive ? `${agg.citingMessages?.length || 0} 条引用` : `${agg.timelineMessages?.length || 0} 条时间线消息` }}
          </span>
        </div>
        <!-- 引用消息内容 -->
        <ul v-if="isCitingActive && agg.citingMessages?.length" class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.citingMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-blue-50/50 dark:bg-blue-950/30 p-1.5 rounded border border-blue-100/50 dark:border-blue-900/30">
            • {{ formatJson(msg) }}
          </li>
        </ul>
        <!-- 时间线消息内容 -->
        <ul v-else-if="!isCitingActive && agg.timelineMessages?.length" class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.timelineMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-purple-50/40 dark:bg-purple-900/20 p-1.5 rounded border border-purple-100/40 dark:border-purple-900/30">
            • {{ formatJson(msg) }}
          </li>
        </ul>
        <div v-else class="text-[10px] text-apple-gray-400 italic">会话内未关联显式历史消息</div>
      </div>

      <!-- 3. 会话内：钉住的消息 -->
      <div v-if="agg.pinnedMessages && agg.pinnedMessages.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-amber-800 dark:text-amber-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <Pin :size="12" class="text-amber-600 dark:text-amber-400" />
            <span>钉住的消息 (会话内)</span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">{{ agg.pinnedMessages.length }} 条钉住</span>
        </div>
        <ul class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.pinnedMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-amber-50/40 dark:bg-amber-950/20 p-1.5 rounded border border-amber-200/40">
            📌 {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 4. 全系统：语义相似消息 -->
      <div v-if="agg.similarityMessages && agg.similarityMessages.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-blue-800 dark:text-blue-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <Sparkles :size="12" class="text-blue-600 dark:text-blue-400" />
            <span>语义相似消息 (全系统)</span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">{{ agg.similarityMessages.length }} 条关联</span>
        </div>
        <ul class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.similarityMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-blue-50/40 dark:bg-blue-950/20 p-1.5 rounded border border-blue-200/40">
            • {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 5. 全系统：标签相关性消息 -->
      <div v-if="agg.tagRelativeMessages && agg.tagRelativeMessages.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <Tag :size="12" class="text-emerald-600 dark:text-emerald-400" />
            <span>标签相关性消息 (全系统)</span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">{{ agg.tagRelativeMessages.length }} 条关联</span>
        </div>
        <ul class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.tagRelativeMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-emerald-50/40 dark:bg-emerald-950/20 p-1.5 rounded border border-emerald-200/40">
            • {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 6. 全系统：关键词相关消息 -->
      <div v-if="agg.keywordMessages && agg.keywordMessages.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-indigo-800 dark:text-indigo-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <Key :size="12" class="text-indigo-600 dark:text-indigo-400" />
            <span>关键词相关消息 (全系统)</span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">{{ agg.keywordMessages.length }} 条关联</span>
        </div>
        <ul class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.keywordMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-indigo-50/40 dark:bg-indigo-950/20 p-1.5 rounded border border-indigo-200/40">
            • {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 7. 会话内：随机消息（受百分比上限约束） -->
      <div v-if="agg.randomMessages && agg.randomMessages.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40 space-y-1">
        <div class="flex items-center justify-between font-semibold text-teal-800 dark:text-teal-300 text-[11px]">
          <div class="flex items-center gap-1.5">
            <Shuffle :size="12" class="text-teal-600 dark:text-teal-400" />
            <span>随机消息 (会话内)</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
              配置限制上限: ≤ {{ agg.randomMaxPercent ?? 20 }}%
            </span>
          </div>
          <span class="text-[10px] text-apple-gray-400 font-normal">{{ agg.randomMessages.length }} 条采样</span>
        </div>
        <ul class="space-y-1 mt-1">
          <li v-for="(msg, mIdx) in agg.randomMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-teal-50/40 dark:bg-teal-950/20 p-1.5 rounded border border-teal-200/40">
            🎲 {{ formatJson(msg) }}
          </li>
        </ul>
      </div>

      <!-- 8. 保存的分类上下文 ID 列表（Requirement 2） -->
      <div v-if="agg.categoryIds" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-200/80 dark:border-purple-800/60 space-y-1">
        <div class="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-200 text-[11px]">
          <ListOrdered :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>本次问答分类保存的上下文 ID 列表 (Category Message IDs)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 text-[10px]">
          <div v-if="agg.categoryIds.timeline?.length" class="p-1.5 rounded bg-purple-50/60 dark:bg-purple-950/30">
            <span class="font-medium text-purple-800 dark:text-purple-300">🕒 时间线消息 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.timeline.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.citing?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">📌 引用消息 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.citing.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.pinned?.length" class="p-1.5 rounded bg-amber-50/60 dark:bg-amber-950/30">
            <span class="font-medium text-amber-800 dark:text-amber-300">📌 钉住消息 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.pinned.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.similarity?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">🔍 语义相似 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.similarity.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.tag_relative?.length" class="p-1.5 rounded bg-emerald-50/60 dark:bg-emerald-950/30">
            <span class="font-medium text-emerald-800 dark:text-emerald-300">🏷️ 标签相关性 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.tag_relative.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.keyword?.length" class="p-1.5 rounded bg-indigo-50/60 dark:bg-indigo-950/30">
            <span class="font-medium text-indigo-800 dark:text-indigo-300">🔑 关键词相关 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.keyword.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.random?.length" class="p-1.5 rounded bg-teal-50/60 dark:bg-teal-950/30">
            <span class="font-medium text-teal-800 dark:text-teal-300">🎲 随机采样 IDs:</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.random.join(', ') }}</div>
          </div>
        </div>
      </div>

      <!-- 最近工作 -->
      <div v-if="agg.recentWorks && agg.recentWorks.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
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
