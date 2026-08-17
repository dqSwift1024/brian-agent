import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ChatMessage, ChatSession, DagNode, DagEdge, AgentChainNode, Block } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'

export const useSessionStore = defineStore('session', () => {
  const currentSessionId = ref(localStorage.getItem('chat-current-session-id') || '')
  const messages = shallowRef<ChatMessage[]>([])
  const blocks = ref<Block[]>([])
  const chatList = ref<ChatSession[]>([])
  const dagNodes = ref<DagNode[]>([])
  const dagEdges = ref<DagEdge[]>([])
  const dagWorkId = ref('')
  const agentChain = ref<AgentChainNode[]>([])
  const splitRatio = ref(parseFloat(localStorage.getItem('chat-split-ratio') || '0.65'))
  const isStreaming = ref(false)
  const cancelToken = ref<AbortController | null>(null)
  const selectedMsgIds = ref<Set<string>>(new Set())
  const citingMode = ref(false)

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

  async function loadChatHistory(sessionId: string, userId: string) {
    currentSessionId.value = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
    messages.value = await chatApi.history(sessionId, userId)
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
        .reverse()

      const idSet = new Set(msgNodes.map((n) => String(n.info_id ?? n.id ?? '')))
      const nodes: DagNode[] = msgNodes.map((n, idx) => {
        const isUser = n.info_type === 'REQUEST'
        return {
          id: String(n.info_id ?? n.id ?? ''),
          label: String(n.info_summary ?? '').slice(0, 20),
          x: isUser ? -170 : 170,
          y: idx * 140 + 300,
          status: isUser ? 'user' : 'assistant',
        }
      })
      const edges: DagEdge[] = rawEdges
        .filter((e) => idSet.has(String(e.from ?? '')) && idSet.has(String(e.to ?? '')))
        .map((e) => ({ source: String(e.from ?? ''), target: String(e.to ?? '') }))
      dagNodes.value = nodes
      dagEdges.value = edges
      dagWorkId.value = ''
    } catch { /* ignore */ }
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
    dagNodes.value = []
    dagEdges.value = []
    dagWorkId.value = ''
    agentChain.value = []
    currentSessionId.value = ''
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

  function toggleMsgSelection(msgId: string) {
    const next = new Set(selectedMsgIds.value)
    if (next.has(msgId)) next.delete(msgId)
    else next.add(msgId)
    selectedMsgIds.value = next
  }

  function toggleCitingMode() {
    citingMode.value = !citingMode.value
    if (!citingMode.value) selectedMsgIds.value = new Set()
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
    currentSessionId, messages, blocks, chatList, dagNodes, dagEdges, dagWorkId,
    agentChain, splitRatio, isStreaming, selectedMsgIds, citingMode,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadExchanges, loadDag,
    loadAgentChain, deleteSession, clearMessages, addMessage, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, toggleMsgSelection,
    toggleCitingMode, setStreaming, setCancelController, cancelCurrentTask
  }
})
