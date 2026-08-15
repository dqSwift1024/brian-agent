/**
 * @fileoverview 全系统配置注册表定义。
 *
 * 集中管理所有层（BASE / CORE / AGENT / ORCHESTRATION / APPLICATION）
 * 各个模块的配置项元数据。ConfigService 在初始化时通过 registerConfig()
 * 将这些配置项批量注册到 config_registry 表。
 */
import type { ConfigRegistration } from './types';

function base(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'BASE', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function core(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'CORE', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function orch(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'ORCHESTRATION', module: mod, category: cat, config_key: `orchestration.${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function app(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[], readable?: boolean, writable?: boolean): ConfigRegistration {
  return { layer: 'APPLICATION', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals, readable, writable };
}

function agent(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'AGENT', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

// ===========================================================================
// 层级 / 模块 / 分类 的显示元数据
// ===========================================================================

export const LAYER_LABELS: Record<string, { label: string; desc: string }> = {
  BASE: { label: '基础设施层', desc: '提供底层资源与基础配置：模型、MCP、存储、Soul、Skill 等' },
  CORE: { label: '核心层', desc: '核心服务编排：LLM、信息、学习、MCP、技能、灵魂等核心模块' },
  AGENT: { label: 'Agent层', desc: 'Agent 框架：构建、库、生命周期与各类 Agent' },
  ORCHESTRATION: { label: '编排层', desc: '任务与流程编排' },
  APPLICATION: { label: '应用层', desc: '面向用户的应用入口：对话、文档、网关、画像等' },
};

export const MODULE_LABELS: Record<string, { label: string; desc: string }> = {
  llm_provider: { label: 'LLM Provider', desc: 'LLM 提供商管理与模型配置' },
  soul_provider: { label: 'Soul Provider', desc: '灵魂角色管理' },
  skill_provider: { label: 'Skill Provider', desc: '技能管理' },
  mcp_provider: { label: 'MCP Provider', desc: 'MCP 服务提供商管理' },
  prompts_provider: { label: 'Prompts Provider', desc: '提示词模板配置' },
  log_provider: { label: 'Log Provider', desc: '日志组件配置' },
  mq_provider: { label: 'MQ Provider', desc: '消息队列配置' },
  graphdb_provider: { label: 'GraphDB Provider', desc: '图数据库后端配置' },
  vectordb_provider: { label: 'VectorDB Provider', desc: '向量数据库配置' },
  relationdb_provider: { label: 'RelationDB Provider', desc: '关系型数据库配置' },
  llm_core: { label: 'LLM Core', desc: 'LLM 调用核心' },
  info_core: { label: 'Info Core', desc: '信息/记忆核心' },
  mcp_core: { label: 'MCP Core', desc: 'MCP 调用核心' },
  skill_core: { label: 'Skill Core', desc: '技能调用核心' },
  soul_core: { label: 'Soul Core', desc: '灵魂调用核心' },
  agent_builder: { label: 'AgentBuilder', desc: 'Agent 构建器' },
  agent_library: { label: 'AgentLibrary', desc: 'Agent 库' },
  agent_execution: { label: 'AgentExecution', desc: 'Agent 执行引擎' },
  agent_strategy: { label: 'AgentStrategy', desc: 'Agent 策略管理' },
  agent_context: { label: 'AgentContext', desc: 'Agent 上下文管理' },
  writer_agent: { label: 'WriterAgent', desc: '写作 Agent' },
  evolutor_agent: { label: 'EvolutorAgent', desc: '进化 Agent' },
  entry: { label: 'Entry', desc: '编排入口（复杂度分解、策略选择）' },
  strategy: { label: 'Strategy', desc: '编排策略配置' },
  execution: { label: 'Execution', desc: '编排执行引擎' },
  visualization: { label: 'Visualization', desc: '可视化配置' },
  jsonnode: { label: 'JSON Node', desc: 'JSON 节点执行配置' },
  chat: { label: 'Chat', desc: '对话应用' },
  self_learning: { label: 'SelfLearning', desc: '自学习' },
  user_profile: { label: 'UserProfile', desc: '用户画像' },
  config: { label: 'Config', desc: '配置应用自配置' },
};

export const CATEGORY_LABELS: Record<string, { label: string; desc: string }> = {
  basic: { label: '基础设置', desc: '基础运行配置' },
  quota: { label: '配额设置', desc: '调用配额与限额' },
  aging: { label: '老化策略', desc: '数据老化与清理策略' },
  config: { label: '配置参数', desc: '核心配置参数' },
  tag_config: { label: '标签配置', desc: '标签生成相关配置' },
  summary_config: { label: '摘要配置', desc: '摘要生成相关配置' },
  vector_config: { label: '向量化配置', desc: '向量化相关配置' },
  context_config: { label: '上下文配置', desc: '上下文构建相关配置' },
  opt_rule: { label: '优化规则', desc: '优化规则配置' },
  interval: { label: '调度间隔', desc: '定时调度间隔配置' },
  weight: { label: '权重设置', desc: '权重系数配置' },
};

export const MODULE_ENTITY_TYPES: Record<string, string[]> = {
  llm_provider: ['provider', 'model'],
  soul_provider: ['soul'],
  skill_provider: ['skill'],
  mcp_provider: ['mcp'],
};

export const ALL_CONFIG_REGISTRATIONS: ConfigRegistration[] = [

  // =========================================================================
  // BASE layer
  // =========================================================================

  // --- LLMProvider ---
  base('llm_provider', 'basic', 'enabled', 'LLM 组件启用', 'BOOLEAN', true, 'LLM 组件是否启用'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_day', '默认每日 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_week', '默认每周 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_month', '默认每月 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_day', '默认每日调用次数限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_week', '默认每周调用次数限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_month', '默认每月调用次数限额', 'INT', 0, '0 为不限制'),

  // --- SoulProvider ---
  base('soul_provider', 'basic', 'enabled', 'Soul 组件启用', 'BOOLEAN', true, 'Soul 组件是否启用'),

  // --- SkillProvider ---
  base('skill_provider', 'basic', 'enabled', 'Skill 组件启用', 'BOOLEAN', true, 'Skill 组件是否启用'),

  // --- MCPProvider ---
  base('mcp_provider', 'basic', 'enabled', 'MCP 组件启用', 'BOOLEAN', true, 'MCP 组件是否启用'),
  base('mcp_provider', 'basic', 'cache_ttl', 'MCP 列表缓存 TTL（秒）', 'INT', 86400, '默认 1 天'),

  // --- PromptsProvider ---
  base('prompts_provider', 'basic', 'enabled', 'Prompts 组件启用', 'BOOLEAN', true, 'Prompts 组件是否启用'),

  // --- LogProvider ---
  base('log_provider', 'basic', 'enabled', '日志组件启用', 'BOOLEAN', true, '日志组件是否启用'),
  base('log_provider', 'basic', 'default_level', '默认日志级别', 'ENUM', 'INFO', '日志未指定级别时使用的默认级别', ['DEBUG', 'INFO', 'WARN', 'ERROR']),
  base('log_provider', 'basic', 'file_path', '日志文件根目录', 'STRING', './data/logs', '日志文件存储路径'),
  base('log_provider', 'basic', 'max_file_size', '单文件最大大小（字节）', 'INT', 209715200, '200MB，超过自动滚动'),
  base('log_provider', 'basic', 'retention_days', '日志保留天数', 'INT', 14, '超过自动清理'),
  base('log_provider', 'basic', 'write_mode', '写入模式', 'ENUM', 'BOTH', 'FILE（仅文件）/ SQLITE（仅数据库）/ BOTH（双写）', ['FILE', 'SQLITE', 'BOTH']),

  // --- MQProvider ---
  base('mq_provider', 'basic', 'enabled', 'MQ 组件启用', 'BOOLEAN', true, 'MQ 组件是否启用'),
  base('mq_provider', 'basic', 'message_ttl', '消息默认保留时间（秒）', 'INT', 86400, '默认 1 天'),
  base('mq_provider', 'basic', 'default_max_retries', '默认最大重试次数', 'INT', 3),
  base('mq_provider', 'basic', 'default_priority', '默认消息优先级（0-10）', 'INT', 5),
  base('mq_provider', 'basic', 'retry_base_delay', '重试基础延迟（秒）', 'INT', 1, '第 N 次重试延迟 = base × 2^(N-1)'),
  base('mq_provider', 'basic', 'processing_timeout', '处理超时（秒）', 'INT', 300, '超时 PROCESSING 消息自动恢复为 PENDING'),

  // --- GraphDBProvider ---
  base('graphdb_provider', 'basic', 'enabled', '图数据库启用', 'BOOLEAN', true, '图数据库是否启用'),
  base('graphdb_provider', 'aging', 'retention_days', '激活统计保留天数', 'INT', 30, '老化观察窗口'),
  base('graphdb_provider', 'aging', 'min_activation_count', '窗口内最小激活次数阈值', 'INT', 5),
  base('graphdb_provider', 'basic', 'default_trigger_type', '默认触发类型', 'ENUM', 'user_query', '边激活事件的默认触发来源', ['所有触发事件', '用户交互触发', '标签维护触发', '自定义事件触发']),
  base('graphdb_provider', 'basic', 'default_weight', '默认边权重', 'DOUBLE', 1.0),
  base('graphdb_provider', 'basic', 'default_depth', '默认遍历深度', 'INT', 1),
  base('graphdb_provider', 'basic', 'default_only_active', '默认仅遍历激活边', 'BOOLEAN', true),
  base('graphdb_provider', 'weight', 'decay_slope', '逆比例衰减斜率 (α)', 'DOUBLE', 0.06, 'A_vw 第一项控制 recency 衰减速度'),
  base('graphdb_provider', 'weight', 'total_bonus', '对数累计补偿 (β)', 'DOUBLE', 0.4, 'A_vw 第二项对长期低频边的补偿'),
  base('graphdb_provider', 'weight', 'hop_decay_factor', '跳衰减因子 (γ)', 'DOUBLE', 0.8, '每多 1 跳权重乘以 γ'),
  base('graphdb_provider', 'weight', 'fan_out_threshold', '扇出熔断阈值 (θ)', 'INT', 500, '超出度触发截断'),

  // --- VectorDBProvider ---
  base('vectordb_provider', 'basic', 'enabled', '向量数据库启用', 'BOOLEAN', true, '向量数据库是否启用'),
  base('vectordb_provider', 'basic', 'default_top_k', '默认返回结果数量', 'INT', 10, '相似性搜索返回数量'),
  base('vectordb_provider', 'basic', 'default_similarity_threshold', '默认相似度阈值', 'DOUBLE', 0, '归一化阈值 0-100（0=返回全部，100=仅完全匹配），低于此值结果不返回'),
  base('vectordb_provider', 'basic', 'default_distance_metric', '默认距离度量方式', 'ENUM', 'COSINE', '仅写入前可更改（写入数据后锁定）；COSINE 余弦 / L2 欧氏 / IP 内积', ['COSINE', 'L2', 'IP']),

  // --- RelationDBProvider ---
  base('relationdb_provider', 'basic', 'enabled', '关系数据库启用', 'BOOLEAN', true, '关系数据库是否启用'),

  // =========================================================================
  // CORE layer
  // =========================================================================

  // --- LLMCoreProvider ---
  core('llm_core', 'basic', 'regen_rate', 'LLM 重新匹配概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('llm_core', 'basic', 'prompt_template_id', 'LLM 匹配 Prompt', 'STRING', '', '用于 LLM 匹配排名'),
  core('llm_core', 'quota', 'quota_tokens_per_day', '每日 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_tokens_per_week', '每周 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_tokens_per_month', '每月 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_day', '每日调用次数限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_week', '每周调用次数限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_month', '每月调用次数限额', 'INT', 0, '0 为不限制'),

  // --- InfoCoreProvider ---
  core('info_core', 'config', 'config.alive_max_days', '信息保留最大天数', 'INT', 30, '超过自动清理'),
  core('info_core', 'tag_config', 'tag_config.llm_id', '标签生成 LLM', 'STRING', ''),
  core('info_core', 'tag_config', 'tag_config.prompt_template_id', '标签生成 Prompt', 'STRING', ''),
  core('info_core', 'tag_config', 'tag_config.tag_top_k', '标签 Top-K 数量', 'INT', 5),
  core('info_core', 'tag_config', 'tag_config.enable', '标签生成启用', 'BOOLEAN', true),
  core('info_core', 'summary_config', 'summary_config.llm_id', '摘要生成 LLM', 'STRING', ''),
  core('info_core', 'summary_config', 'summary_config.prompt_template_id', '摘要生成 Prompt', 'STRING', ''),
  core('info_core', 'summary_config', 'summary_config.enable', '摘要生成启用', 'BOOLEAN', true),
  core('info_core', 'vector_config', 'vector_config.llm_id', '向量化 LLM', 'STRING', ''),
  core('info_core', 'vector_config', 'vector_config.dimension', '向量维度', 'INT', 1024),
  core('info_core', 'vector_config', 'vector_config.enable', '向量化启用', 'BOOLEAN', true),
  core('info_core', 'context_config', 'context_config.base_timeline_count', '时间线基础数量', 'INT', 500, '上下文构建-时间线'),
  core('info_core', 'context_config', 'context_config.base_tag_relative_count', '标签关联基础数量', 'INT', 200, '上下文构建-标签关联'),
  core('info_core', 'context_config', 'context_config.base_similarity_count', '相似度基础数量', 'INT', 150, '上下文构建-相似度'),
  core('info_core', 'context_config', 'context_config.base_keyword_count', '关键词基础数量', 'INT', 100, '上下文构建-关键词'),
  core('info_core', 'context_config', 'context_config.base_random_count', '随机基础数量', 'INT', 50, '上下文构建-随机'),
  core('info_core', 'context_config', 'context_config.total', '上下文总数限制', 'INT', 1000),

  // --- MCPCoreProvider ---
  core('mcp_core', 'basic', 'regen_rate', 'MCP 重新匹配概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('mcp_core', 'basic', 'prompt_template_id', 'MCP 匹配 Prompt', 'STRING', '', '用于 MCP 匹配排名'),

  // --- SkillCoreProvider ---
  core('skill_core', 'basic', 'regen_rate', 'Skill 重新生成概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('skill_core', 'basic', 'prompt_template_id', 'Skill 匹配 Prompt', 'STRING', '', '用于 Skill 匹配排名'),
  core('skill_core', 'opt_rule', 'opt_rule.days', '优化规则观察天数', 'INT', 30, '技能淘汰/优化规则的观察窗口'),
  core('skill_core', 'opt_rule', 'opt_rule.min_usage_count', '优化规则最小使用次数', 'INT', 5, '低于此次数的技能可能被淘汰'),

  // --- SoulCoreProvider ---
  core('soul_core', 'basic', 'regen_rate', 'Soul 重新生成概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('soul_core', 'basic', 'prompt_template_id', 'Soul 匹配排名的 Prompt 模板 ID', 'STRING', '', '用于 Soul 匹配排名'),
  core('soul_core', 'opt_rule', 'opt_rule.days', '优化规则观察天数', 'INT', 30, 'Soul 淘汰/优化规则的观察窗口'),
  core('soul_core', 'opt_rule', 'opt_rule.min_usage_count', '优化规则最小使用次数', 'INT', 5, '低于此次数的 Soul 可能被淘汰'),

  // =========================================================================
  // ORCHESTRATION layer
  // =========================================================================

  // --- OrchestrationEntry ---
  orch('entry', 'basic', 'complexity_decompose_threshold', '复杂度分解阈值', 'INT', 50, '任务复杂度超过此阈值时触发任务分解（选择 PLANNING 策略），否则走 SIMPLE；取值 0-100'),
  orch('entry', 'basic', 'strategy_prompt_template_id', '策略选择 Prompt', 'STRING', '', '用于 LLM 分析任务复杂度并选择编排策略的 Prompt 模板；为空时降级为纯规则判定'),
  orch('entry', 'basic', 'default_strategy', '默认编排策略', 'ENUM', 'SIMPLE', 'LLM 分析失败或无 LLM 时的兜底编排策略', ['SIMPLE', 'PLANNING']),
  orch('entry', 'basic', 'max_recent_works', '最大最近工作数', 'INT', 5, '构建工作上下文时收集的最近工作（work）数量'),
  orch('entry', 'basic', 'async_worker_interval', '异步工作间隔（ms）', 'INT', 1000, '异步工作 Worker 的轮询间隔'),

  // --- OrchestrationStrategy ---
  orch('strategy', 'basic', 'default_strategy_id', '默认策略', 'STRING', '', '默认使用的策略 ID'),
  orch('strategy', 'basic', 'max_plan_retries', '最大计划重试次数', 'INT', 2),

  // --- OrchestrationExecution ---
  orch('execution', 'basic', 'max_concurrent', '最大并发数', 'INT', 1),
  orch('execution', 'basic', 'dag_timeout_ms', 'DAG 超时（ms）', 'INT', 300000, '整个 DAG 执行的最大超时时间'),

  // --- OrchestrationVisualization ---
  orch('visualization', 'basic', 'max_nodes_in_graph', 'Agent DAG 图最大节点数', 'INT', 50, 'Agent 执行 DAG 图中最多展示的 Agent 节点数，超过则截断（防止 DAG 过大）'),

  // --- JSONNode ---
  orch('jsonnode', 'basic', 'max_execution_depth', '最大执行深度', 'INT', 50),
  orch('jsonnode', 'basic', 'node_timeout_ms', '节点超时（ms）', 'INT', 300000, '5 分钟'),
  orch('jsonnode', 'basic', 'trace_enabled', '追踪启用', 'BOOLEAN', true, '是否记录 JSONNode 执行追踪'),

  // =========================================================================
  // AGENT layer
  // =========================================================================

  // --- AgentBuilder ---
  agent('agent_builder', 'basic', 'task_analysis_prompt_template_id', '任务分析 Prompt', 'STRING', '', '分析任务特征所用的 Prompt 模板'),
  agent('agent_builder', 'basic', 'auto_optimize', '自动优化构建', 'BOOLEAN', true, '是否在使用中自动优化 Agent 组装'),

  // --- AgentExecution ---
  agent('agent_execution', 'basic', 'think_prompt_template_id', 'Think Prompt', 'STRING', '', 'Worker Think 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'reflect_prompt_template_id', 'Reflect Prompt', 'STRING', '', 'Worker Reflect 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'answer_prompt_template_id', 'Answer Prompt', 'STRING', '', 'Worker Answer 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'default_max_iterations', '默认最大迭代次数', 'INT', 10, 'ReAct 循环最大轮数'),
  agent('agent_execution', 'basic', 'async_worker_interval', '异步工作间隔（ms）', 'INT', 1000),

  // --- AgentContext ---
  agent('agent_context', 'basic', 'enable_snapshot_persistence', '启用上下文快照持久化', 'BOOLEAN', true, '是否持久化上下文构建元数据快照'),

  // --- PlannerAgent ---
  agent('planner_agent', 'basic', 'complexity_decompose_threshold', '复杂度分解阈值', 'INT', 50, '任务复杂度超过此值触发拆解为子任务'),
  agent('planner_agent', 'basic', 'plan_prompt_template_id', '计划生成 Prompt', 'STRING', '', '任务拆解所用的 Prompt 模板'),
  agent('planner_agent', 'basic', 'max_subtask_count', '最大子任务数', 'INT', 10, '单次规划最多拆分的子任务数'),

  // --- WriterAgent ---
  agent('writer_agent', 'basic', 'write_prompt_template_id', '写作 Prompt', 'STRING', '', '结果汇总所用的 Prompt 模板'),
  agent('writer_agent', 'basic', 'default_language', '默认语言', 'ENUM', 'zh-CN', '结果输出默认语言', ['zh-CN', 'en-US']),
  agent('writer_agent', 'basic', 'default_style', '默认风格', 'ENUM', 'clear', '结果输出默认风格', ['clear', 'concise', 'detailed', 'creative']),
  agent('writer_agent', 'basic', 'default_depth', '默认深度', 'ENUM', 'medium', '结果输出默认详细程度', ['shallow', 'medium', 'deep']),
  agent('writer_agent', 'basic', 'default_format', '默认格式', 'ENUM', 'MARKDOWN', '结果输出默认格式', ['TEXT', 'MARKDOWN', 'JSON']),

  // --- EvolutorAgent ---
  agent('evolutor_agent', 'basic', 'eval_work_prompt_template_id', 'Work 评估 Prompt', 'STRING', '', '评估 WorkAgent 结果所用的 Prompt 模板'),
  agent('evolutor_agent', 'basic', 'eval_write_prompt_template_id', 'Write 评估 Prompt', 'STRING', '', '评估 WriterAgent 结果所用的 Prompt 模板'),
  agent('evolutor_agent', 'basic', 'optimize_threshold', '优化阈值', 'INT', 60, '评分低于此值触发优化'),
  agent('evolutor_agent', 'basic', 'eval_frequency_threshold', '评估频率阈值', 'INT', 5, '使用次数达到此值触发评估'),
  agent('evolutor_agent', 'basic', 'eval_schedule_interval_ms', '评估调度间隔（ms）', 'INT', 3600000, '定期评估的调度间隔'),
  agent('evolutor_agent', 'basic', 'eval_batch_size', '评估批量大小', 'INT', 20, '单次评估处理的 Agent 数量'),

  // =========================================================================
  // APPLICATION layer
  // =========================================================================

  // --- Chat ---
  app('chat', 'basic', 'max_messages_per_session', '每会话最大消息数', 'INT', 1000),
  app('chat', 'basic', 'sse_heartbeat_interval_ms', 'SSE 心跳间隔（ms）', 'INT', 30000, 'SSE 长连接保活心跳间隔'),
  app('chat', 'basic', 'default_history_lastN', '默认历史消息数', 'INT', 50, '聊天上下文携带的历史消息数'),

  // --- SelfLearning ---
  app('self_learning', 'weight', 'random_factor', '随机因子', 'INT', 10),
  app('self_learning', 'weight', 'document_weight', '文档权重', 'INT', 40),
  app('self_learning', 'weight', 'conversation_weight', '会话权重', 'INT', 30, '会话学习权重（已隐藏）', undefined, false),
  app('self_learning', 'weight', 'tag_maintenance_weight', '标签维护权重', 'INT', 30),
  app('self_learning', 'interval', 'learning_interval_ms', '学习间隔（ms）', 'INT', 600000, '自学习任务调度间隔时间'),
  app('self_learning', 'basic', 'default_learning_rate', '学习率', 'INT', 5, '每次文档学习 tick 中每个知识库最多处理的 PENDING 文件数。知识库级别 learning_rate 优先'),
  app('self_learning', 'interval', 'tag_connection_check_interval_ms', '标签关联检查间隔（ms）', 'INT', 1800000, '标签关联关系检查间隔时间'),
  app('self_learning', 'interval', 'tag_aging_cron', '标签老化 Cron', 'STRING', '0 0 2 * * *', '每天凌晨 2:00'),
  app('self_learning', 'interval', 'orphan_tag_check_cron', '孤立标签检查 Cron', 'STRING', '0 0 3 * * *', '每天凌晨 3:00'),
  app('self_learning', 'basic', 'document_split_threshold', '文档分割阈值（字符数）', 'INT', 5000, '文档内容长度超过此值时触发 ChunkProvider 分块'),
  app('self_learning', 'basic', 'chunk_overlap_ratio', '分块重叠比例', 'DOUBLE', 0.2, 'ChunkProvider 分块时相邻块的文本重叠比例，取值 0-1'),

  // --- UserProfile ---
  app('user_profile', 'basic', 'auto_generate_interval_ms', '自动生成间隔（ms）', 'INT', 86400000, '自动生成画像的调度间隔'),
  app('user_profile', 'basic', 'profile_analysis_prompt_template_id', '画像分析 Prompt', 'STRING', ''),
  app('user_profile', 'basic', 'max_conversation_sample_count', '最大会话采样数', 'INT', 500),
  app('user_profile', 'basic', 'profile_retention_versions', '画像保留版本数', 'INT', 20),
  app('user_profile', 'basic', 'min_confidence_threshold', '最小置信度阈值', 'DOUBLE', 0.5),

  // --- Visualization ---
  app('visualization', 'basic', 'max_nodes_per_graph', '消息图最大节点数', 'INT', 200, '消息引用关系图中最多展示的消息节点数，超过则截断'),
  app('visualization', 'basic', 'default_message_summary_length', '消息摘要显示长度', 'INT', 50, '消息图中节点显示的消息摘要截取长度（字符数）'),
  app('visualization', 'basic', 'resolve_content_by_default', '默认展开 Agent 组件详情', 'BOOLEAN', true, '查看 Agent DAG 时是否默认将组件 ID（LLM/Soul/Skill/MCP）解析为完整内容'),

  // --- Config (self) ---
  app('config', 'basic', 'default_readable', '默认可读', 'BOOLEAN', true, '新注册配置项的默认可读性'),
  app('config', 'basic', 'default_writable', '默认可写', 'BOOLEAN', true, '新注册配置项的默认可写性'),
];
