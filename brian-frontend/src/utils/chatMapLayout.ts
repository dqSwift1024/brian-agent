// ChatMap 消息关系图布局：将「顺序问答」与「引用问答」两种模式排布到二维画布。
//
// 规则：
// - QUESTION_ANSWER（问题→回答）：回答放在问题正下方（同列，纵向），居中对齐。
// - FOLLOW_UP（上一回答→本次提问）：追问放在上一回答正下方（同列，纵向衔接）。
// - CITATION（被引用→引用方）：引用方放在被引用方右边（横向），
//   且引用方与被引用消息中「行最大（最靠下）」的那一个顶部对齐。
// - 同一列内的所有节点 X 坐标一致（居中对齐），每个网格单元最多容纳一个节点，绝不允许重叠。

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

// ===== 原始常量（保留作为参考） =====
// export const CHAT_MAP_ROW_H = 285
// export const CHAT_MAP_COL_W = 390
// export const CHAT_MAP_BASE_Y = 180
// ===== 修改后：增大间距避免消息框重叠 =====
export const CHAT_MAP_ROW_H = 320
export const CHAT_MAP_COL_W = 440
export const CHAT_MAP_BASE_Y = 180

const CITATION_EXTRA_COL_GAP = 60

const NODE_W = 330
const NODE_H = 162

const RESPONSE_TYPE = 'RESPONSE'

/** 就地计算每个节点的 x / y 坐标。 */
export function layoutChatMap(nodes: ChatMapLayoutNode[], edges: ChatMapLayoutEdge[]): void {
  const ordered = [...nodes].sort((a, b) => a.created - b.created)
  const incoming = buildIncoming(edges)
  const col = new Map<string, number>()
  const row = new Map<string, number>()
  const citationCols = new Set<number>()
  const occupied = new Set<string>()
  let maxRow = -1

  for (const node of ordered) {
    if (!tryPlace(node, incoming, col, row, citationCols, occupied)) {
      assignCell(node.id, 0, maxRow + 1, col, row, occupied)
    }
    maxRow = Math.max(maxRow, row.get(node.id) ?? 0)
  }

  applyCoordinates(nodes, col, row, citationCols)
  resolveOverlaps(nodes)
}

function cellKey(c: number, r: number): string {
  return `${c},${r}`
}

function assignCell(
  nodeId: string,
  targetCol: number,
  targetRow: number,
  col: Map<string, number>,
  row: Map<string, number>,
  occupied: Set<string>,
): void {
  let c = targetCol
  const r = targetRow
  while (occupied.has(cellKey(c, r))) {
    c++
  }
  col.set(nodeId, c)
  row.set(nodeId, r)
  occupied.add(cellKey(c, r))
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
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  if (node.infoType === RESPONSE_TYPE) {
    return placeResponse(node, incoming, col, row, occupied)
  }
  return placeRequest(node, incoming, col, row, citationCols, occupied)
}

function placeResponse(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
  occupied: Set<string>,
): boolean {
  const qa = incoming.get(node.id)?.find((e) => e.edgeType === 'QUESTION_ANSWER')
  if (!qa) return false
  const srcCol = col.get(qa.source) ?? 0
  const srcRow = row.get(qa.source) ?? 0
  assignCell(node.id, srcCol, srcRow + 1, col, row, occupied)
  return true
}

function placeRequest(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  const ins = incoming.get(node.id) ?? []
  const citations = ins.filter((e) => e.edgeType === 'CITATION')
  if (citations.length > 0) {
    return placeCited(node, citations, col, row, citationCols, occupied)
  }
  const followup = ins.find((e) => e.edgeType === 'FOLLOW_UP')
  if (followup) {
    const srcCol = col.get(followup.source) ?? 0
    const srcRow = row.get(followup.source) ?? 0
    assignCell(node.id, srcCol, srcRow + 1, col, row, occupied)
    return true
  }
  return false
}

// ===== 原始 placeCited（保留作为参考） =====
// function placeCited(
//   node: ChatMapLayoutNode,
//   citations: ChatMapLayoutEdge[],
//   col: Map<string, number>,
//   row: Map<string, number>,
// ): boolean {
//   const citedRows = citations.map((e) => row.get(e.source) ?? 0)
//   const citedCols = citations.map((e) => col.get(e.source) ?? 0)
//   col.set(node.id, Math.max(...citedCols) + 1)
//   row.set(node.id, Math.max(...citedRows))
//   return true
// }

// ===== 修改后：引用列标记，同一列内所有节点共享横向偏移，实现居中对齐 =====
function placeCited(
  node: ChatMapLayoutNode,
  citations: ChatMapLayoutEdge[],
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  const citedRows = citations.map((e) => row.get(e.source) ?? 0)
  const citedCols = citations.map((e) => col.get(e.source) ?? 0)
  const targetCol = Math.max(...citedCols) + 1
  const targetRow = Math.max(...citedRows)
  assignCell(node.id, targetCol, targetRow, col, row, occupied)
  citationCols.add(col.get(node.id)!)
  return true
}

// ===== 原始 applyCoordinates（保留作为参考） =====
// function applyCoordinates(
//   nodes: ChatMapLayoutNode[],
//   col: Map<string, number>,
//   row: Map<string, number>,
// ): void {
//   for (const node of nodes) {
//     node.x = (col.get(node.id) ?? 0) * CHAT_MAP_COL_W
//     node.y = (row.get(node.id) ?? 0) * CHAT_MAP_ROW_H + CHAT_MAP_BASE_Y
//   }
// }

// ===== 修改后：按列标记决定横向偏移，同一列内所有节点（提问+回答）共享同一 X 坐标 =====
function applyCoordinates(
  nodes: ChatMapLayoutNode[],
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
): void {
  for (const node of nodes) {
    const c = col.get(node.id) ?? 0
    node.x = c * CHAT_MAP_COL_W + (citationCols.has(c) ? CITATION_EXTRA_COL_GAP : 0)
    node.y = (row.get(node.id) ?? 0) * CHAT_MAP_ROW_H + CHAT_MAP_BASE_Y
  }
}

// ===== 后处理：检测并解决节点重叠（完全消除重叠） =====
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function resolveOverlaps(nodes: ChatMapLayoutNode[]): void {
  const MIN_GAP = 8
  let hasOverlap = true
  let iterations = 0
  const maxIterations = 50

  while (hasOverlap && iterations < maxIterations) {
    hasOverlap = false
    iterations++
    const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]
        const b = sorted[j]
        if (!rectsOverlap(a.x, a.y, NODE_W, NODE_H, b.x, b.y, NODE_W, NODE_H)) continue
        hasOverlap = true

        const overlapRight = (a.x + NODE_W) - b.x
        const overlapLeft = (b.x + NODE_W) - a.x
        const overlapBottom = (a.y + NODE_H) - b.y
        const overlapTop = (b.y + NODE_H) - a.y
        const minOverlap = Math.min(overlapRight, overlapLeft, overlapBottom, overlapTop)

        const push = minOverlap + MIN_GAP

        if (minOverlap === overlapRight) {
          a.x -= push / 2
          b.x += push / 2
        } else if (minOverlap === overlapLeft) {
          a.x += push / 2
          b.x -= push / 2
        } else if (minOverlap === overlapBottom) {
          a.y -= push / 2
          b.y += push / 2
        } else {
          a.y += push / 2
          b.y -= push / 2
        }
      }
    }
  }
}