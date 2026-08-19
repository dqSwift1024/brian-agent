import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ChatMessage, ChatSession, ChatMapNode, ChatMapEdge, AgentChainNode, Block } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'

export const useSessionStore = defineStore('session', () => {
  const currentSessionId = ref(localStorage.getItem('chat-current-session-id') || '')
  const messages = shallowRef<ChatMessage[]>([])
  const blocks = ref<Block[]>([])
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
    }
    blocks.value = loadedBlocks
  }

  async function loadExchanges(sessionId: string, userId: string) {
    try {
      await chatApi.exchanges(sessionId, userId)
    } catch { /* ignore */ }
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
      const NODE_MAP_ROW_H = 190
      const NODE_MAP_COL_W = 260
      const NODE_MAP_BASE_Y = 120

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
    chatMapNodes.value = []
    chatMapEdges.value = []
    agentChain.value = []
    currentSessionId.value = ''
    selectedMsgIds.value = new Set()
    citingMode.value = false
    localStorage.removeItem('chat-current-session-id')
  }

  function addMessage(msg: ChatMessage) {
    messages.value = [...messages.value, msg]
  }

  function addBlock(block: Block) {
    const existing = blocks.value.findIndex(b => b.id === block.id)
    if (existing >= 0) {
      blocks.value[existing] = block
      blocks.value = [...blocks.value]
    } else {
      blocks.value = [...blocks.value, block]
    }
  }

  function updateBlock(blockId: string, updates: Partial<Block>) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      blocks.value[idx] = { ...blocks.value[idx], ...updates } as Block
      blocks.value = [...blocks.value]
    }
  }

  function appendBlockContent(blockId: string, text: string) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      const block = blocks.value[idx]
      if ('content' in block) {
        (block as { content: string }).content += text
        blocks.value = [...blocks.value]
      }
    }
  }

  function finalizeBlocks(msgId: string) {
    blocks.value = blocks.value.map(b =>
      b.msgId === msgId ? { ...b, meta: { ...b.meta, status: 'done' as const } } as Block : b
    )
  }

  function cleanupTransientTextBlocks(msgId: string) {
    blocks.value = blocks.value.filter(b => !(b.msgId === msgId && b.type === 'TextParagraph'))
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

  return {
    currentSessionId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    agentChain, splitRatio, isStreaming, selectedMsgIds, citingMode,
    focusInfoId, centerInfoId, thinkingModalVisible, thinkingTargetMsgId, thinkingBlocks,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadExchanges, loadDag,
    loadAgentChain, deleteSession, clearMessages, addMessage, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter,
    setStreaming, setCancelController, cancelCurrentTask,
    openThinkingModal, closeThinkingModal
  }
})
