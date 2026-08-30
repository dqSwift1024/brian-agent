/**
 * @fileoverview 配置页纯展示映射：层级/模块/分类的名称与图标、配置树 →
 * 展示模型的字段构建（配置项表单字段 / 实体编辑表单字段 / 值摘要）。
 *
 * 全部为无状态纯函数与常量，便于单元测试；页面状态与请求编排见
 * composables/useConfigView。
 */
import {
  Server, Cpu, Bot, Workflow, AppWindow,
  Plug, Database, Boxes, Table2, Send, MessageSquare,
  Heart, Wand2, Brain, GraduationCap,
  Library, Settings, User, MessageCircle,
  Layers, FileText,
  Play, Eye, Code2, GitBranch,
} from '@lucide/vue'
import type { ConfigTreeItem } from '@/api/types'

// ============================================================
// Types
// ============================================================

export type ModuleKey = 'model' | 'soul' | 'work' | 'skill' | 'mcp' | 'agent'
export type FieldType = 'text' | 'number' | 'enum' | 'boolean' | 'json'

export interface RawItem { id: string; enabled?: boolean; isDefault?: boolean; [key: string]: unknown }

export interface ConfigField {
  key: string; label: string; type: FieldType
  value: string | number | boolean
  options?: { label: string; value: string | number | boolean }[]
}

export interface DisplayItem {
  key: string; name: string; desc: string
  valueSummary: string; configurable: boolean
  raw?: RawItem; configItem?: ConfigTreeItem
  isEntityItem?: boolean
}

export interface DisplayCategory {
  key: string; name: string; desc: string
  configurable: boolean; itemCount: number
  items: DisplayItem[]; isEntityCategory?: boolean
}

export interface DisplayModule {
  key: string; name: string; desc: string
  icon: typeof Cpu; configurable: boolean
  apiModule?: ModuleKey; categoryCount: number
  categories: DisplayCategory[]
}

export interface DisplayLayer {
  key: string; name: string; desc: string
  icon: typeof Server; hasConfigurable: boolean
  modules: DisplayModule[]
}

// ============================================================
// Display name mappings
// ============================================================

export const LAYER_NAMES: Record<string, string> = {
  BASE: '基础设施层', CORE: '核心层', AGENT: 'Agent层',
  ORCHESTRATION: '编排层', APPLICATION: '应用层',
}
export const LAYER_DESCS: Record<string, string> = {
  BASE: '提供底层资源与基础配置：LLM、MCP、存储、Soul、Skill 等',
  CORE: '核心服务编排：LLM、信息、学习、MCP、技能、灵魂等核心模块',
  AGENT: 'Agent 框架：构建、库、生命周期与各类 Agent',
  ORCHESTRATION: '任务与流程编排',
  APPLICATION: '面向用户的应用入口：对话、文档、画像等',
}
const LAYER_ICONS: Record<string, typeof Server> = {
  BASE: Server, CORE: Cpu, AGENT: Bot, ORCHESTRATION: Workflow, APPLICATION: AppWindow,
}

export const MODULE_NAMES: Record<string, string> = {
  llm_provider: 'LLM Provider',
  soul_provider: 'Soul Provider',
  skill_provider: 'Skill Provider',
  mcp_provider: 'MCP Provider',
  prompts_provider: 'Prompts Provider',
  log_provider: 'Log Provider',
  mq_provider: 'MQ Provider',
  graphdb_provider: 'GraphDB Provider',
  vectordb_provider: 'VectorDB Provider',
  relationdb_provider: 'RelationDB Provider',
  llm_core: 'LLM Core',
  info_core: 'Info Core',
  mcp_core: 'MCP Core',
  skill_core: 'Skill Core',
  soul_core: 'Soul Core',
  agent_library: 'Agent Library',
  agent_builder: 'Agent Builder',
  agent_execution: 'Agent Execution',
  agent_strategy: 'Agent Strategy',
  agent_context: 'Agent Context',
  entry: 'Entry',
  strategy: 'Strategy',
  execution: 'Execution',
  visualization: 'Visualization',
  jsonnode: 'JSON Node',
  chat: 'Chat',
  self_learning: 'Self Learning',
  user_profile: 'User Profile',
  config: 'Config',
}

