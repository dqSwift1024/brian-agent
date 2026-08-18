<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  MessageCircle,
  Loader2,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import type { ChatMessage, Block, TextBlock, ThinkingBlock } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import MessageCard from './MessageCard.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'

const sessionStore = useSessionStore()

const leftWidth = computed(() => `${sessionStore.splitRatio * 100}%`)
const rightWidth = computed(() => `${(1 - sessionStore.splitRatio) * 100}%`)
const isDragging = ref(false)
const listRef = ref<HTMLDivElement | null>(null)

const nodeMap = computed(() => {
  const m = new Map<string, { summary: string; pin: boolean; citingCount: number; citedCount: number; citingInfoIds: string[]; citedInfoIds: string[] }>()
  for (const n of sessionStore.chatMapNodes) {
    m.set(n.infoId, { summary: n.summary, pin: n.pin, citingCount: n.citingCount, citedCount: n.citedCount, citingInfoIds: n.citingInfoIds, citedInfoIds: n.citedInfoIds })
  }
  return m
})

function nodeOf(msg: ChatMessage) {
  return nodeMap.value.get(msg.id)
}

function getCitedCount(msg: ChatMessage): number {
  const fromNode = nodeOf(msg)?.citedCount
  if (fromNode !== undefined && fromNode > 0) return fromNode
  return getCitedIds(msg).length
}

function getCitingCount(msg: ChatMessage): number {
  const fromNode = nodeOf(msg)?.citingCount
  if (fromNode !== undefined && fromNode > 0) return fromNode
  return msg.citingCount ?? 0
}

function getCitedIds(msg: ChatMessage): string[] {
  const nodeIds = nodeOf(msg)?.citedInfoIds
  if (nodeIds && nodeIds.length > 0) return nodeIds
  if (msg.citedInfoIds && msg.citedInfoIds.length > 0) return msg.citedInfoIds
  if (msg.citingIds && msg.citingIds.length > 0) return msg.citingIds
  return []
}

