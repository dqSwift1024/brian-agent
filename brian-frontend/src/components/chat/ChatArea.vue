<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  MessageCircle,
  Loader2,
  Brain,
  UserRound,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import { chatApi } from '@/api'
import type { ChatMessage, Block, TextBlock, ThinkingBlock, DagExecutionStep } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import MessageCard from './MessageCard.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'
// ===== 原始导入（保留参考）：对话区渲染 Planning 策略拆解（AgentDagFlow）时使用，现已在对话区移除 =====
// import AgentDagFlow from './AgentDagFlow.vue'
import ThinkingModal from './ThinkingModal.vue'
import EvalResultModal from './EvalResultModal.vue'

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

// ===== 原始 showThinking 实现（保留参考） =====
/*
async function showThinking(id: string) {
  sessionStore.openThinkingModal(id)
  try {
    const res = await chatApi.thinking(id)
    // 同时下发 Planning 策略拆解（Task DAG / Agent DAG）到弹窗
    sessionStore.openThinkingModal(id, res.blocks, res.dag ?? null)
  } catch {
    sessionStore.openThinkingModal(id, [], null)
  }
}
*/

// ===== 修改后：思考过程独立按模块并发加载（DAG 与 ThinkingBlocks 独立加载与渐进式展示） =====
async function showThinking(id: string) {
  // 1. 立即打开弹窗并展示"正在加载思考过程..."动态加载态，避免静态空白卡顿
  sessionStore.startThinkingLoading(id)

  // 2. 模块独立独立加载：DAG 图与思考块独立请求并回调更新
  const dagPromise = chatApi.thinking(id, 'dag')
    .then(res => sessionStore.setThinkingDag(res.dag ?? null))
    .catch(() => sessionStore.setThinkingDag(null))

  const blocksPromise = chatApi.thinking(id, 'blocks')
    .then(res => sessionStore.setThinkingBlocks(res.blocks ?? []))
    .catch(() => sessionStore.setThinkingBlocks([]))

  await Promise.allSettled([dagPromise, blocksPromise])
}

const confirmingIntent = ref(false)

async function handleIntentConfirm(action: 'APPROVE' | 'KEEP' | 'CANCEL') {
  const conf = sessionStore.intentConfirmation
  if (!conf) return
  confirmingIntent.value = true
  try {
    await chatApi.confirmIntent({
      session_id: conf.session_id,
      work_id: conf.work_id,
      action,
      understood_requirement: action === 'APPROVE' ? conf.understood_requirement : undefined,
    })
  } catch (err) {
    const errBlock: Block = {
      id: `block-err-${Date.now()}`,
      msgId: `msg-${Date.now()}`,
      role: 'system',
      type: 'ErrorFallback',
      message: err instanceof Error ? err.message : '确认需求失败',
      errorCode: 'CONFIRM_INTENT_FAILED',
      retryAvailable: false,
      meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
    } as Block
    sessionStore.addBlock(errBlock)
  } finally {
    confirmingIntent.value = false
    sessionStore.clearIntentConfirmation()
    // 确认后刷新历史与 ChatMap，展示本轮最终结果
    const sid = sessionStore.currentSessionId
    if (sid) {
      await sessionStore.loadDag(sid, 'default-user')
      await sessionStore.loadChatHistory(sid, 'default-user')
    }
  }
}

type TimelineEntry =
  | { kind: 'message'; key: string; sort: number; message: ChatMessage }
  | { kind: 'block'; key: string; sort: number; block: Block }

// ===== 原始 timeline 实现（保留参考） =====
/*
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
    if (a.kind !== b.kind) return a.kind === 'message' ? -1 : 1
    return a.key.localeCompare(b.key)
  })
  return entries
})
*/

