import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { ChatMessage, ChatSession, ChatMapNode, ChatMapEdge, AgentChainNode, Block, PlanningData, AgentDagData, AgentExecutionStatus, AgentRuntimeInfo } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'

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
  // 评估结果弹窗：展示某消息对应 work 的 Evolutor 评估评分 JSON
  const evalResultVisible = ref(false)
  const evalResultLoading = ref(false)
  const evalResult = ref<{ answer: string; created: number; elapsed_ms: number; agent_name: string } | null>(null)
  const evalResultError = ref('')
  const evalTraceId = ref('')

  // 需求理解确认弹窗：IntentAgent 匹配得分低于阈值时，由 intent_confirmation_required 事件驱动
  interface IntentConfirmation {
    session_id: string
    work_id: string
    interact_id: string
    original_query: string
    understood_requirement: string
    match_score: number
    threshold_score: number
    reasoning: string
  }
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

  // ===== 原始 loadChatHistory（保留参考） =====
  /*
  async function loadChatHistory(sessionId: string, userId: string) {
    currentSessionId.value = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
    messages.value = await chatApi.history(sessionId, userId)
  }
  */

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
      // ===== 原始代码（保留参考）：blocks 为空时为 assistant 消息构造 TextParagraph 兜底块 =====
      // 该兜底导致系统回复同时以 MessageCard（消息框）与 TextParagraph（纯文本段落）重复展示，
      // 不符合「避免与官方 MessageCard 产生双份重复渲染」的要求，故移除。系统回复内容统一由
      // messages 经 MessageCard 渲染，ThinkingChain 等思考块仅用于思考过程弹窗采集。
      // else if (msg.role === 'assistant' && msg.content) {
      //   loadedBlocks.push({
      //     id: `block-text-${msg.id}`,
      //     msgId: msg.id,
      //     role: 'assistant',
      //     type: 'TextParagraph',
      //     content: msg.content,
      //     meta: { status: 'done', createdAt: msg.timestamp || Date.now(), updatedAt: Date.now() },
      //   } as Block)
      // }
    }
    blocks.value = loadedBlocks
    triggerRef(blocks)
  }

  // ===== 原始 loadExchanges（保留参考）：请求 /api/chat/exchanges 后丢弃结果，属冗余无实际用途的请求 =====
  // async function loadExchanges(sessionId: string, userId: string) {
  //   try {
  //     await chatApi.exchanges(sessionId, userId)
  //   } catch { /* ignore */ }
  // }

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
          edgeType: (String(e.edge_type ?? '').toUpperCase().startsWith('QUESTION') ? 'QUESTION_ANSWER' : 'CITATION') as ChatMapEdge['edgeType'],
        })
      }

      // ===== 原始布局（保留参考）=====
      /*
      // 布局：时间纵向（回复关系向下）、引用层级横向（引用关系从左到右）
      const nodes: ChatMapNode[] = msgNodes.map((n, idx) => ({ ... x: 0, y: idx * 190 + 120 }))
      // 引用层级：引用方位于被引用方右侧
      const level = new Map<string, number>()
      ... 仅对 CITATION 边传播层级 ...
      for (const n of nodes) { n.x = (level.get(n.id) ?? 0) * 260 }
      */

      // ===== 修改后的布局 =====
      // 规则1：对用户提问的系统回答放在提问正下方（问答同列，回答位于提问下方一行）
      // 规则2：引用方与被引用方的最下面的一个消息框处于相同的纵坐标（引用两边对齐底部行）
      // 消息框尺寸放大 1.5 倍后，同步放大行高/列宽/基准偏移，避免节点重叠
      const NODE_MAP_ROW_H = 285
      const NODE_MAP_COL_W = 390
      const NODE_MAP_BASE_Y = 180

      const nodes: ChatMapNode[] = msgNodes.map((n) => ({
        id: String(n.info_id ?? n.id ?? ''),
        infoId: String(n.info_id ?? n.id ?? ''),
        infoType: String(n.info_type ?? ''),
        role: String(n.info_creator_role ?? ''),
        // ===== 原始代码（保留作为参考） =====
        // summary: String(n.info_summary ?? '').slice(0, 20),
        // ===== 修改后的代码：保留完整摘要（不做 20 字截断） =====
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

      // 列（x）：问答回复关系同列（回答位于提问正下方）；引用层级向右展开（引用方位于被引用方右侧）
      const level = new Map<string, number>()
      for (const n of nodes) level.set(n.id, 0)
      let changed = true
      let guard = 0
      while (changed && guard++ < nodes.length + 2) {
        changed = false
        for (const e of edges) {
          if (e.edgeType === 'QUESTION_ANSWER') {
            const srcLevel = level.get(e.source) ?? 0
            const tgtLevel = level.get(e.target) ?? 0
            if (tgtLevel !== srcLevel) {
              level.set(e.target, srcLevel)
              changed = true
            }
          } else if (e.edgeType === 'CITATION') {
            const srcLevel = level.get(e.source) ?? 0
            const tgtLevel = level.get(e.target) ?? 0
            if (srcLevel + 1 > tgtLevel) {
              level.set(e.target, srcLevel + 1)
              changed = true
            }
          }
        }
      }

      // 行（y）：
      // 1) 问答边连接的 REQUEST+RESPONSE 归为同一个「消息列」（party），回答放在提问正下方
      const ufParent = new Map<string, string>()
      const find = (id: string): string => {
        let root = ufParent.get(id) ?? id
        if (root !== id) {
          ufParent.set(id, find(root))
          root = ufParent.get(id) ?? id
        }
        return root
      }
      const union = (a: string, b: string) => {
        const ra = find(a)
        const rb = find(b)
        if (ra !== rb) ufParent.set(rb, ra)
      }
      for (const n of nodes) ufParent.set(n.id, n.id)
      for (const e of edges) {
        if (e.edgeType === 'QUESTION_ANSWER') union(e.source, e.target)
      }

      const partyNodes = new Map<string, ChatMapNode[]>()
      for (const n of nodes) {
        const root = find(n.id)
        if (!partyNodes.has(root)) partyNodes.set(root, [])
        partyNodes.get(root)!.push(n)
      }

      // 2) 引用边将引用方与被引用方的消息列归入同一个「行带」，行带内所有消息列共享底部行
      const bandParent = new Map<string, string>()
      const bandFind = (root: string): string => {
        let band = bandParent.get(root) ?? root
        if (band !== root) {
          bandParent.set(root, bandFind(band))
          band = bandParent.get(root) ?? root
        }
        return band
      }
      const bandUnion = (a: string, b: string) => {
        const ra = bandFind(a)
        const rb = bandFind(b)
        if (ra !== rb) bandParent.set(rb, ra)
      }
      for (const root of partyNodes.keys()) bandParent.set(root, root)
      for (const e of edges) {
        if (e.edgeType !== 'CITATION') continue
        bandUnion(find(e.source), find(e.target))
      }

      // 3) 行带按时间先后排序，依次分配底部行索引（行带之间留一行间距）
      const bandNodes = new Map<string, ChatMapNode[]>()
      for (const [root, list] of partyNodes) {
        const band = bandFind(root)
        if (!bandNodes.has(band)) bandNodes.set(band, [])
        for (const n of list) bandNodes.get(band)!.push(n)
      }
      const nodeIndex = new Map<string, number>()
      nodes.forEach((n, i) => nodeIndex.set(n.id, i))
      const bands = [...bandNodes.entries()].sort((a, b) => {
        const aEarliest = a[1].reduce((x, y) => (y.created < x.created ? y : x))
        const bEarliest = b[1].reduce((x, y) => (y.created < x.created ? y : x))
        if (aEarliest.created !== bEarliest.created) return aEarliest.created - bEarliest.created
        return (nodeIndex.get(aEarliest.id) ?? 0) - (nodeIndex.get(bEarliest.id) ?? 0)
      })
      const bandBottomRow = new Map<string, number>()
      let nextTopRow = 0
      for (const [band, list] of bands) {
        const hasStack = list.some((n) => n.infoType === 'RESPONSE') && list.some((n) => n.infoType === 'REQUEST')
        const bottomRow = nextTopRow + (hasStack ? 1 : 0)
        bandBottomRow.set(band, bottomRow)
        nextTopRow = bottomRow + 2
      }

      // 4) 计算每个节点坐标：回答位于提问正下方；行带内最下面的消息框纵坐标一致
      for (const [root, list] of partyNodes) {
        const bottomRow = bandBottomRow.get(bandFind(root)) ?? 0
        const hasResponse = list.some((n) => n.infoType === 'RESPONSE')
        for (const n of list) {
          n.x = (level.get(n.id) ?? 0) * NODE_MAP_COL_W
          const row = n.infoType === 'RESPONSE' ? bottomRow : (hasResponse ? bottomRow - 1 : bottomRow)
          n.y = row * NODE_MAP_ROW_H + NODE_MAP_BASE_Y
        }
      }

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

  // ===== 原始 openThinkingModal / closeThinkingModal（保留参考） =====
  /*
  function openThinkingModal(msgId: string | null = null, blocks: Block[] = []) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = blocks
    thinkingModalVisible.value = true
  }

  function closeThinkingModal() {
    thinkingModalVisible.value = false
    thinkingTargetMsgId.value = null
    thinkingBlocks.value = []
  }
  */

  // ===== 原始 openThinkingModal / closeThinkingModal（保留参考） =====
  /*
  function openThinkingModal(msgId: string | null = null, blocks: Block[] = [], dag: AgentDagData | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = blocks
    thinkingDag.value = dag
    thinkingModalVisible.value = true
  }

  function closeThinkingModal() {
    thinkingModalVisible.value = false
    thinkingTargetMsgId.value = null
    thinkingBlocks.value = []
    thinkingDag.value = null
    resetPlanning()
    resetAgentStatus()
  }
  */

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

  // 记录某 Agent 的执行状态，并同步到 AgentDAG 节点（供"思考过程"弹窗 AgentDAG 状态着色与执行联动）
  function setAgentStatus(agentId: string, status: AgentExecutionStatus, agentName?: string) {
    if (!agentId) return
    agentExecutions.value = {
      ...agentExecutions.value,
      [agentId]: {
        status,
        agentName: agentName ?? agentExecutions.value[agentId]?.agentName,
        updatedAt: Date.now(),
      },
    }

    const dag = planning.value.agentDag
    if (dag && dag.nodes.length > 0) {
      // 按 agentId 匹配节点：同一 Agent 可复用到多个任务节点，需同步更新全部匹配节点
      // （节点主键 id 为 task_id，仅保证画布唯一性，不再承载 agent 关联）。
      const matched = dag.nodes.filter((n) => n.agentId === agentId)
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
  }

  return {
    currentSessionId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    agentChain, splitRatio, isStreaming, selectedMsgIds, citingMode,
    focusInfoId, centerInfoId, thinkingModalVisible, thinkingTargetMsgId, thinkingBlocks,
    thinkingLoading, dagLoading, blocksLoading,
    planning, thinkingDag, agentExecutions, thinkingOrigin,
    setThinkingOrigin, clearThinkingOrigin,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadDag,
    loadAgentChain, deleteSession, clearMessages, addMessage, replaceUserMessageContent, removeUserMessageByContent, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter,
    setStreaming, setCancelController, cancelCurrentTask,
    startThinkingLoading, setThinkingDag, setThinkingBlocks,
    openThinkingModal, closeThinkingModal, requestAutoCloseThinkingModal, resetPlanning, updatePlanning,
    setAgentStatus, resetAgentStatus,
    evalResultVisible, evalResultLoading, evalResult, evalResultError, evalTraceId,
    openEvalResult, closeEvalResult,
    intentConfirmation, setIntentConfirmation, clearIntentConfirmation
  }
})
