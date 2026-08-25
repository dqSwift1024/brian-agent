// ChatMap 消息关系图布局：将「顺序问答」与「引用问答」两种模式排布到二维画布。
//
// 规则：
// - QUESTION_ANSWER（问题→回答）：回答放在问题正下方（同列，纵向）。
// - FOLLOW_UP（上一回答→本次提问）：追问放在上一回答正下方（同列，纵向衔接）。
// - CITATION（被引用→引用方）：引用方放在被引用方右边（横向），
//   且引用方与被引用消息中「行最大（最靠下）」的那一个顶部对齐。

export type ChatMapEdgeType = 'QUESTION_ANSWER' | 'CITATION' | 'FOLLOW_UP'

export interface ChatMapLayoutNode {
  id: string
  infoType: string
  created: number
  x: number
  y: number
}

export interface ChatMapLayoutEdge {
  source: string
  target: string
  edgeType: ChatMapEdgeType
}

export const CHAT_MAP_ROW_H = 285
export const CHAT_MAP_COL_W = 390
export const CHAT_MAP_BASE_Y = 180

const RESPONSE_TYPE = 'RESPONSE'

/** 就地计算每个节点的 x / y 坐标。 */
export function layoutChatMap(nodes: ChatMapLayoutNode[], edges: ChatMapLayoutEdge[]): void {
  const ordered = [...nodes].sort((a, b) => a.created - b.created)
  const incoming = buildIncoming(edges)
  const col = new Map<string, number>()
  const row = new Map<string, number>()
  let maxRow = -1

  for (const node of ordered) {
    if (!tryPlace(node, incoming, col, row)) {
      col.set(node.id, 0)
      row.set(node.id, maxRow + 1)
    }
    maxRow = Math.max(maxRow, row.get(node.id) ?? 0)
  }

  applyCoordinates(nodes, col, row)
}

function buildIncoming(edges: ChatMapLayoutEdge[]): Map<string, ChatMapLayoutEdge[]> {
  const map = new Map<string, ChatMapLayoutEdge[]>()
  for (const e of edges) {
    if (!map.has(e.target)) map.set(e.target, [])
    map.get(e.target)!.push(e)
  }
  return map
}

function tryPlace(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
): boolean {
  if (node.infoType === RESPONSE_TYPE) {
    return placeResponse(node, incoming, col, row)
  }
  return placeRequest(node, incoming, col, row)
}

function placeResponse(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
): boolean {
  const qa = incoming.get(node.id)?.find((e) => e.edgeType === 'QUESTION_ANSWER')
  if (!qa) return false
  col.set(node.id, col.get(qa.source) ?? 0)
  row.set(node.id, (row.get(qa.source) ?? 0) + 1)
  return true
}

function placeRequest(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
): boolean {
  const ins = incoming.get(node.id) ?? []
  const citations = ins.filter((e) => e.edgeType === 'CITATION')
  if (citations.length > 0) {
    return placeCited(node, citations, col, row)
  }
  const followup = ins.find((e) => e.edgeType === 'FOLLOW_UP')
  return followup ? placeFollowUp(node, followup, col, row) : false
}

function placeCited(
  node: ChatMapLayoutNode,
  citations: ChatMapLayoutEdge[],
  col: Map<string, number>,
  row: Map<string, number>,
): boolean {
  const citedRows = citations.map((e) => row.get(e.source) ?? 0)
  const citedCols = citations.map((e) => col.get(e.source) ?? 0)
  col.set(node.id, Math.max(...citedCols) + 1)
  row.set(node.id, Math.max(...citedRows))
  return true
}

function placeFollowUp(
  node: ChatMapLayoutNode,
  followup: ChatMapLayoutEdge,
  col: Map<string, number>,
  row: Map<string, number>,
): boolean {
  col.set(node.id, col.get(followup.source) ?? 0)
  row.set(node.id, (row.get(followup.source) ?? 0) + 1)
  return true
}

function applyCoordinates(
  nodes: ChatMapLayoutNode[],
  col: Map<string, number>,
  row: Map<string, number>,
): void {
  for (const node of nodes) {
    node.x = (col.get(node.id) ?? 0) * CHAT_MAP_COL_W
    node.y = (row.get(node.id) ?? 0) * CHAT_MAP_ROW_H + CHAT_MAP_BASE_Y
  }
}