// ===== 修改后的 timeline 实现：确保思考 Blocks 严格按创建/执行先后顺序在用户提问之后、最终回复之前正确排列 =====
const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  for (const m of sessionStore.messages) {
    entries.push({ kind: 'message', key: `m-${m.id}`, sort: m.timestamp, message: m })
  }
  for (const b of sessionStore.blocks) {
    entries.push({ kind: 'block', key: `b-${b.id}`, sort: b.meta.createdAt || Date.now(), block: b })
  }
  entries.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort
    // 同一时间戳内：用户消息(USER) < 思考Block(Thinking) < 最终回复消息(ASSISTANT)
    if (a.kind !== b.kind) {
      if (a.kind === 'message' && a.message.role === 'user') return -1
      if (b.kind === 'message' && b.message.role === 'user') return 1
      if (a.kind === 'block') return -1
      if (b.kind === 'block') return 1
    }
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

  // trace_id 由后端经 ToolProvider 统一生成 UUID，经 connected 事件回传；
  // 前端不再自行生成（避免非安全上下文 fallback 产生非 UUID 格式）。
  currentTraceId = ''

  const botMsgId = `msg-${Date.now()}-bot`
  textBlockId = null

  sessionStore.setStreaming(true)
  // 重置本轮 Planning 策略拆解数据（流式期间实时填充）
  sessionStore.resetPlanning()
  // 重置本轮各 Agent 的执行运行时状态
  sessionStore.resetAgentStatus()
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
    sessionStore.closeThinkingModal()
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

// ===== 原始 handleStreamEvent 函数（保留作为参考） =====
/*
function handleStreamEvent(data: Record<string, unknown>, botMsgId: string) {
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
*/

