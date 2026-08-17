<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  MessageCircle,
  Loader2,
  Pin,
  PinOff,
  ChevronDown,
  CornerUpRight,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import type { ChatMessage, Block, TextBlock } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'

const sessionStore = useSessionStore()

const leftWidth = computed(() => `${sessionStore.splitRatio * 100}%`)
const rightWidth = computed(() => `${(1 - sessionStore.splitRatio) * 100}%`)
const isDragging = ref(false)
const listRef = ref<HTMLDivElement | null>(null)
const expandedCiting = ref<string | null>(null)
const expandedCited = ref<string | null>(null)

const nodeMap = computed(() => {
  const m = new Map<string, { summary: string; pin: boolean; citingCount: number; citedCount: number; citingInfoIds: string[]; citedInfoIds: string[] }>()
  for (const n of sessionStore.chatMapNodes) {
    m.set(n.infoId, { summary: n.summary, pin: n.pin, citingCount: n.citingCount, citedCount: n.citedCount, citingInfoIds: n.citingInfoIds, citedInfoIds: n.citedInfoIds })
  }
  return m
})

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nodeOf(msg: ChatMessage) {
  return nodeMap.value.get(msg.id)
}

// ChatMap 点击节点 -> 滚动列表使该消息居中
watch(() => sessionStore.focusInfoId, async (id) => {
  if (!id) return
  await nextTick()
  const el = listRef.value?.querySelector(`[data-info-id="${id}"]`) as HTMLElement | null
  if (!el || !listRef.value) return
  const listRect = listRef.value.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  listRef.value.scrollTop += elRect.top - listRect.top - listRect.height / 2 + elRect.height / 2
})

function scrollListTo(id: string) {
  sessionStore.triggerFocus(id)
}

function centerMapOn(id: string) {
  sessionStore.triggerCenter(id)
}

function togglePin(id: string) {
  sessionStore.togglePin(id)
}

function jumpTo(id: string) {
  expandedCiting.value = null
  expandedCited.value = null
  scrollListTo(id)
}

type TimelineEntry =
  | { kind: 'message'; key: string; sort: number; message: ChatMessage }
  | { kind: 'block'; key: string; sort: number; block: Block }

const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  for (const m of sessionStore.messages) {
    entries.push({ kind: 'message', key: `m-${m.id}`, sort: m.timestamp, message: m })
  }
  for (const b of sessionStore.blocks) {
    entries.push({ kind: 'block', key: `b-${b.id}`, sort: b.meta.createdAt, block: b })
  }
  entries.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort
    // 同一毫秒内：用户消息排在所属回复块之前，保证一问一答顺序
    if (a.kind !== b.kind) return a.kind === 'message' ? -1 : 1
    return a.key.localeCompare(b.key)
  })
  return entries
})

