<script setup lang="ts">
import { ref, computed } from 'vue'
import { Pin, PinOff, ChevronDown, CornerUpRight, AlertCircle, Copy, Check } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    id: string
    infoId?: string
    role?: string
    content: string
    summary?: string
    timestamp: number
    pin?: boolean
    selected?: boolean
    citedCount?: number
    citingCount?: number
    citedInfoIds?: string[]
    citingInfoIds?: string[]
    traceId?: string
    workId?: string
    mode?: 'map' | 'timeline'
    active?: boolean
    nodeMap?: Map<string, { summary?: string; info?: string }>
  }>(),
  {
    infoId: '',
    role: 'assistant',
    summary: '',
    pin: false,
    selected: false,
    citedCount: 0,
    citingCount: 0,
    citedInfoIds: () => [],
    citingInfoIds: () => [],
    traceId: '',
    workId: '',
    mode: 'timeline',
    active: false,
    nodeMap: undefined,
  },
)

const emit = defineEmits<{
  (e: 'toggleSelect', id: string): void
  (e: 'togglePin', id: string): void
  (e: 'clickCard', id: string): void
  (e: 'jumpTo', id: string): void
}>()

const expandedCiting = ref(false)
const expandedCited = ref(false)
const copied = ref(false)

const targetId = computed(() => props.infoId || props.id)

const isUser = computed(() => props.role === 'user' || props.role === 'USER' || props.role === 'REQUEST')
const isError = computed(() => props.content.startsWith('[错误]') || props.summary.startsWith('[错误]'))

const effectiveTraceId = computed(() => props.traceId || props.workId || '')

const textLength = computed(() => props.content ? props.content.length : 0)

const effectiveCitedCount = computed(() => {
  if (props.citedCount && props.citedCount > 0) return props.citedCount
  return props.citedInfoIds?.length ?? 0
})

const effectiveCitingCount = computed(() => {
  return props.citingCount ?? props.citingInfoIds?.length ?? 0
})

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  if (props.mode === 'map') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getSummary(cid: string): string {
  if (props.nodeMap?.has(cid)) {
    const n = props.nodeMap.get(cid)
    if (n?.summary) return n.summary
    if (n?.info) return n.info.slice(0, 24)
  }
  return cid.slice(0, 8)
}

function handleSelect() {
  emit('toggleSelect', targetId.value)
}

function handlePin() {
  emit('togglePin', targetId.value)
}

function handleCardClick() {
  emit('clickCard', targetId.value)
}

function handleJump(cid: string) {
  expandedCiting.value = false
  expandedCited.value = false
  emit('jumpTo', cid)
}

async function copyTraceId() {
  const tid = effectiveTraceId.value
  if (!tid) return
  try {
    await navigator.clipboard.writeText(tid)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* ignore */ }
}
</script>

