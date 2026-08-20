/**
 * @fileoverview 全系统 Prompt 模板配置键常量。
 *
 * 统一收敛各层分散的 `*_prompt_template_id` 配置键，消除魔数字符串。
 * config_key 命名规则与 configRegistrations.ts 保持一致：
 *   base/core/agent/app 模块：`<module>.<key>`
 *   orchestration 模块：`orchestration.<module>.<key>`
 */

/** Prompt 槽位枚举（每个槽位对应一个内置 Prompt） */
export const PROMPT_SLOTS = {
  LLM_MATCH: 'llm_core.prompt_template_id',
  INFO_TAG: 'info_core.tag_config.prompt_template_id',
  INFO_SUMMARY: 'info_core.summary_config.prompt_template_id',
  MCP_MATCH: 'mcp_core.prompt_template_id',
  SKILL_MATCH: 'skill_core.prompt_template_id',
  SOUL_MATCH: 'soul_core.prompt_template_id',
  STRATEGY_SELECTOR: 'orchestration.entry.strategy_prompt_template_id',
  TASK_ANALYSIS: 'agent_builder.task_analysis_prompt_template_id',
  AGENT_MATCH: 'agent_library.prompt_template_id',
  THINK: 'agent_execution.think_prompt_template_id',
  REFLECT: 'agent_execution.reflect_prompt_template_id',
  ANSWER: 'agent_execution.answer_prompt_template_id',
  PLAN: 'planner_agent.plan_prompt_template_id',
  WRITE: 'writer_agent.write_prompt_template_id',
  EVAL_WORK: 'evolutor_agent.eval_work_prompt_template_id',
  EVAL_WRITE: 'evolutor_agent.eval_write_prompt_template_id',
  DOCUMENT_QUERY: 'self_learning.document_query_prompt_template_id',
  PROFILE_ANALYSIS: 'user_profile.profile_analysis_prompt_template_id',
} as const;

export type PromptSlot = (typeof PROMPT_SLOTS)[keyof typeof PROMPT_SLOTS];
