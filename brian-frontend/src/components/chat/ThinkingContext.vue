<!--
上下文 (Context) 展示区："思考过程"弹窗的第 1 部分
完整展示本次问答使用的上下文信息，包含：
1. 引用的消息：根据消息采集方式（显式引用/时间线/钉住/语义相似/标签相关/关键词/随机采样/手动勾选）进行分类并统计数量
2. 用户画像与偏好 (Profile)
3. 保存的各分类上下文 ID 列表
4. 最近工作与相关知识/背景
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
  ListOrdered,
  CheckSquare
} from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{
  blocks: ThinkingBlock[]
}>()

interface ContextView {
  userProfile?: Record<string, unknown>
  recentWorks?: unknown[]
  selectedMessages?: unknown[]
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
    if ((!out.selectedMessages || out.selectedMessages.length === 0) && ctx.selectedMessages && ctx.selectedMessages.length > 0) {
      out.selectedMessages = ctx.selectedMessages
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

// ===== 各采集方式消息列表与数量统计 =====
const selectedCount = computed(() => agg.value.selectedMessages?.length || agg.value.categoryIds?.selected?.length || 0)
const citingCount = computed(() => agg.value.citingMessages?.length || agg.value.categoryIds?.citing?.length || 0)
const timelineCount = computed(() => agg.value.timelineMessages?.length || agg.value.categoryIds?.timeline?.length || 0)
const pinnedCount = computed(() => agg.value.pinnedMessages?.length || agg.value.categoryIds?.pinned?.length || 0)
const similarityCount = computed(() => agg.value.similarityMessages?.length || agg.value.categoryIds?.similarity?.length || 0)
const tagRelativeCount = computed(() => agg.value.tagRelativeMessages?.length || agg.value.categoryIds?.tag_relative?.length || 0)
const keywordCount = computed(() => agg.value.keywordMessages?.length || agg.value.categoryIds?.keyword?.length || 0)
const randomCount = computed(() => agg.value.randomMessages?.length || agg.value.categoryIds?.random?.length || 0)

const totalCitedMessagesCount = computed(() => {
  return selectedCount.value + citingCount.value + timelineCount.value + pinnedCount.value +
    similarityCount.value + tagRelativeCount.value + keywordCount.value + randomCount.value
})

const collectionCategoryStats = computed(() => [
  { key: 'citing', name: '显式引用的消息', sourceKey: 'CITING', count: citingCount.value, icon: MessagesSquare, badgeCls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200', bgCls: 'bg-blue-50/50 dark:bg-blue-950/30', borderCls: 'border-blue-100/50 dark:border-blue-900/30', textCls: 'text-blue-800 dark:text-blue-300', msgs: agg.value.citingMessages || [] },
  { key: 'timeline', name: '基于时间线的消息', sourceKey: 'TIMELINE', count: timelineCount.value, icon: Clock, badgeCls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200', bgCls: 'bg-purple-50/40 dark:bg-purple-900/20', borderCls: 'border-purple-100/40 dark:border-purple-900/30', textCls: 'text-purple-800 dark:text-purple-300', msgs: agg.value.timelineMessages || [] },
  { key: 'pinned', name: '钉住关注的消息', sourceKey: 'PINNED', count: pinnedCount.value, icon: Pin, badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200', bgCls: 'bg-amber-50/40 dark:bg-amber-950/20', borderCls: 'border-amber-200/40', textCls: 'text-amber-800 dark:text-amber-300', msgs: agg.value.pinnedMessages || [] },
  { key: 'similarity', name: '语义相似消息', sourceKey: 'SIMILARITY', count: similarityCount.value, icon: Sparkles, badgeCls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200', bgCls: 'bg-indigo-50/40 dark:bg-indigo-950/20', borderCls: 'border-indigo-200/40', textCls: 'text-indigo-800 dark:text-indigo-300', msgs: agg.value.similarityMessages || [] },
  { key: 'tagRelative', name: '标签相关性消息', sourceKey: 'TAG_RELATIVE', count: tagRelativeCount.value, icon: Tag, badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200', bgCls: 'bg-emerald-50/40 dark:bg-emerald-950/20', borderCls: 'border-emerald-200/40', textCls: 'text-emerald-800 dark:text-emerald-300', msgs: agg.value.tagRelativeMessages || [] },
  { key: 'keyword', name: '关键词匹配消息', sourceKey: 'KEYWORD', count: keywordCount.value, icon: Key, badgeCls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200', bgCls: 'bg-cyan-50/40 dark:bg-cyan-950/20', borderCls: 'border-cyan-200/40', textCls: 'text-cyan-800 dark:text-cyan-300', msgs: agg.value.keywordMessages || [] },
  { key: 'random', name: '随机采样消息', sourceKey: 'RANDOM', count: randomCount.value, icon: Shuffle, badgeCls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200', bgCls: 'bg-teal-50/40 dark:bg-teal-950/20', borderCls: 'border-teal-200/40', textCls: 'text-teal-800 dark:text-teal-300', msgs: agg.value.randomMessages || [] },
  { key: 'selected', name: '手动勾选消息', sourceKey: 'SELECTED', count: selectedCount.value, icon: CheckSquare, badgeCls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200', bgCls: 'bg-blue-50/40 dark:bg-blue-950/20', borderCls: 'border-blue-200/40', textCls: 'text-blue-800 dark:text-blue-300', msgs: agg.value.selectedMessages || [] },
])

const hasAny = computed(() => Boolean(
  (agg.value.userProfile && Object.keys(agg.value.userProfile).length > 0) ||
  totalCitedMessagesCount.value > 0 ||
  agg.value.categoryIds ||
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

      <!-- 2. 引用的消息（根据消息采集方式进行分类，并统计数量） -->
      <div class="p-2.5 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-200/80 dark:border-purple-800/60 space-y-2">
        <div class="flex items-center justify-between font-bold text-purple-900 dark:text-purple-200 text-[11px] pb-1 border-b border-purple-100 dark:border-purple-900/30">
          <div class="flex items-center gap-1.5">
            <MessagesSquare :size="13" class="text-purple-600 dark:text-purple-400" />
            <span>引用的消息与上下文背景 (Context Messages)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-medium">
            引用与关联消息总计: {{ totalCitedMessagesCount }} 条
          </span>
        </div>

        <!-- 采集方式分类与数量统计网格 (Category Statistics Grid) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
          <div
            v-for="stat in collectionCategoryStats"
            :key="stat.key"
            class="flex items-center justify-between p-1.5 rounded border transition-colors"
            :class="[stat.count > 0 ? stat.bgCls + ' ' + stat.borderCls : 'bg-apple-gray-50/50 dark:bg-apple-gray-800/30 border-apple-gray-100 dark:border-apple-gray-800 opacity-60']"
          >
            <div class="flex items-center gap-1 truncate">
              <component :is="stat.icon" :size="11" class="flex-shrink-0" />
              <span class="truncate font-medium">{{ stat.name.split('消息')[0] }}</span>
            </div>
            <span class="px-1.5 py-0.2 rounded font-mono font-bold flex-shrink-0" :class="stat.badgeCls">
              {{ stat.count }} 条
            </span>
          </div>
        </div>

        <!-- 按采集方式分类展开详细消息 -->
        <div v-if="totalCitedMessagesCount > 0" class="space-y-2 pt-1">
          <template v-for="stat in collectionCategoryStats" :key="'list-' + stat.key">
            <div v-if="stat.msgs.length > 0" class="p-2 rounded-lg border space-y-1" :class="[stat.bgCls, stat.borderCls]">
              <div class="flex items-center justify-between font-semibold text-[11px]" :class="stat.textCls">
                <div class="flex items-center gap-1.5">
                  <component :is="stat.icon" :size="12" />
                  <span>{{ stat.name }} ({{ stat.sourceKey }})</span>
                </div>
                <span class="text-[10px] font-normal opacity-80">{{ stat.msgs.length }} 条消息</span>
              </div>
              <ul class="space-y-1 mt-1">
                <li v-for="(msg, mIdx) in stat.msgs" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-white/70 dark:bg-apple-gray-900/70 p-1.5 rounded border border-apple-gray-100 dark:border-apple-gray-800">
                  • {{ formatJson(msg) }}
                </li>
              </ul>
            </div>
          </template>
        </div>
        <div v-else class="text-[10px] text-apple-gray-400 italic p-1">会话内未采集到任何关联或引用的消息</div>
      </div>

      <!-- 3. 保存的分类上下文 ID 列表 -->
      <div v-if="agg.categoryIds" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-purple-200/80 dark:border-purple-800/60 space-y-1">
        <div class="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-200 text-[11px]">
          <ListOrdered :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>本次问答分类保存的上下文 ID 列表 (Category Message IDs)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 text-[10px]">
          <div v-if="agg.categoryIds.timeline?.length" class="p-1.5 rounded bg-purple-50/60 dark:bg-purple-950/30">
            <span class="font-medium text-purple-800 dark:text-purple-300">🕒 时间线消息 IDs ({{ agg.categoryIds.timeline.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.timeline.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.citing?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">📌 引用消息 IDs ({{ agg.categoryIds.citing.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.citing.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.pinned?.length" class="p-1.5 rounded bg-amber-50/60 dark:bg-amber-950/30">
            <span class="font-medium text-amber-800 dark:text-amber-300">📌 钉住消息 IDs ({{ agg.categoryIds.pinned.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.pinned.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.similarity?.length" class="p-1.5 rounded bg-indigo-50/60 dark:bg-indigo-950/30">
            <span class="font-medium text-indigo-800 dark:text-indigo-300">🔍 语义相似 IDs ({{ agg.categoryIds.similarity.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.similarity.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.tag_relative?.length" class="p-1.5 rounded bg-emerald-50/60 dark:bg-emerald-950/30">
            <span class="font-medium text-emerald-800 dark:text-emerald-300">🏷️ 标签相关性 IDs ({{ agg.categoryIds.tag_relative.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.tag_relative.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.keyword?.length" class="p-1.5 rounded bg-cyan-50/60 dark:bg-cyan-950/30">
            <span class="font-medium text-cyan-800 dark:text-cyan-300">🔑 关键词相关 IDs ({{ agg.categoryIds.keyword.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.keyword.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.random?.length" class="p-1.5 rounded bg-teal-50/60 dark:bg-teal-950/30">
            <span class="font-medium text-teal-800 dark:text-teal-300">🎲 随机采样 IDs ({{ agg.categoryIds.random.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.random.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.selected?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">☑️ 手动勾选 IDs ({{ agg.categoryIds.selected.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.selected.join(', ') }}</div>
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
