/**
 * @fileoverview 全局信息与上下文枚举定义。
 */

/**
 * 消息类型枚举
 */
export enum InfoType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
  THINK = 'THINK',
  REFLECT = 'REFLECT',
  ACT = 'ACT',
  SKILL = 'SKILL',
  MCP = 'MCP',
  SELF_LEARNING = 'SELF_LEARNING',
  AGENT = 'AGENT',
}

/**
 * 上下文采集方式枚举
 */
export enum CollectionSource {
  PINNED = 'PINNED',
  TIMELINE = 'TIMELINE',
  TAG_RELATIVE = 'TAG_RELATIVE',
  SIMILARITY = 'SIMILARITY',
  KEYWORD = 'KEYWORD',
  RANDOM = 'RANDOM',
  CUSTOM = 'CUSTOM',
}

/**
 * 别名（统一收敛）
 */
export const ContextSource = CollectionSource;
export type ContextSource = CollectionSource;