<template>
  <div
    class="message-card transition-all duration-200 cursor-pointer select-text"
    :class="[
      mode === 'map' ? 'rounded-lg border bg-white/95 dark:bg-apple-gray-800/95 shadow-sm text-xs' : 'rounded-2xl px-3 py-2.5',
      mode === 'map'
        ? (isError
            ? 'border-error-red/50 bg-red-50/50 dark:bg-red-950/30'
            : (isUser ? 'border-brian-blue/40' : 'border-apple-gray-200 dark:border-apple-gray-700'))
        : (isUser
            ? 'bg-brian-blue text-white'
            : (isError ? 'block-card border-error-red/40 bg-error-red/5 text-error-red' : 'block-card')),
      active ? 'ring-2 ring-brian-blue shadow-lg border-brian-blue' : (mode === 'map' ? 'hover:border-brian-blue/60' : '')
    ]"
    @click="handleCardClick"
  >
    <!-- 顶部栏：时间居左，错误标识 + 复选框 + 钉住按钮居右 -->
    <div
      class="flex items-center justify-between mb-1 text-[10px]"
      :class="mode === 'map' ? 'px-2 pt-1.5' : ''"
    >
      <span :class="isUser && mode === 'timeline' ? 'text-white/70' : 'text-apple-gray-400'">
        {{ formatTime(timestamp) }}
      </span>

      <div class="flex items-center gap-1.5">
        <AlertCircle v-if="isError" :size="12" class="text-error-red flex-shrink-0" title="执行出错" />

        <label class="flex items-center cursor-pointer" title="勾选以指定本次问答上下文" @click.stop>
          <input
            type="checkbox"
            class="rounded cursor-pointer h-3.5 w-3.5"
            :class="isUser && mode === 'timeline' ? 'accent-white' : 'accent-brian-blue'"
            :checked="selected"
            @change="handleSelect"
          />
        </label>

        <button
          class="p-0.5 rounded transition-colors"
          :class="pin ? 'text-warning-orange' : (isUser && mode === 'timeline' ? 'text-white/70 hover:text-white' : 'text-apple-gray-400 hover:text-brian-blue')"
          :title="pin ? '取消钉住' : '钉住'"
          @click.stop="handlePin"
        >
          <component :is="pin ? Pin : PinOff" :size="12" />
        </button>
      </div>
    </div>

    <!-- 内容展示：Map 模式展示摘要+原文折叠，Timeline 模式展示全文 -->
    <div v-if="mode === 'map'" class="space-y-0.5">
      <div
        class="px-2 py-0.5 truncate font-medium"
        :class="isError ? 'text-error-red' : 'text-apple-gray-700 dark:text-apple-gray-200'"
        :title="summary || content"
      >
        {{ summary || content || '(无内容)' }}
      </div>

      <details class="px-2 pb-0.5 text-apple-gray-500 dark:text-apple-gray-400" @click.stop>
        <summary class="cursor-pointer text-[10px]">原文</summary>
        <p class="whitespace-pre-wrap break-all text-[11px] max-h-20 overflow-y-auto">{{ content }}</p>
      </details>
    </div>

    <div v-else class="my-1">
      <p class="text-sm whitespace-pre-wrap break-words">{{ content }}</p>
    </div>

    <!-- 底部栏：引用/被引用胶囊、复制TraceId与字数统计 -->
    <div
      class="flex items-center gap-1.5 mt-1.5 flex-wrap"
      :class="mode === 'map' ? 'px-2 pb-1.5' : ''"
    >
      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors"
        :class="isUser && mode === 'timeline' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20'"
        @click.stop="expandedCited = !expandedCited; if (expandedCited) expandedCiting = false"
      >
        引用 {{ effectiveCitedCount }}
        <ChevronDown :size="10" :class="expandedCited ? 'rotate-180' : ''" />
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors"
        :class="isUser && mode === 'timeline' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 hover:bg-apple-gray-200'"
        @click.stop="expandedCiting = !expandedCiting; if (expandedCiting) expandedCited = false"
      >
        被引用 {{ effectiveCitingCount }}
        <ChevronDown :size="10" :class="expandedCiting ? 'rotate-180' : ''" />
      </button>

      <button
        v-if="effectiveTraceId"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
        :class="isUser && mode === 'timeline' ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'"
        :title="`复制 TraceId: ${effectiveTraceId}`"
        @click.stop="copyTraceId"
      >
        <component :is="copied ? Check : Copy" :size="10" />
        {{ copied ? '已复制' : '复制 TraceId' }}
      </button>

      <span class="ml-auto text-[10px]" :class="isUser && mode === 'timeline' ? 'text-white/60' : 'text-apple-gray-300'">
        {{ textLength }}字
      </span>
    </div>

    <!-- 展开：引用列表 -->
    <div
      v-if="expandedCited"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-apple-gray-100 dark:border-apple-gray-700' : 'border-current/10',
      ]"
      @click.stop
    >
      <p class="text-[10px] font-medium" :class="isUser && mode === 'timeline' ? 'text-white/80' : 'text-apple-gray-400'">引用以下消息：</p>
      <button
        v-for="cid in citedInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-[11px] truncate py-0.5 rounded px-1"
        :class="isUser && mode === 'timeline' ? 'hover:bg-white/10 text-white' : 'hover:bg-brian-blue/5 text-brian-blue'"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citedInfoIds?.length" class="text-[10px] opacity-60">无引用消息</p>
    </div>

    <!-- 展开：被引用列表 -->
    <div
      v-if="expandedCiting"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-apple-gray-100 dark:border-apple-gray-700' : 'border-current/10',
      ]"
      @click.stop
    >
      <p class="text-[10px] font-medium" :class="isUser && mode === 'timeline' ? 'text-white/80' : 'text-apple-gray-400'">被以下消息引用：</p>
      <button
        v-for="cid in citingInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-[11px] truncate py-0.5 rounded px-1"
        :class="isUser && mode === 'timeline' ? 'hover:bg-white/10 text-white' : 'hover:bg-brian-blue/5 text-brian-blue'"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citingInfoIds?.length" class="text-[10px] opacity-60">无被引用记录</p>
    </div>

    <!-- Timeline 模式下的引用消息胶囊快捷展示 -->
    <div v-if="mode === 'timeline' && citedInfoIds?.length" class="mt-1.5 flex flex-wrap gap-1" @click.stop>
      <span
        v-for="cid in citedInfoIds"
        :key="cid"
        class="px-2 py-0.5 text-[10px] rounded-full cursor-pointer transition-colors"
        :class="isUser ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20'"
        title="点击在对话列表中定位被引用的消息"
        @click.stop="handleJump(cid)"
      >
        引用: {{ getSummary(cid) }}
      </span>
    </div>
  </div>
</template>