// ===== 修改后的 handleStreamEvent 函数：完整解析 Agent 基础信息、上下文、输入输出与思维链步骤 =====
function handleStreamEvent(data: Record<string, unknown>, botMsgId: string) {
  const isStructured = 'msg_id' in data && 'event' in data
  const event = String(isStructured ? data.event : (data.event || 'message'))
  const payload = (isStructured ? (data.data as Record<string, unknown> ?? {}) : data) as Record<string, unknown>
  const serverTime = Number(isStructured ? (data.timestamp || Date.now()) : Date.now())
  const agentId = String(isStructured ? (data.agent_id || '') : (payload.agent_id || ''))

  const formatAgentTitle = (rawName?: string, agId?: string, agType?: string): string => {
    const isUuid = (val?: string) => !val || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
    if (rawName && !isUuid(rawName) && rawName !== agId) {
      return rawName
    }
    const typeUpper = (agType || '').toUpperCase()
    if (typeUpper === 'PLANNER') return '规划 Agent (Planner)'
    if (typeUpper === 'WRITER') return '表达 Agent (Writer)'
    if (typeUpper === 'EVOLUTOR') return '进化 Agent (Evolutor)'
    return '执行 Agent'
  }

  // 快捷辅助方法：获取或创建某 Agent 的 ThinkingBlock
  const getOrCreateThinkBlock = (agId: string, defaultName?: string, defaultType?: string): ThinkingBlock => {
    const key = agId ? `block-think-${botMsgId}-${agId}` : `block-think-${botMsgId}`
    let existing = sessionStore.blocks.find(b => b.id === key) as ThinkingBlock | undefined
    const formattedName = formatAgentTitle(defaultName, agId, defaultType)

    if (!existing) {
      existing = {
        id: key,
        msgId: botMsgId,
        role: 'assistant',
        type: 'ThinkingChain',
        content: '',
        summary: '',
        durationMs: 0,
        agentInfo: {
          id: agId,
          name: formattedName,
          type: defaultType || 'WORKER',
        },
        context: {
          userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
          citingMessages: [],
        },
        steps: [],
        meta: { status: 'streaming', createdAt: serverTime, updatedAt: serverTime },
      }
      sessionStore.addBlock(existing as Block)
    } else {
      if (defaultName && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(defaultName) && defaultName !== agId) {
        if (!existing.agentInfo) {
          existing.agentInfo = { name: defaultName, type: defaultType || 'WORKER' }
        } else {
          existing.agentInfo.name = defaultName
        }
        sessionStore.updateBlock(existing.id, { agentInfo: existing.agentInfo })
      }
    }
    return existing
  }

  switch (event) {
    case 'connected': {
      // 后端经 ToolProvider 生成的 trace_id 回传，供「复制 TraceId」按钮复制
      const tid = typeof payload.trace_id === 'string' && payload.trace_id ? payload.trace_id : ''
      if (tid) currentTraceId = tid
      break
    }
    case 'loading':
      break

    // ===== 原始代码（保留参考）=====
    // case 'context_built': {
    //   // 记录上下文 (User Profile, 引用的历史消息, 最近 Works)
    //   const thinkBlock = getOrCreateThinkBlock(agentId)
    //   const userProfile = (payload.user_profile as Record<string, unknown>) || undefined
    //   const citingMessages = (payload.citations as unknown[]) || undefined
    //   const recentWorks = (payload.recent_works as unknown[]) || undefined
    //   thinkBlock.context = {
    //     userProfile,
    //     citingMessages,
    //     recentWorks,
    //     customContext: typeof payload.custom_context === 'string' ? payload.custom_context : undefined,
    //   }
    //   sessionStore.updateBlock(thinkBlock.id, { context: thinkBlock.context })
    //   break
    // }

    // ===== 修改后的代码：提取完整分类 Context 数据与 Category ID 映射 =====
    case 'context_built': {
      const thinkBlock = getOrCreateThinkBlock(agentId)
      const userProfile = (payload.user_profile as Record<string, unknown>) || undefined
      const recentWorks = (payload.recent_works as unknown[]) || undefined
      const categories = (payload.context_categories as Record<string, unknown[]>) || {}
      const categoryIds = (payload.context_category_ids as Record<string, string[]>) || undefined
      const citingMessages = categories.citing || (Array.isArray(payload.session_context) ? payload.session_context : ((payload.citations as unknown[]) || undefined))

      thinkBlock.context = {
        strategy: (payload.strategy as string) || (sessionStore.planning?.status && sessionStore.planning.status !== 'idle' ? 'Planning 策略 (任务分解)' : 'Simple 策略 (直接推理)'),
        userProfile,
        selectedMessages: categories.selected,
        citingMessages,
        timelineMessages: categories.timeline,
        pinnedMessages: categories.pinned,
        similarityMessages: categories.similarity,
        tagRelativeMessages: categories.tag_relative,
        keywordMessages: categories.keyword,
        randomMessages: categories.random,
        categoryIds,
        recentWorks,
        customContext: typeof payload.custom_context === 'string' ? payload.custom_context : undefined,
      }
      sessionStore.updateBlock(thinkBlock.id, { context: thinkBlock.context })
      // 上下文构建成功后弹出思考过程弹窗（流式展示），避免过早弹出遮挡后续的「确认需求理解」弹窗
      sessionStore.openThinkingModal(null)
      break
    }

    case 'intent_agent_result': {
      // 需求理解 Agent (IntentAgent) 结果：创建 ThinkingBlock 展示在"思考过程"弹窗中
      const intentAgentId = 'intent-agent'
      const intentBlock = getOrCreateThinkBlock(intentAgentId, '需求理解 Agent (Intent)', 'INTENT')
      intentBlock.input = String(payload.understood_requirement ?? '')
      if (payload.prompt) intentBlock.prompt = payload.prompt as string
      intentBlock.content = String(payload.reasoning ?? '')
      intentBlock.output = {
        understood_requirement: payload.understood_requirement,
        match_score: payload.match_score,
        threshold_score: payload.threshold_score,
        should_modify_query: payload.should_modify_query,
      }
      if (typeof payload.input_tokens === 'number') intentBlock.inputTokens = payload.input_tokens
      if (typeof payload.output_tokens === 'number') intentBlock.outputTokens = payload.output_tokens
      if (typeof payload.elapsed_ms === 'number') intentBlock.durationMs = payload.elapsed_ms
      if (!intentBlock.steps) intentBlock.steps = []
      intentBlock.steps.push({
        phase: 'THINK',
        iteration: 1,
        content: `需求理解: ${String(payload.understood_requirement ?? '')}\n匹配度: ${payload.match_score ?? 'N/A'} / 阈值: ${payload.threshold_score ?? 'N/A'}`,
      })
      intentBlock.steps.push({
        phase: 'REFLECT',
        iteration: 2,
        reflection: `是否需要修改查询: ${payload.should_modify_query ? '是' : '否'}`,
        passed: true,
      })
      sessionStore.updateBlock(intentBlock.id, {
        input: intentBlock.input,
        content: intentBlock.content,
        output: intentBlock.output,
        steps: intentBlock.steps,
        inputTokens: intentBlock.inputTokens,
        outputTokens: intentBlock.outputTokens,
        durationMs: intentBlock.durationMs,
      })
      sessionStore.setAgentStatus(intentAgentId, 'SUCCESS', '需求理解 Agent (Intent)')
      break
    }

    case 'intent_confirmation_required': {
      // 需求理解得分低于阈值：弹出「需求确认」弹窗，由用户确认按理解执行 / 按原文执行 / 取消
      sessionStore.setIntentConfirmation({
        ...payload,
        session_id: sessionStore.currentSessionId,
      })
      break
    }

    // ===== Planning 策略拆解事件 =====
    case 'plan_created': {
      // PlannerAgent 完成任务级拆解：记录 Task DAG 并更新弹窗
      const taskDag = (payload.task_dag as { nodes?: unknown[]; edges?: unknown[] }) || {}
      const taskNodes = Array.isArray(taskDag.nodes)
        ? (taskDag.nodes as Record<string, unknown>[]).map((t, i) => {
            const content = String(t.task_content ?? '')
            const domain = String(t.task_domain ?? '')
            return {
              id: String(t.task_id ?? `task-${i}`),
              label: domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`),
              domain,
              content,
              complexity: Number(t.task_complexity ?? 0),
              priority: Number(t.priority ?? 0),
              dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
            }
          })
        : []
      const taskEdges = Array.isArray(taskDag.edges)
        ? (taskDag.edges as Record<string, unknown>[]).map((e) => ({
            source: String(e.from_task_id ?? ''),
            target: String(e.to_task_id ?? ''),
          }))
        : []
      sessionStore.updatePlanning({
        planId: typeof payload.plan_id === 'string' ? payload.plan_id : undefined,
        taskDag: taskNodes.length > 0 ? { nodes: taskNodes, edges: taskEdges } : undefined,
        status: 'streaming',
      })
      break
    }

    case 'agent_dag_created': {
      // 任务级拆解映射为 Agent DAG：记录 Agent 级 DAG 并更新弹窗
      const agentDag = (payload.agent_dag as Record<string, unknown>) || {}
      const agentNodes = Array.isArray(agentDag.agent_nodes) ? agentDag.agent_nodes : []
      sessionStore.updatePlanning({
        planId: typeof agentDag.plan_id === 'string' ? agentDag.plan_id : undefined,
        agentDag: {
          planId: typeof agentDag.plan_id === 'string' ? agentDag.plan_id : undefined,
          totalCount: Number(agentDag.total_agent_count ?? agentNodes.length),
          nodes: agentNodes.map((n: Record<string, unknown>, i: number) => {
            const domain = String(n.task_domain ?? '')
            const content = String(n.task_content ?? '')
            const title = domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`)
            return {
              id: String(n.agent_id ?? `agent-${i}`),
              label: `任务 ${i + 1}: ${title}`,
              domain,
              content,
              status: String(n.status ?? 'PENDING'),
              taskId: String(n.task_id ?? ''),
            }
          }),
          edges: Array.isArray(agentDag.agent_edges)
            ? agentDag.agent_edges.map((e: Record<string, unknown>) => ({
                source: String(e.from_agent_id ?? ''),
                target: String(e.to_agent_id ?? ''),
                label: String(e.data_dependency ?? ''),
              }))
            : [],
        },
        status: 'streaming',
      })
      // 初始化每个 AgentDAG 节点的执行运行时状态（未执行 → 灰色）
      const dagNodes = (sessionStore.planning.agentDag?.nodes ?? [])
      for (const n of dagNodes) {
        const s = String(n.status ?? '').toUpperCase()
        const st = s.includes('COMPLET') || s.includes('SUCCESS') || s.includes('DONE')
          ? 'SUCCESS'
          : (s.includes('RUN') || s.includes('EXECUT') || s.includes('PROCESS') ? 'RUNNING' : 'PENDING')
        sessionStore.setAgentStatus(n.id, st, n.agentName)
      }
      break
    }

    case 'dag_node_start': {
      // JSONNode 编排节点开始执行：追加 RUNNING 步骤
      const nodeId = String(payload.node_id ?? '')
      const nodeType = String(payload.node_type ?? '')
      const existingSteps = sessionStore.planning.executionSteps || []
      const step: DagExecutionStep = { node_id: nodeId, node_type: nodeType, status: 'RUNNING' }
      const idx = existingSteps.findIndex((s) => s.node_id === nodeId && s.node_type === nodeType)
      const next = [...existingSteps]
      if (idx >= 0) next[idx] = step
      else next.push(step)
      sessionStore.updatePlanning({ executionSteps: next, status: 'streaming' })
      break
    }

    case 'dag_node_end': {
      // JSONNode 编排节点执行结束：更新步骤状态与耗时
      const nodeId = String(payload.node_id ?? '')
      const nodeType = String(payload.node_type ?? '')
      const existingSteps = sessionStore.planning.executionSteps || []
      const next = [...existingSteps]
      const idx = next.findIndex((s) => s.node_id === nodeId && s.node_type === nodeType)
      const completed: DagExecutionStep = {
        node_id: nodeId,
        node_type: nodeType,
        status: String(payload.status ?? 'SUCCESS'),
        elapsed_ms: Number(payload.elapsed_ms ?? 0),
        error: typeof payload.error === 'string' ? payload.error : undefined,
      }
      if (idx >= 0) next[idx] = completed
      else next.push(completed)
      sessionStore.updatePlanning({ executionSteps: next, status: 'streaming' })
      break
    }

    case 'agent_building': {
      // Agent 构建开始：创建「构建中」占位卡片，按到达顺序展示构建进度
      const taskContent = typeof payload.task_content === 'string' ? payload.task_content : ''
      const buildLabel = taskContent
        ? `构建中: ${taskContent.slice(0, 24)}`
        : '构建 Agent'
      sessionStore.setAgentStatus(agentId, 'RUNNING', buildLabel)
      const thinkBlock = getOrCreateThinkBlock(agentId, buildLabel, 'WORKER')
      thinkBlock.agentInfo = { id: agentId, name: buildLabel, type: 'WORKER' }
      if (taskContent) thinkBlock.input = taskContent
      sessionStore.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, input: thinkBlock.input })
      break
    }

    case 'agent_built': {
      // Agent 构建完成：回填真实 agent 名称与组件绑定
      const agentName = String(payload.agent_name || payload.agent_id || agentId || 'WorkAgent')
      const agentType = String(payload.agent_type || 'WORKER')
      const llmId = typeof payload.llm_id === 'string' ? payload.llm_id : undefined
      const soulId = typeof payload.soul_id === 'string' ? payload.soul_id : undefined
      const skills = Array.isArray(payload.skill_ids) ? payload.skill_ids.map(String) : undefined
      const mcps = Array.isArray(payload.mcp_ids) ? payload.mcp_ids.map(String) : undefined

      sessionStore.setAgentStatus(agentId, 'RUNNING', agentName)
      const thinkBlock = getOrCreateThinkBlock(agentId, agentName, agentType)
      thinkBlock.agentInfo = {
        id: agentId,
        name: agentName,
        type: agentType,
        llmId,
        soulId,
        skills,
        mcps,
      }
      if (payload.task_content) {
        thinkBlock.input = payload.task_content as string | Record<string, unknown>
      }
      sessionStore.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, input: thinkBlock.input })
      break
    }

    case 'agent_matched': {
      // 复用既有 Agent：将「构建中」占位卡片收敛为「复用已有 Agent」
      const matchedAgentId = String(payload.matched_agent_id || payload.agent_id || '')
      const key = agentId || matchedAgentId
      const thinkBlock = getOrCreateThinkBlock(key, '复用已有 Agent', 'WORKER')
      thinkBlock.agentInfo = { id: matchedAgentId || key, name: '复用已有 Agent', type: 'WORKER' }
      thinkBlock.output = { reused: true, matched_agent_id: matchedAgentId }
      sessionStore.setAgentStatus(key, 'SUCCESS', '复用已有 Agent')
      sessionStore.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, output: thinkBlock.output })
      break
    }

    case 'agent_thinking':
    case 'thinking': {
      const chunk = typeof payload === 'string' ? payload : String(payload.chunk || payload.reasoning || '')
      const rawAgName = typeof payload.agent_name === 'string' ? payload.agent_name : undefined
      const rawAgType = typeof payload.agent_type === 'string' ? payload.agent_type : undefined
      // 该 Agent 正在思考推理（RUNNING → 黄色）
      sessionStore.setAgentStatus(agentId, 'RUNNING', rawAgName)
      const thinkBlock = getOrCreateThinkBlock(agentId, rawAgName, rawAgType)
      thinkBlock.content += chunk
      if (typeof payload === 'object' && payload && payload.prompt) {
        thinkBlock.prompt = payload.prompt as string
      }
      
      // 更新 steps
      if (!thinkBlock.steps) thinkBlock.steps = []
      let lastStep = thinkBlock.steps[thinkBlock.steps.length - 1]
      if (!lastStep || lastStep.phase !== 'THINK') {
        lastStep = { phase: 'THINK', content: chunk, iteration: thinkBlock.steps.length + 1 }
        thinkBlock.steps.push(lastStep)
      } else {
        lastStep.content = (lastStep.content || '') + chunk
      }

      if (payload.input) thinkBlock.input = payload.input as string | Record<string, unknown>
      sessionStore.updateBlock(thinkBlock.id, { content: thinkBlock.content, steps: thinkBlock.steps, input: thinkBlock.input, prompt: thinkBlock.prompt })
      break
    }

    case 'agent_action':
    case 'agent_status': {
      const thinkBlock = getOrCreateThinkBlock(agentId)
      if (!thinkBlock.steps) thinkBlock.steps = []

      const toolName = String(payload.tool_name || payload.tool_type || payload.tool_id || 'Tool')
      const params = (payload.params as Record<string, unknown>) || {}
      const result = payload.result

      if (toolName !== 'NONE') {
        thinkBlock.steps.push({
          phase: 'ACT',
          iteration: thinkBlock.steps.length + 1,
          toolCalls: [{ toolName, toolType: String(payload.tool_type || toolName), params, result }],
        })
        sessionStore.updateBlock(thinkBlock.id, { steps: thinkBlock.steps })

        // 仅在调用了真实外部工具时添加独立 ToolInvocation Block，过滤无用 NONE 卡片
        const toolBlock: Block = {
          id: `block-tool-${Date.now()}`,
          msgId: botMsgId,
          role: 'tool',
          type: 'ToolInvocation',
          toolName,
          params,
          result,
          meta: { status: payload.status === 'done' ? 'done' : 'streaming', createdAt: serverTime, updatedAt: serverTime },
        } as Block
        sessionStore.addBlock(toolBlock)
      }
      break
    }

    case 'agent_reflection': {
      // 反思阶段仍属于思考推理中（RUNNING）
      sessionStore.setAgentStatus(agentId, 'RUNNING')
      const thinkBlock = getOrCreateThinkBlock(agentId)
      if (!thinkBlock.steps) thinkBlock.steps = []
      if (payload.prompt) thinkBlock.prompt = payload.prompt as string

      thinkBlock.steps.push({
        phase: 'REFLECT',
        iteration: thinkBlock.steps.length + 1,
        reflection: String(payload.reflection || ''),
        passed: Boolean(payload.passed),
      })
      sessionStore.updateBlock(thinkBlock.id, { steps: thinkBlock.steps, prompt: thinkBlock.prompt })
      break
    }

    // ===== 原始代码（保留参考）=====
    // case 'agent_output': {
    //   const outputVal = payload.output || payload.result || payload.chunk || payload.answer
    //   if (agentId) {
    //     // 该 Agent 已完成产出（SUCCESS → 绿色），并回填 Token 用量与耗时
    //     sessionStore.setAgentStatus(agentId, 'SUCCESS')
    //     const thinkBlock = getOrCreateThinkBlock(agentId)
    //     thinkBlock.output = outputVal as string | Record<string, unknown>
    //     if (typeof payload.token_usage === 'number') thinkBlock.tokenUsage = payload.token_usage
    //     if (typeof payload.elapsed_ms === 'number') thinkBlock.durationMs = payload.elapsed_ms
    //     sessionStore.updateBlock(thinkBlock.id, {
    //       output: thinkBlock.output,
    //       tokenUsage: thinkBlock.tokenUsage,
    //       durationMs: thinkBlock.durationMs,
    //     })
    //   }

    // ===== 修改后的代码：补全 inputTokens 与 outputTokens 分别透传 =====
    case 'agent_output': {
      const outputVal = payload.output || payload.result || payload.chunk || payload.answer
      if (agentId) {
        // 该 Agent 已完成产出（SUCCESS → 绿色），并回填 Token 用量与耗时
        sessionStore.setAgentStatus(agentId, 'SUCCESS')
        const thinkBlock = getOrCreateThinkBlock(agentId)
        thinkBlock.output = outputVal as string | Record<string, unknown>
        if (typeof payload.token_usage === 'number') thinkBlock.tokenUsage = payload.token_usage
        if (typeof payload.input_tokens === 'number') thinkBlock.inputTokens = payload.input_tokens
        if (typeof payload.output_tokens === 'number') thinkBlock.outputTokens = payload.output_tokens
        if (typeof payload.elapsed_ms === 'number') thinkBlock.durationMs = payload.elapsed_ms
        sessionStore.updateBlock(thinkBlock.id, {
          output: thinkBlock.output,
          tokenUsage: thinkBlock.tokenUsage,
          inputTokens: thinkBlock.inputTokens,
          outputTokens: thinkBlock.outputTokens,
          durationMs: thinkBlock.durationMs,
        })
      }
      
      // 如果也是向用户展示的文本块
      const chunk = typeof outputVal === 'string' ? outputVal : String(outputVal || '')
      if (chunk) {
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
      }
      break
    }

    case 'text_chunk':
    case 'text': {
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

    case 'citation':
      if (textBlockId) {
        sessionStore.updateBlock(textBlockId, {
          citingIds: payload.citing_ids as string[],
        } as Partial<Block>)
      }
      break

    case 'done': {
      sessionStore.finalizeBlocks(botMsgId)
      // Planning 拆解完成标记
      sessionStore.updatePlanning({ status: 'done' })
      // 需求理解暂停等待确认：不关闭思考弹窗、不追加 Feedback 块，等待用户确认后重新发起
      if (payload.paused) {
        textBlockId = null
        break
      }
      // 系统最终回复流式输出完成（done 事件）→ 自动关闭思考弹窗
      sessionStore.closeThinkingModal()
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

    case 'agent_error': {
      // 单个 Agent 执行失败（ERROR → 红色），并记录错误信息
      sessionStore.setAgentStatus(agentId, 'ERROR')
      const thinkBlock = getOrCreateThinkBlock(agentId)
      if (typeof payload.error_message === 'string' && payload.error_message) {
        thinkBlock.output = { error: payload.error_message } as string | Record<string, unknown>
      }
      if (typeof payload.elapsed_ms === 'number') thinkBlock.durationMs = payload.elapsed_ms
      sessionStore.updateBlock(thinkBlock.id, {
        output: thinkBlock.output,
        durationMs: thinkBlock.durationMs,
      })
      break
    }

    case 'error': {
      // 执行失败：标记当前 Agent 为 ERROR（红色），无具体 Agent 时标记所有进行中的为 ERROR
      if (agentId) {
        sessionStore.setAgentStatus(agentId, 'ERROR')
      } else {
        for (const [aid, info] of Object.entries(sessionStore.agentExecutions)) {
          if (info.status === 'RUNNING' || info.status === 'PENDING') {
            sessionStore.setAgentStatus(aid, 'ERROR')
          }
        }
      }
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
      sessionStore.closeThinkingModal()
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
            class="flex items-start gap-2"
            :class="entry.message.role === 'user' ? 'justify-start' : 'justify-end'"
            :data-info-id="entry.message.id"
          >
            <!-- 用户消息：靠左，头像在消息框左侧 -->
            <div v-if="entry.message.role === 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-brian-blue/15 text-brian-blue flex items-center justify-center mt-1">
              <UserRound :size="16" />
            </div>

            <div class="max-w-[85%] min-w-0">
              <!-- ===== 原始展示（保留参考）：对话区消息上方渲染长程多 Agent 协同依赖 DAG 网络（Planning 策略拆解卡片） =====
              <AgentDagFlow v-if="entry.message.agentDag" :dag="entry.message.agentDag" />
              -->

              <!-- ===== 修改后：对话区不展示 Planning 策略拆解（AgentDagFlow），拆解仅在"思考过程"弹窗内展示 ===== -->

              <MessageCard
                :id="entry.message.id"
                :info-id="entry.message.id"
                :role="entry.message.role"
                :content="entry.message.content"
                :summary="nodeOf(entry.message)?.summary || ''"
                :timestamp="entry.message.timestamp"
                :pin="nodeOf(entry.message)?.pin ?? entry.message.pin"
                :selected="sessionStore.selectedMsgIds.has(entry.message.id)"
                :cited-count="getCitedCount(entry.message)"
                :citing-count="getCitingCount(entry.message)"
                :cited-info-ids="getCitedIds(entry.message)"
                :citing-info-ids="getCitingIds(entry.message)"
                :trace-id="entry.message.traceId"
                :work-id="entry.message.workId"
                mode="timeline"
                :node-map="nodeMap"
                @toggle-select="sessionStore.toggleMsgSelection"
                @toggle-pin="togglePin"
                @click-card="centerMapOn"
                @jump-to="jumpTo"
                @show-thinking="showThinking"
                @show-eval="sessionStore.openEvalResult"
              />
            </div>

            <!-- 系统回复：靠右，大脑头像在消息框右侧 -->
            <div v-if="entry.message.role !== 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mt-1">
              <Brain :size="16" />
            </div>
          </div>

          <!-- 思考过程不展示在对话区（以弹窗形式展示），其余块正常渲染 -->
          <div v-else-if="entry.block.type !== 'ThinkingChain'" class="max-w-[85%]" :class="entry.block.role === 'user' ? 'ml-auto' : 'mr-auto'">
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

    <!-- 思考过程弹窗 -->
    <ThinkingModal />

    <!-- 评估结果弹窗 -->
    <EvalResultModal />

    <!-- 需求理解确认弹窗 -->
    <div
      v-if="sessionStore.intentConfirmation"
      class="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.self="handleIntentConfirm('CANCEL')"
    >
      <div class="w-full max-w-lg mx-4 rounded-2xl bg-white dark:bg-apple-gray-900 shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center justify-between">
          <h3 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-100">确认需求理解</h3>
          <button
            class="text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200"
            @click="handleIntentConfirm('CANCEL')"
          >✕</button>
        </div>
        <div class="px-6 py-4 space-y-3 text-sm">
          <div>
            <p class="text-xs text-apple-gray-400 mb-1">原始输入</p>
            <p class="text-apple-gray-700 dark:text-apple-gray-200">{{ sessionStore.intentConfirmation.original_query }}</p>
          </div>
          <div>
            <p class="text-xs text-apple-gray-400 mb-1">理解后的需求</p>
            <p class="text-apple-gray-700 dark:text-apple-gray-200">{{ sessionStore.intentConfirmation.understood_requirement }}</p>
          </div>
          <div>
            <p class="text-xs text-apple-gray-400 mb-1">匹配度</p>
            <p class="text-apple-gray-600 dark:text-apple-gray-300">
              {{ sessionStore.intentConfirmation.match_score }} / 阈值 {{ sessionStore.intentConfirmation.threshold_score }}
              <span class="ml-2 text-amber-500">（低于阈值，需确认）</span>
            </p>
          </div>
          <div v-if="sessionStore.intentConfirmation.reasoning">
            <p class="text-xs text-apple-gray-400 mb-1">判断依据</p>
            <p class="text-apple-gray-600 dark:text-apple-gray-300">{{ sessionStore.intentConfirmation.reasoning }}</p>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-apple-gray-100 dark:border-apple-gray-800 flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 rounded-lg text-sm text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 disabled:opacity-50"
            :disabled="confirmingIntent"
            @click="handleIntentConfirm('CANCEL')"
          >取消</button>
          <button
            class="px-4 py-2 rounded-lg text-sm text-apple-gray-600 bg-apple-gray-100 hover:bg-apple-gray-200 dark:bg-apple-gray-800 dark:text-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-50"
            :disabled="confirmingIntent"
            @click="handleIntentConfirm('KEEP')"
          >按原文执行</button>
          <button
            class="px-4 py-2 rounded-lg text-sm text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 flex items-center gap-1"
            :disabled="confirmingIntent"
            @click="handleIntentConfirm('APPROVE')"
          >
            <Loader2 v-if="confirmingIntent" :size="14" class="animate-spin" />
            按理解执行
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