function getCitingIds(msg: ChatMessage): string[] {
  const nodeIds = nodeOf(msg)?.citingInfoIds
  if (nodeIds && nodeIds.length > 0) return nodeIds
  if (msg.citingInfoIds && msg.citingInfoIds.length > 0) return msg.citingInfoIds
  return []
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

  // ===== 原始实现（保留参考）：提前插入空 thinkingBlock，导致时序倒置与空卡片 =====
  // const botMsgId = `msg-${Date.now()}-bot`
  // const thinkingBlock: Block = {
  //   id: `block-think-${Date.now()}`,
  //   msgId: botMsgId,
  //   role: 'assistant',
  //   type: 'ThinkingChain',
  //   meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
  // } as Block
  // sessionStore.addBlock(thinkingBlock)

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

  const selectedMsgIds = Array.from(sessionStore.selectedMsgIds)
  const combinedCitingIds = Array.from(new Set([...citingIds, ...selectedMsgIds]))

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now(),
    citingIds: combinedCitingIds,
  }
  sessionStore.addMessage(userMsg)

  const traceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`
  currentTraceId = traceId

  const botMsgId = `msg-${Date.now()}-bot`
  textBlockId = null

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
        citing_msg_ids: combinedCitingIds,
        selected_msg_ids: selectedMsgIds,
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
            const rawData = JSON.parse(line.slice(6))
            handleStreamEvent(rawData, botMsgId)
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      const errBlock: Block = {
        id: `block-err-${Date.now()}`,
        msgId: botMsgId,
        role: 'system',
        type: 'ErrorFallback',
        message: err.message,
        errorCode: 'STREAM_ERROR',
        retryAvailable: true,
        meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(errBlock)
    }
  } finally {
    sessionStore.finalizeBlocks(botMsgId)
    sessionStore.setStreaming(false)
    sessionStore.setCancelController(null)
    // 一轮对话结束后刷新 ChatMap 与历史消息，展示最新图谱与引用关联，并重置复选
    await sessionStore.loadDag(sessionId, 'default-user')
    await sessionStore.loadChatHistory(sessionId, 'default-user')
    // 清理流式期间生成的临时文本段落 Block，避免与后端加载回来的 ChatMessage 重复展示
    sessionStore.cleanupTransientTextBlocks(botMsgId)
    sessionStore.clearSelection()
  }
}

let textBlockId: string | null = null
let currentTraceId = ''

function handleStreamEvent(data: Record<string, unknown>, botMsgId: string) {
  // 解析结构化 BrianSSEMessage 协议或兼容旧事件对象
  const isStructured = 'msg_id' in data && 'event' in data
  const event = String(isStructured ? data.event : (data.event || 'message'))
  const payload = (isStructured ? (data.data as Record<string, unknown> ?? {}) : data) as Record<string, unknown>
  const serverTime = Number(isStructured ? (data.timestamp || Date.now()) : Date.now())
  const agentId = String(isStructured ? (data.agent_id || '') : (payload.agent_id || ''))

  switch (event) {
    case 'connected':
    case 'loading':
      break

    case 'agent_thinking':
    case 'thinking': {
      const chunk = typeof payload === 'string' ? payload : String(payload.chunk || '')
      const thinkKey = agentId ? `block-think-${botMsgId}-${agentId}` : `block-think-${botMsgId}`
      const existing = sessionStore.blocks.find(b => b.id === thinkKey)
      if (!existing) {
        const thinkingBlock: ThinkingBlock = {
          id: thinkKey,
          msgId: botMsgId,
          role: 'assistant',
          type: 'ThinkingChain',
          content: chunk,
          summary: '',
          durationMs: 0,
          agentInfo: agentId ? { name: agentId, type: 'WORKER' } : undefined,
          meta: { status: 'streaming', createdAt: serverTime, updatedAt: serverTime },
        }
        sessionStore.addBlock(thinkingBlock as Block)
      } else {
        sessionStore.appendBlockContent(thinkKey, chunk)
      }
      break
    }

    case 'text_chunk':
    case 'text':
    case 'agent_output': {
      const chunk = typeof payload === 'string' ? payload : String(payload.chunk || '')
      if (!textBlockId) {
        textBlockId = `block-text-${botMsgId}`
        const textBlock: Block = {
          id: textBlockId,
          msgId: botMsgId,
          role: 'assistant',
          type: 'TextParagraph',
          content: chunk,
          meta: { status: 'streaming', createdAt: serverTime, updatedAt: serverTime },
        } as TextBlock
        sessionStore.addBlock(textBlock)
      } else {
        sessionStore.appendBlockContent(textBlockId, chunk)
      }
      break
    }

    case 'agent_action':
    case 'agent_status': {
      const toolBlock: Block = {
        id: `block-tool-${Date.now()}`,
        msgId: botMsgId,
        role: 'tool',
        type: 'ToolInvocation',
        toolName: String(payload.tool_name || payload.tool_type || 'Tool'),
        params: (payload.params as Record<string, unknown>) || {},
        result: payload.result,
        meta: { status: payload.status === 'done' ? 'done' : 'streaming', createdAt: serverTime, updatedAt: serverTime },
      } as Block
      sessionStore.addBlock(toolBlock)
      break
    }

    case 'agent_built': {
      const agentName = String(payload.agent_name || payload.agent_id || '')
      if (agentName && agentId) {
        const thinkKey = `block-think-${botMsgId}-${agentId}`
        const existing = sessionStore.blocks.find(b => b.id === thinkKey) as ThinkingBlock | undefined
        if (existing) {
          existing.agentInfo = { name: agentName, type: 'WORKER' }
        }
      }
      break
    }

    case 'citation':
      if (textBlockId) {
        sessionStore.updateBlock(textBlockId, {
          citingIds: payload.citing_ids as string[],
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
        traceId: String(payload.trace_id || currentTraceId || ''),
        meta: { status: 'done', createdAt: serverTime, updatedAt: serverTime },
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
        message: String(payload.error_message || '未知错误'),
        errorCode: String(payload.error_code || ''),
        retryAvailable: false,
        traceId: String(payload.trace_id || currentTraceId || ''),
        meta: { status: 'error', createdAt: serverTime, updatedAt: serverTime },
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
            <MessageCard
              :id="entry.message.id"
              :info-id="entry.message.id"
              :role="entry.message.role"
              :content="entry.message.content"
              :timestamp="entry.message.timestamp"
              :pin="nodeOf(entry.message)?.pin ?? entry.message.pin"
              :selected="sessionStore.selectedMsgIds.has(entry.message.id)"
              :cited-count="getCitedCount(entry.message)"
              :citing-count="getCitingCount(entry.message)"
              :cited-info-ids="getCitedIds(entry.message)"
              :citing-info-ids="getCitingIds(entry.message)"
              :trace-id="entry.message.traceId || entry.message.workId"
              :work-id="entry.message.workId"
              mode="timeline"
              :node-map="nodeMap"
              @toggle-select="sessionStore.toggleMsgSelection"
              @toggle-pin="togglePin"
              @click-card="centerMapOn"
              @jump-to="jumpTo"
            />
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
          :selected-count="sessionStore.selectedMsgIds.size"
          @send="handleSend"
          @toggle-citing="sessionStore.toggleCitingMode()"
          @clear-selected="sessionStore.clearSelection()"
          @stop="sessionStore.cancelCurrentTask()"
        />
      </div>
    </div>
  </div>
</template>