const MODULE_ICONS: Record<string, typeof Cpu> = {
  llm_provider: Cpu, mcp_provider: Plug, soul_provider: Heart, skill_provider: Wand2,
  prompts_provider: MessageSquare, log_provider: FileText, mq_provider: Send,
  graphdb_provider: Database, vectordb_provider: Boxes, relationdb_provider: Table2,
  llm_core: Cpu, info_core: Brain, mcp_core: Plug, skill_core: Wand2, soul_core: Heart,
  agent_library: Library, agent_builder: Bot, agent_execution: Play,
  agent_strategy: GitBranch, agent_context: Layers,
  entry: Workflow, strategy: GitBranch, execution: Play, visualization: Eye, jsonnode: Code2,
  chat: MessageCircle, self_learning: GraduationCap, user_profile: User, config: Settings,
}

const CATEGORY_NAMES: Record<string, string> = {
  basic: '基础设置', quota: '配额设置', aging: '老化设置', config: '配置', tag_config: '标签配置',
  summary_config: '摘要配置', vector_config: '向量配置', context_config: '上下文配置',
  opt_rule: '优化规则', weight: '权重设置', interval: '间隔设置',
}

/** 挂接实体管理页签的模块：module → 实体 API 域与页签标签 */
export const ENTITY_MODULES: Record<string, { apiModule: ModuleKey; label: string }> = {
  llm_provider: { apiModule: 'model', label: '模型管理' },
  soul_provider: { apiModule: 'soul', label: 'Soul 管理' },
  skill_provider: { apiModule: 'skill', label: 'Skill 管理' },
  mcp_provider: { apiModule: 'mcp', label: 'MCP 管理' },
}

export const AGENT_ENTITY_MODULE = { moduleKey: 'meta_agent', apiModule: 'agent' as ModuleKey, label: 'Agent 管理' }

export function layerIcon(layer: string): typeof Server {
  return LAYER_ICONS[layer] || Layers
}

export function moduleIcon(module: string): typeof Cpu {
  return MODULE_ICONS[module] || Settings
}

export function categoryName(category: string): string {
  return CATEGORY_NAMES[category] || category
}

// ============================================================
// Field builders（纯函数）
// ============================================================

export function formatValueSummary(item: ConfigTreeItem): string {
  const val = item.current_value ?? item.config_default
  if (val === null || val === undefined) return '未设置'
  if (typeof val === 'boolean') return val ? '启用' : '停用'
  return String(val)
}

/** 配置项 → 编辑表单字段（按 config_type 映射控件类型） */
export function buildConfigFields(item: ConfigTreeItem): ConfigField[] {
  const val = item.current_value ?? item.config_default
  const type = item.config_type.toUpperCase()
  if (type === 'BOOLEAN' || type === 'BOOL') {
    return [{ key: 'value', label: item.config_name, type: 'boolean', value: !!val }]
  }
  if (type === 'ENUM' && item.config_enum_values) {
    const enumVals = item.config_enum_values as string[]
    return [{ key: 'value', label: item.config_name, type: 'enum', value: String(val ?? ''), options: enumVals.map(v => ({ label: v, value: v })) }]
  }
  if (type === 'INT' || type === 'INTEGER') {
    return [{ key: 'value', label: item.config_name, type: 'number', value: Number(val ?? 0) }]
  }
  if (type === 'DOUBLE' || type === 'FLOAT' || type === 'NUMBER') {
    return [{ key: 'value', label: item.config_name, type: 'number', value: Number(val ?? 0) }]
  }
  return [{ key: 'value', label: item.config_name, type: 'text', value: String(val ?? '') }]
}

/** 实体原始记录 → 编辑表单字段（按实体域定制字段集） */
export function buildEntityFields(raw: RawItem, m: ModuleKey): ConfigField[] {
  switch (m) {
    case 'model': return [
      { key: 'providerName', label: '提供商', type: 'text', value: String(raw.providerName || '') },
      { key: 'modelName', label: '模型名称', type: 'text', value: String(raw.modelName || '') },
      { key: 'maxTokens', label: '最大 Token', type: 'number', value: Number(raw.maxTokens || 0) },
      { key: 'status', label: '状态', type: 'enum', value: String(raw.status || 'active'), options: [{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }] },
      { key: 'isDefault', label: '设为默认', type: 'boolean', value: !!raw.isDefault },
    ] as ConfigField[]
    case 'soul': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'traits', label: '特性 (JSON)', type: 'json', value: JSON.stringify(raw.traits || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'work': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'steps', label: '步骤 (JSON)', type: 'json', value: JSON.stringify(raw.steps || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'skill': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'category', label: '分类', type: 'text', value: String(raw.category || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'mcp': return [
      { key: 'displayName', label: '名称', type: 'text', value: String(raw.displayName || raw.name || '') },
      { key: 'version', label: '版本', type: 'text', value: String(raw.version || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'agent': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'type', label: '类型', type: 'text', value: String(raw.type || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
  }
}