function startResize(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  const onMove = (ev: MouseEvent) => {
    const container = (e.target as HTMLElement).closest('.chat-area') as HTMLElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const ratio = (ev.clientX - rect.left) / rect.width
    sessionStore.setSplitRatio(ratio)
  }
  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

async function handleSend(content: string, citingIds: string[]) {
  if (!content.trim()) return

  // ===== 原始实现（保留参考）：本地直接生成 session id，未在后端创建会话 =====
  // const sessionId = sessionStore.currentSessionId || `session-${Date.now()}`
  // if (!sessionStore.currentSessionId) {
  //   sessionStore.currentSessionId = sessionId
  //   localStorage.setItem('chat-current-session-id', sessionId)
  // }

  // ===== 修改后：先在后端创建会话，再以返回的 session_id 发起流式对话 =====
  let sessionId: string
  try {
    sessionId = await sessionStore.ensureSession()
  } catch (err: unknown) {
    const botMsgId = `msg-${Date.now()}-bot`
    const errBlock: Block = {
      id: `block-err-${Date.now()}`,
      msgId: botMsgId,
      role: 'system',
      type: 'ErrorFallback',
      message: err instanceof Error ? err.message : '创建会话失败',
      errorCode: 'SESSION_CREATE_FAILED',
      retryAvailable: true,
      meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
    } as Block
    sessionStore.addBlock(errBlock)
    return
  }

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now(),
    citingIds,
  }
  sessionStore.addMessage(userMsg)

  const traceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`
  currentTraceId = traceId

  const botMsgId = `msg-${Date.now()}-bot`
  const thinkingBlock: Block = {
    id: `block-think-${Date.now()}`,
    msgId: botMsgId,
    role: 'assistant',
    type: 'ThinkingChain',
    meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
  } as Block
  sessionStore.addBlock(thinkingBlock)

  sessionStore.setStreaming(true)
  try {
    const abortCtrl = new AbortController()
    sessionStore.setCancelController(abortCtrl)

    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        msg_content: content,
        citing_msg_ids: citingIds,
        trace_id: traceId,
      }),
      signal: abortCtrl.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) { // eslint-disable-line no-constant-condition
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            handleStreamEvent(data.event || 'message', data, botMsgId, thinkingBlock.id)
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      sessionStore.updateBlock(thinkingBlock.id, {
        meta: { ...thinkingBlock.meta, status: 'error', errorMessage: err.message }
      } as Partial<Block>)
    }
  } finally {
    sessionStore.finalizeBlocks(botMsgId)
    sessionStore.setStreaming(false)
    sessionStore.setCancelController(null)
    // 一轮对话结束后刷新 ChatMap，展示最新 work 的消息图谱，并撤销引用复选
    void sessionStore.loadDag(sessionId, 'default-user')
    sessionStore.clearSelection()
  }
}

let textBlockId: string | null = null
let currentTraceId = ''

function handleStreamEvent(event: string, data: Record<string, unknown>, botMsgId: string, thinkingBlockId: string) {
  switch (event) {
    case 'connected':
    case 'loading':
      break

    case 'agent_thinking':
    case 'thinking':
      sessionStore.appendBlockContent(thinkingBlockId, String(data.chunk || ''))
      break

    case 'text':
    case 'agent_output': {
      const chunk = String(data.chunk || '')
      if (!textBlockId) {
        textBlockId = `block-text-${Date.now()}`
        const textBlock: Block = {
          id: textBlockId,
          msgId: botMsgId,
          role: 'assistant',
          type: 'TextParagraph',
          content: chunk,
          meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
        } as TextBlock
        sessionStore.addBlock(textBlock)
      } else {
        sessionStore.appendBlockContent(textBlockId, chunk)
      }
      break
    }

    case 'agent_status': {
      const toolBlock: Block = {
        id: `block-tool-${Date.now()}`,
        msgId: botMsgId,
        role: 'tool',
        type: 'ToolInvocation',
        toolName: String(data.tool_name || ''),
        params: (data.params as Record<string, unknown>) || {},
        meta: { status: data.status === 'done' ? 'done' : 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(toolBlock)
      break
    }

    case 'citation':
      if (textBlockId) {
        sessionStore.updateBlock(textBlockId, {
          citingIds: data.citing_ids as string[],
        } as Partial<Block>)
      }
      break

    case 'done': {
      sessionStore.finalizeBlocks(botMsgId)
      const feedbackBlock: Block = {
        id: `block-fb-${Date.now()}`,
        msgId: botMsgId,
        role: 'assistant',
        type: 'Feedback',
        traceId: String(data.trace_id || currentTraceId || ''),
        meta: { status: 'done', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(feedbackBlock)
      textBlockId = null
      break
    }

    case 'error': {
      const errBlock: Block = {
        id: `block-err-${Date.now()}`,
        msgId: botMsgId,
        role: 'system',
        type: 'ErrorFallback',
        message: String(data.error_message || '未知错误'),
        errorCode: String(data.error_code || ''),
        retryAvailable: false,
        traceId: String(data.trace_id || currentTraceId || ''),
        meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(errBlock)
      break
    }
  }
}
</script>

<template>
  <div class="chat-area flex flex-1 overflow-hidden" :class="{ 'select-none': isDragging }">
    <!-- Left: ChatMap -->
    <div class="flex-shrink-0 h-full overflow-hidden" :style="{ width: leftWidth }">
      <ChatMap />
    </div>

    <!-- Resizable Divider -->
    <div
      class="w-1.5 cursor-col-resize bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-brian-blue/50 transition-colors relative group flex-shrink-0"
      @mousedown="startResize"
    >
      <div class="absolute inset-y-0 -left-1 -right-1" />
    </div>

    <!-- Right: Conversation Panel -->
    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden" :style="{ width: rightWidth }">
      <div ref="listRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div v-if="!sessionStore.currentSessionId && sessionStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400">
          <MessageCircle :size="48" class="mb-4 text-apple-gray-300" />
          <p class="text-lg font-medium">Brian Agent</p>
          <p class="text-sm mt-1">开始一段对话</p>
        </div>

        <template v-for="entry in timeline" :key="entry.key">
          <div
            v-if="entry.kind === 'message'"
            class="max-w-[85%]"
            :class="entry.message.role === 'user' ? 'ml-auto' : 'mr-auto'"
            :data-info-id="entry.message.id"
          >
            <div
              class="rounded-2xl px-3 py-2.5 cursor-pointer"
              :class="entry.message.role === 'user' ? 'bg-brian-blue text-white' : 'block-card'"
              @click="centerMapOn(entry.message.id)"
            >
              <div class="flex items-center justify-between mb-1 text-[10px]">
                <label v-if="sessionStore.citingMode" class="flex items-center gap-1 cursor-pointer" @click.stop>
                  <input
                    type="checkbox"
                    class="accent-white"
                    :checked="sessionStore.selectedMsgIds.has(entry.message.id)"
                    @change="sessionStore.toggleMsgSelection(entry.message.id)"
                  />
                </label>
                <span v-else :class="entry.message.role === 'user' ? 'text-white/70' : 'text-apple-gray-400'">
                  {{ formatTime(entry.message.timestamp) }}
                </span>
                <button
                  class="p-0.5 rounded hover:text-warning-orange"
                  :class="nodeOf(entry.message)?.pin ? 'text-warning-orange' : (entry.message.role === 'user' ? 'text-white/70' : 'text-apple-gray-400')"
                  :title="nodeOf(entry.message)?.pin ? '取消钉住' : '钉住'"
                  @click.stop="togglePin(entry.message.id)"
                >
                  <component :is="nodeOf(entry.message)?.pin ? Pin : PinOff" :size="12" />
                </button>
              </div>

              <p class="text-sm whitespace-pre-wrap">{{ entry.message.content }}</p>

              <div class="flex items-center gap-1.5 mt-1.5">
                <button
                  class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
                  :class="entry.message.role === 'user' ? 'bg-white/20 text-white' : 'bg-brian-blue/10 text-brian-blue'"
                  @click.stop="expandedCited = expandedCited === entry.message.id ? null : entry.message.id"
                >
                  引用 {{ nodeOf(entry.message)?.citedCount ?? 0 }}
                  <ChevronDown :size="10" :class="expandedCited === entry.message.id ? 'rotate-180' : ''" />
                </button>
                <button
                  class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
                  :class="entry.message.role === 'user' ? 'bg-white/20 text-white' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300'"
                  @click.stop="expandedCiting = expandedCiting === entry.message.id ? null : entry.message.id"
                >
                  被引用 {{ nodeOf(entry.message)?.citingCount ?? 0 }}
                  <ChevronDown :size="10" :class="expandedCiting === entry.message.id ? 'rotate-180' : ''" />
                </button>
                <span class="ml-auto text-[10px]" :class="entry.message.role === 'user' ? 'text-white/60' : 'text-apple-gray-300'">
                  {{ entry.message.content.length }}字
                </span>
              </div>

              <div v-if="expandedCited === entry.message.id" class="mt-1.5 space-y-0.5">
                <p class="text-[10px]" :class="entry.message.role === 'user' ? 'text-white/60' : 'text-apple-gray-400'">引用以下消息：</p>
                <button
                  v-for="cid in nodeOf(entry.message)?.citedInfoIds ?? []"
                  :key="cid"
                  class="flex items-center gap-1 w-full text-left text-[10px] truncate hover:underline"
                  @click.stop="jumpTo(cid)"
                >
                  <CornerUpRight :size="10" class="flex-shrink-0" />
                  {{ nodeMap.get(cid)?.summary || cid.slice(0, 8) }}
                </button>
                <p v-if="!(nodeOf(entry.message)?.citedInfoIds?.length)" class="text-[10px]" :class="entry.message.role === 'user' ? 'text-white/60' : 'text-apple-gray-300'">无</p>
              </div>

              <div v-if="expandedCiting === entry.message.id" class="mt-1.5 space-y-0.5">
                <p class="text-[10px]" :class="entry.message.role === 'user' ? 'text-white/60' : 'text-apple-gray-400'">被以下消息引用：</p>
                <button
                  v-for="cid in nodeOf(entry.message)?.citingInfoIds ?? []"
                  :key="cid"
                  class="flex items-center gap-1 w-full text-left text-[10px] truncate hover:underline"
                  @click.stop="jumpTo(cid)"
                >
                  <CornerUpRight :size="10" class="flex-shrink-0" />
                  {{ nodeMap.get(cid)?.summary || cid.slice(0, 8) }}
                </button>
                <p v-if="!(nodeOf(entry.message)?.citingInfoIds?.length)" class="text-[10px]" :class="entry.message.role === 'user' ? 'text-white/60' : 'text-apple-gray-300'">无</p>
              </div>
            </div>

            <div v-if="entry.message.citingIds?.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="cid in entry.message.citingIds"
                :key="cid"
                class="px-2 py-0.5 text-xs rounded-full bg-brian-blue/10 text-brian-blue"
              >{{ cid.slice(-8) }}</span>
            </div>
          </div>

          <div v-else class="max-w-[85%]" :class="entry.block.role === 'user' ? 'ml-auto' : 'mr-auto'">
            <BlockRenderer :block="entry.block" />
          </div>
        </template>

        <!-- Streaming cursor -->
        <div v-if="sessionStore.isStreaming" class="flex items-center gap-2 text-apple-gray-400 text-sm">
          <Loader2 :size="14" class="animate-spin" />
          <span>思考中...</span>
        </div>
      </div>

      <div class="flex-shrink-0 border-t border-apple-gray-100 dark:border-apple-gray-800">
        <InputBox
          :disabled="sessionStore.isStreaming"
          :citing-mode="sessionStore.citingMode"
          @send="handleSend"
          @toggle-citing="sessionStore.toggleCitingMode()"
          @stop="sessionStore.cancelCurrentTask()"
        />
      </div>
    </div>
  </div>
</template>
