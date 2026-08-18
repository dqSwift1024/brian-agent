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

      // 布局：时间纵向（回复关系向下）、引用层级横向（引用关系从左到右）
      const nodes: ChatMapNode[] = msgNodes.map((n, idx) => ({
        id: String(n.info_id ?? n.id ?? ''),
        infoId: String(n.info_id ?? n.id ?? ''),
        infoType: String(n.info_type ?? ''),
        role: String(n.info_creator_role ?? ''),
        summary: String(n.info_summary ?? '').slice(0, 20),
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
        y: idx * 190 + 120,
      }))

      // 引用层级：引用方位于被引用方右侧（连线从被引用方右侧指向引用方左侧）
      const level = new Map<string, number>()
      for (const n of nodes) level.set(n.id, 0)
      let changed = true
      let guard = 0
      while (changed && guard++ < nodes.length + 2) {
        changed = false
        for (const e of edges) {
          if (e.edgeType !== 'CITATION') continue
          const srcLevel = level.get(e.source) ?? 0
          const tgtLevel = level.get(e.target) ?? 0
          if (srcLevel + 1 > tgtLevel) {
            level.set(e.target, srcLevel + 1)
            changed = true
          }
        }
      }
      for (const n of nodes) {
        n.x = (level.get(n.id) ?? 0) * 260
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

  return {
    currentSessionId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    agentChain, splitRatio, isStreaming, selectedMsgIds, citingMode,
    focusInfoId, centerInfoId,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadExchanges, loadDag,
    loadAgentChain, deleteSession, clearMessages, addMessage, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter,
    setStreaming, setCancelController, cancelCurrentTask
  }
})
