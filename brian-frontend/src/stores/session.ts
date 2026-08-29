import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { ChatMessage, ChatSession, ChatMapNode, ChatMapEdge, AgentChainNode, Block, PlanningData, AgentDagData, AgentExecutionStatus, AgentRuntimeInfo, IntentConfirmation, ClarificationRequest } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'
import { layoutChatMap } from '@/utils/chatMapLayout'

function mapEdgeType(type: string): ChatMapEdge['edgeType'] {
  const upper = type.toUpperCase()
  if (upper.startsWith('QUESTION')) return 'QUESTION_ANSWER'
  if (upper === 'FOLLOW_UP') return 'FOLLOW_UP'
  return 'CITATION'
}

export const useSessionStore = defineStore('session', () => {
  const currentSessionId = ref(localStorage.getItem('chat-current-session-id') || '')
  const messages = shallowRef<ChatMessage[]>([])
  const blocks = shallowRef<Block[]>([])
  const chatList = ref<ChatSession[]>([])
  const chatMapNodes = ref<ChatMapNode[]>([])
  const chatMapEdges = ref<ChatMapEdge[]>([])
  const agentChain = ref<AgentChainNode[]>([])
  const splitRatio = ref(parseFloat(localStorage.getItem('chat-split-ratio') || '0.65'))
  const isStreaming = ref(false)
  const cancelToken = ref<AbortController | null>(null)
  const selectedMsgIds = ref<Set<string>>(new Set())
  const citingMode = ref(false)
  // ChatMap 与对话列表双向定位：focusInfoId 由 ChatMap 触发滚动列表，centerInfoId 由列表触发平移 ChatMap
  const focusInfoId = ref<string | null>(null)
  const centerInfoId = ref<string | null>(null)
  // 思考过程弹窗：targetMsgId 为空时展示当前流式思考，否则展示后端接口采集的指定消息思考过程
  const thinkingModalVisible = ref(false)
  const thinkingTargetMsgId = ref<string | null>(null)
  const thinkingBlocks = ref<Block[]>([])
  // 思考过程各模块独立/整体加载状态
  const thinkingLoading = ref(false)
  const dagLoading = ref(false)
  const blocksLoading = ref(false)
  // Planning 策略拆解：planning 为流式期间的实时拆解数据，thinkingDag 为指定消息接口采集的拆解数据
  const planning = ref<PlanningData>({ status: 'idle' })
  const thinkingDag = ref<AgentDagData | null>(null)
  // 思考过程弹窗动画原点（"思考过程"按钮的视口矩形），供入场/退场 FLIP 动画使用
  const thinkingOrigin = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  // 弹窗打开时刻（用于自动关闭的 5 秒最小展示时长判定）
  const thinkingOpenedAt = ref(0)
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null
  // 每个 Agent 独立的执行运行时状态（思考中/成功/失败），key = agent_id
  const agentExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  // 每个任务节点的执行运行时状态（同一 Agent 复用到多个任务时按 task_id 精确区分），key = task_id
  const taskExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  // 评估结果弹窗：展示某消息对应 work 的 Evolutor 评估评分 JSON
  const evalResultVisible = ref(false)
  const evalResultLoading = ref(false)
  const evalResult = ref<{ answer: string; created: number; elapsed_ms: number; agent_name: string } | null>(null)
  const evalResultError = ref('')
  const evalTraceId = ref('')

  // 需求理解确认弹窗：IntentAgent 匹配得分低于阈值时，由 intent_confirmation_required 事件驱动
  const intentConfirmation = ref<IntentConfirmation | null>(null)

  function setIntentConfirmation(data: Record<string, unknown> | null) {
    if (!data) {
      intentConfirmation.value = null
      return
    }
    intentConfirmation.value = {
      session_id: String(data.session_id ?? ''),
      work_id: String(data.work_id ?? ''),
      interact_id: String(data.interact_id ?? ''),
      original_query: String(data.original_query ?? ''),
      understood_requirement: String(data.understood_requirement ?? ''),
      match_score: Number(data.match_score ?? 0),
      threshold_score: Number(data.threshold_score ?? 0),
      reasoning: String(data.reasoning ?? ''),
    }
  }

  function clearIntentConfirmation() {
    intentConfirmation.value = null
  }

  // 需求补充弹窗：Planner 识别出需用户补充参数才能执行的任务时，由 clarification_required 事件驱动
  const clarificationRequest = ref<ClarificationRequest | null>(null)

  function setClarificationRequest(data: Record<string, unknown> | null) {
    if (!data) {
      clarificationRequest.value = null
      return
    }
    const raw = Array.isArray(data.clarifications) ? data.clarifications : []
    clarificationRequest.value = {
      session_id: String(data.session_id ?? ''),
      work_id: String(data.work_id ?? ''),
      interact_id: String(data.interact_id ?? ''),
      original_query: String(data.original_query ?? ''),
      clarifications: raw
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => ({
          question: String((c as Record<string, unknown>).question ?? ''),
          domain: (c as Record<string, unknown>).domain
            ? String((c as Record<string, unknown>).domain)
            : undefined,
          answer: '',
        }))
        .filter((c) => c.question),
    }
  }

  function clearClarificationRequest() {
    clarificationRequest.value = null
  }

  function setSplitRatio(ratio: number) {
    splitRatio.value = Math.max(0.2, Math.min(0.8, ratio))
    localStorage.setItem('chat-split-ratio', String(splitRatio.value))
  }

  async function loadChatList(userId: string) {
    chatList.value = await chatApi.list(userId)
  }

  async function ensureSession(): Promise<string> {
    if (currentSessionId.value) {
      // 校验本地缓存的会话是否真实存在于后端，避免使用失效/本地伪造的 session_id
      try {
        await chatApi.getSessionDetail(currentSessionId.value)
        return currentSessionId.value
      } catch {
        /* 会话已不存在，落入下方创建新会话 */
      }
    }
    const created = await chatApi.createSession()
    currentSessionId.value = created.session_id
    localStorage.setItem('chat-current-session-id', created.session_id)
    return created.session_id
  }

  // ===== 修改后的 loadChatHistory：加载历史消息并提取恢复各 Agent 的 ThinkingBlocks =====
  async function loadChatHistory(sessionId: string, userId: string) {
    currentSessionId.value = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
    const historyMsgs = await chatApi.history(sessionId, userId)
    messages.value = historyMsgs

    // 从消息记录的 blocks 数组中恢复 ThinkingBlocks
    const loadedBlocks: Block[] = []
    for (const msg of historyMsgs) {
      if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
        for (const b of msg.blocks) {
          loadedBlocks.push(b)
        }
      }
    }
    blocks.value = loadedBlocks
    triggerRef(blocks)
  }

  async function loadDag(sessionId: string, _userId: string) {
    try {
      // ChatMap 展示消息关系图谱（一问一答 + 引用），而非 Agent 执行 DAG
      const result = await visualizationApi.messageDAG({
        session_id: sessionId,
        include_question_answer_edges: true,
        include_citation_edges: true,
      })
      const rawNodes = (result.graph?.nodes ?? []) as Array<Record<string, unknown>>
      const rawEdges = (result.graph?.edges ?? []) as Array<Record<string, unknown>>

      const msgNodes = rawNodes
        .filter((n) => n.info_type === 'REQUEST' || n.info_type === 'RESPONSE')
        .sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0))

      const idSet = new Set(msgNodes.map((n) => String(n.info_id ?? n.id ?? '')))
      const edgePairSet = new Set<string>()
      const edges: ChatMapEdge[] = []
      for (const e of rawEdges) {
        const from = String(e.from ?? '')
        const to = String(e.to ?? '')
        if (!idSet.has(from) || !idSet.has(to) || from === to) continue
        const pairKey = `${from}->${to}`
        if (edgePairSet.has(pairKey)) continue
        edgePairSet.add(pairKey)
        edges.push({
          source: from,
          target: to,
          edgeType: mapEdgeType(String(e.edge_type ?? '')),
        })
      }

      // ===== 布局：顺序问答纵向排布、引用问答横向展开 =====
      // 布局算法抽离至 @/utils/chatMapLayout（纯函数，便于单元测试）：
      // - QUESTION_ANSWER / FOLLOW_UP：纵向排布（回答/追问在提问正下方）
      // - CITATION：引用方放在被引用方右边，且与被引用消息中最靠下的一个顶部对齐
      const nodes: ChatMapNode[] = msgNodes.map((n) => ({
        id: String(n.info_id ?? n.id ?? ''),
        infoId: String(n.info_id ?? n.id ?? ''),
        infoType: String(n.info_type ?? ''),
        role: String(n.info_creator_role ?? ''),
        summary: String(n.info_summary ?? ''),
        info: String(n.info ?? ''),
        infoLength: Number(n.info_length ?? 0),
        created: Number(n.created ?? 0),
        pin: Boolean(n.pin),
        citingCount: Number(n.citing_count ?? 0),
        citedCount: Number(n.cited_count ?? 0),
        citingInfoIds: (n.citing_info_ids as string[]) ?? [],
        citedInfoIds: (n.cited_info_ids as string[]) ?? [],
        workId: n.work_id ? String(n.work_id) : undefined,
        interactId: n.interact_id ? String(n.interact_id) : undefined,
        traceId: n.trace_id ? String(n.trace_id) : undefined,
        handleResultType: n.handle_result_type ? String(n.handle_result_type) : undefined,
        x: 0,
        y: 0,
      }))

      layoutChatMap(nodes, edges)

      chatMapNodes.value = nodes
      chatMapEdges.value = edges
    } catch { /* ignore */ }
  }

  async function togglePin(infoId: string) {
    try {
      const res = await chatApi.pinMessage(infoId)
      const node = chatMapNodes.value.find(n => n.infoId === infoId)
      if (node) node.pin = res.pin
      return res.pin
    } catch { return false }
  }

  async function loadAgentChain(exchangeId: string) {
    agentChain.value = await chatApi.agentChain(exchangeId)
  }

  async function deleteSession(sessionId: string) {
    await chatApi.deleteSession(sessionId)
    chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
    if (sessionId === currentSessionId.value) {
      clearMessages()
    }
  }

  function clearMessages() {
    messages.value = []
    blocks.value = []
    triggerRef(blocks)
    chatMapNodes.value = []
    chatMapEdges.value = []
    agentChain.value = []
    currentSessionId.value = ''
    selectedMsgIds.value = new Set()
    citingMode.value = false
    resetPlanning()
    thinkingDag.value = null
    agentExecutions.value = {}
    taskExecutions.value = {}
    localStorage.removeItem('chat-current-session-id')
  }

  function addMessage(msg: ChatMessage) {
    messages.value = [...messages.value, msg]
  }

  // 按内容（从后往前）定位最近一条用户消息，用理解后的需求替换其原始输入
  function replaceUserMessageContent(originalContent: string, newContent: string) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i]
      if (m.role === 'user' && m.content === originalContent) {
        const next = [...messages.value]
        next[i] = { ...next[i], content: newContent }
        messages.value = next
        return
      }
    }
  }

  // 按内容（从后往前）定位最近一条用户消息并移除（取消需求理解时丢弃用户原始输入）
  function removeUserMessageByContent(originalContent: string) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i]
      if (m.role === 'user' && m.content === originalContent) {
        messages.value = [...messages.value.slice(0, i), ...messages.value.slice(i + 1)]
        return
      }
    }
  }

  function addBlock(block: Block) {
    const existing = blocks.value.findIndex(b => b.id === block.id)
    if (existing >= 0) {
      blocks.value[existing] = block
    } else {
      blocks.value.push(block)
    }
    triggerRef(blocks)
  }

  function updateBlock(blockId: string, updates: Partial<Block>) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      blocks.value[idx] = { ...blocks.value[idx], ...updates } as Block
      triggerRef(blocks)
    }
  }

  function appendBlockContent(blockId: string, text: string) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      const block = blocks.value[idx]
      if ('content' in block) {
        (block as { content: string }).content += text
        triggerRef(blocks)
      }
    }
  }

  function finalizeBlocks(msgId: string) {
    for (let i = 0; i < blocks.value.length; i++) {
      if (blocks.value[i].msgId === msgId) {
        blocks.value[i] = { ...blocks.value[i], meta: { ...blocks.value[i].meta, status: 'done' as const } } as Block
      }
    }
    triggerRef(blocks)
  }

  // ===== 最终回复开始流式输出时，将仍处于 streaming 的思考块收敛为 done =====
  // 思考块（ThinkingChain）此前仅在 done 事件才被 finalizeBlocks 置为 done，
  // 但最终回复（text_chunk）在 done 之前就开始流式输出，导致「思考过程」弹窗
  // 在系统回复已展示时仍因残留 streaming 状态而显示「思考中...」。
  function finalizeThinkingBlocks(msgId: string) {
    let changed = false
    for (let i = 0; i < blocks.value.length; i++) {
      const b = blocks.value[i]
      if (b.msgId === msgId && b.type === 'ThinkingChain' && b.meta?.status === 'streaming') {
        blocks.value[i] = { ...b, meta: { ...b.meta, status: 'done' as const } } as Block
        changed = true
      }
    }
    if (changed) triggerRef(blocks)
  }

  function cleanupTransientTextBlocks(msgId: string) {
    const filtered = blocks.value.filter(b => !(b.msgId === msgId && b.type === 'TextParagraph'))
    if (filtered.length !== blocks.value.length) {
      blocks.value.length = 0
      blocks.value.push(...filtered)
      triggerRef(blocks)
    }
  }

  function toggleMsgSelection(msgId: string) {
    const next = new Set(selectedMsgIds.value)
    if (next.has(msgId)) next.delete(msgId)
    else next.add(msgId)
    selectedMsgIds.value = next
  }

  function toggleCitingMode() {
    citingMode.value = !citingMode.value
  }

  function clearSelection() {
    selectedMsgIds.value = new Set()
  }

  function triggerFocus(infoId: string) {
    focusInfoId.value = infoId
  }

  function triggerCenter(infoId: string) {
    centerInfoId.value = infoId
  }

  function setStreaming(streaming: boolean) {
    isStreaming.value = streaming
  }

  function setCancelController(ctrl: AbortController | null) {
    cancelToken.value = ctrl
  }

  function cancelCurrentTask() {
    cancelToken.value?.abort()
    cancelToken.value = null
    isStreaming.value = false
  }

  // ===== 修改后的 openThinkingModal 与独立模块加载状态管理 =====
  function setThinkingOrigin(rect: { left: number; top: number; width: number; height: number } | null) {
    thinkingOrigin.value = rect
  }

  function clearThinkingOrigin() {
    thinkingOrigin.value = null
  }

  function startThinkingLoading(msgId: string | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingLoading.value = true
    dagLoading.value = true
    blocksLoading.value = true
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
  }

  function setThinkingDag(dag: AgentDagData | null) {
    thinkingDag.value = dag
    dagLoading.value = false
    if (!blocksLoading.value) {
      thinkingLoading.value = false
    }
  }

  function setThinkingBlocks(blocks: Block[]) {
    thinkingBlocks.value = blocks
    blocksLoading.value = false
    if (!dagLoading.value) {
      thinkingLoading.value = false
    }
  }

  function openThinkingModal(msgId: string | null = null, blocks: Block[] = [], dag: AgentDagData | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = blocks
    thinkingDag.value = dag
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
  }

  function closeThinkingModal() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer)
      autoCloseTimer = null
    }
    thinkingModalVisible.value = false
    thinkingTargetMsgId.value = null
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
    resetPlanning()
    resetAgentStatus()
    // thinkingOrigin 保留至退场动画结束后由 ThinkingModal 调用 clearThinkingOrigin 清除
  }

  // ===== 自动关闭：收到关闭事件且弹窗已展示超过 5 秒才关闭；不足 5 秒则延迟到满 5 秒后关闭 =====
  function requestAutoCloseThinkingModal() {
    if (!thinkingModalVisible.value) return
    const MIN_OPEN_MS = 5000
    const elapsed = Date.now() - thinkingOpenedAt.value
    const remaining = MIN_OPEN_MS - elapsed
    if (remaining <= 0) {
      closeThinkingModal()
      return
    }
    if (autoCloseTimer) clearTimeout(autoCloseTimer)
    autoCloseTimer = setTimeout(() => {
      autoCloseTimer = null
      closeThinkingModal()
    }, remaining)
  }

  // ===== 评估结果弹窗：打开时按 info_id 拉取 Evolutor 评估结果并展示 =====
  async function openEvalResult(infoId: string) {
    evalResultVisible.value = true
    evalResultLoading.value = true
    evalResult.value = null
    evalResultError.value = ''
    evalTraceId.value = ''
    try {
      const res = await chatApi.evalResult(infoId)
      evalTraceId.value = res.trace_id || ''
      if (res.found && res.evaluation) {
        evalResult.value = res.evaluation
      } else {
        evalResultError.value = '暂无评估结果（评估可能尚未完成，稍后重试）'
      }
    } catch (e) {
      evalResultError.value = e instanceof Error ? e.message : '加载评估结果失败'
    } finally {
      evalResultLoading.value = false
    }
  }

  function closeEvalResult() {
    evalResultVisible.value = false
    evalResult.value = null
    evalResultError.value = ''
    evalResultLoading.value = false
    evalTraceId.value = ''
  }

  // Planning 拆解状态管理（流式期间实时更新）
  function resetPlanning() {
    planning.value = { status: 'idle' }
  }

  function updatePlanning(patch: Partial<PlanningData>) {
    planning.value = { ...planning.value, ...patch } as PlanningData
  }

  // ===== Agent 执行运行时状态管理（每个 Agent 独立的"思考中"状态） =====
  const NODE_STATUS_MAP: Record<AgentExecutionStatus, string> = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    SUCCESS: 'COMPLETED',
    ERROR: 'EXEC_FAILED',
  }

  // ===== 记录某 Agent 的执行状态，并同步到 AgentDAG 节点（供"思考过程"弹窗 AgentDAG 状态着色与执行联动） =====
  // 状态只能向前推进：PENDING → RUNNING → SUCCESS/ERROR，不允许回退（如 SUCCESS → RUNNING）
  const STATUS_ORDER: Record<AgentExecutionStatus, number> = {
    PENDING: 0,
    RUNNING: 1,
    SUCCESS: 2,
    ERROR: 2,
  }

  function setAgentStatus(agentId: string | undefined, status: AgentExecutionStatus, agentName?: string, taskId?: string) {
    if (!agentId && !taskId) return

    // 1) Agent 级运行时状态（供"执行过程"卡片展示），按 agent_id 向前推进
    if (agentId) {
      const prev = agentExecutions.value[agentId]
      const prevOrder = prev ? (STATUS_ORDER[prev.status] ?? 0) : -1
      const newOrder = STATUS_ORDER[status] ?? 0
      if (!prev || newOrder >= prevOrder) {
        agentExecutions.value = {
          ...agentExecutions.value,
          [agentId]: {
            status,
            agentName: agentName ?? prev?.agentName,
            updatedAt: Date.now(),
          },
        }
      }
    }

    // 2) Task 级运行时状态（供 AgentDAG 节点着色），按 task_id 向前推进
    const taskKey = taskId || ''
    if (taskKey) {
      const tPrev = taskExecutions.value[taskKey]
      const tPrevOrder = tPrev ? (STATUS_ORDER[tPrev.status] ?? 0) : -1
      const tNewOrder = STATUS_ORDER[status] ?? 0
      if (!tPrev || tNewOrder >= tPrevOrder) {
        taskExecutions.value = {
          ...taskExecutions.value,
          [taskKey]: { status, agentName: agentName ?? tPrev?.agentName, updatedAt: Date.now() },
        }
      }
    }

    // 3) 同步 AgentDAG 节点状态：优先按 task_id 精确定位节点（同一 Agent 复用多任务时避免广播）
    const dag = planning.value.agentDag
    if (dag && dag.nodes.length > 0) {
      const matched = taskKey
        ? dag.nodes.filter((n) => n.taskId === taskKey || n.id === taskKey)
        : dag.nodes.filter((n) => n.agentId === agentId)
      if (matched.length > 0) {
        for (const node of matched) {
          if (agentName) {
            node.agentName = agentName
            if (!node.label || node.label.startsWith('任务 ') || node.label.startsWith('Task ')) {
              node.label = agentName
            }
          }
          node.status = NODE_STATUS_MAP[status]
        }
        planning.value = { ...planning.value, agentDag: { ...dag, nodes: [...dag.nodes] } }
      }
    }
  }

  function resetAgentStatus() {
    agentExecutions.value = {}
    taskExecutions.value = {}
  }

  return {
    currentSessionId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    agentChain, splitRatio, isStreaming, selectedMsgIds, citingMode,
    focusInfoId, centerInfoId, thinkingModalVisible, thinkingTargetMsgId, thinkingBlocks,
    thinkingLoading, dagLoading, blocksLoading,
    planning, thinkingDag, agentExecutions, taskExecutions, thinkingOrigin,
    setThinkingOrigin, clearThinkingOrigin,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadDag,
    loadAgentChain, deleteSession, clearMessages, addMessage, replaceUserMessageContent, removeUserMessageByContent, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, finalizeThinkingBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter,
    setStreaming, setCancelController, cancelCurrentTask,
    startThinkingLoading, setThinkingDag, setThinkingBlocks,
    openThinkingModal, closeThinkingModal, requestAutoCloseThinkingModal, resetPlanning, updatePlanning,
    setAgentStatus, resetAgentStatus,
    evalResultVisible, evalResultLoading, evalResult, evalResultError, evalTraceId,
    openEvalResult, closeEvalResult,
    intentConfirmation, setIntentConfirmation, clearIntentConfirmation,
    clarificationRequest, setClarificationRequest, clearClarificationRequest
  }
})
