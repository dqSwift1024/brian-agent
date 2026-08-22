/**
 * @fileoverview 内置编排策略定义（SIMPLE / PLANNING）单一事实来源。
 *
 * 内置策略的 JSONNode 编排定义此前以「嵌入 SQL 字符串的字面量」散落在
 * OrchestrationStrategySchemaInitializer 中（INSERT 与 UPDATE 重复多份），
 * 存在以下问题：
 *  - 巨型 JSON 字面量在 SQL 内手动拼接、手工转义，单引号等字符极易破坏 SQL；
 *  - 同一份定义在 INSERT / UPDATE 多处重复，改动需多处同步，易漂移；
 *  - UUID 硬编码在 SQL 中，缺乏类型约束。
 *
 * 现改为：以强类型 JSONNodeDefinition 定义于本模块，序列化与落库交由
 * SchemaInitializer 使用参数化 SQL 完成，保证「代码即事实」，避免脆弱拼接。
 *
 * 节点 UUID 保持与历史版本一致，确保既有 orchestration_strategy 数据
 * （以及默认策略解析逻辑）向后兼容。
 */

import type { JSONNodeDefinition, JSONNodeItem, NodeId } from '../../JSONNode/domain/types';

/** 内置策略统一错误兜底文案（节点 HANDLE_ERROR 的 default_response） */
const DEFAULT_ERROR_RESPONSE = '抱歉，处理您的问题时出现了错误。';

/** SIMPLE 策略节点 ID（固定 UUID，向后兼容） */
const S = {
  saveUserInput: 'f8d50a2a-dfec-4d0a-a217-7be7f04c624d',
  buildWorkContext: '319cc27a-a772-4fc3-ad17-83ee5308c738',
  buildWorkAgent: '7323f015-bd2a-482a-9b90-5dc174d8498f',
  execAgent: '89f2cd05-40b0-416e-b2e0-9063713610b1',
  writeResult: 'a235938b-4de9-4db1-b1b0-d186862444c8',
  evalResult: '341b3f6b-cff9-4c1b-8b38-fd70d29c51b1',
  saveResponse: '3fd5e18a-22b3-40db-985a-684a1ad51f76',
  handleError: '8493f9ea-6cf8-4a99-b277-a73bfa920bed',
} as const;

/** PLANNING 策略节点 ID（固定 UUID，向后兼容） */
const P = {
  saveUserInput: 'f8d50a2a-dfec-4d0a-a217-7be7f04c624d',
  buildWorkContext: '319cc27a-a772-4fc3-ad17-83ee5308c738',
  planWork: '7323f015-bd2a-482a-9b90-5dc174d8498f',
  condition: '89f2cd05-40b0-416e-b2e0-9063713610b1',
  buildAgentDag: 'a235938b-4de9-4db1-b1b0-d186862444c8',
  buildWorkAgent: '341b3f6b-cff9-4c1b-8b38-fd70d29c51b1',
  execAgent: '3fd5e18a-22b3-40db-985a-684a1ad51f76',
  execDag: '8493f9ea-6cf8-4a99-b277-a73bfa920bed',
  writeResult: '8287543e-3718-4130-9f13-8e397df9f585',
  evalResult: '3fd8e744-dada-49cc-a997-cce892b950a6',
  saveResponse: '1298946d-57e1-4b0a-99bb-217fba94ff9d',
  handleError: '3ef919cf-4cc3-44a5-a026-fec89a9ed3e5',
} as const;

/** 内置策略元信息与定义 */
export interface BuiltinStrategyDefinition {
  /** 策略标签（orchestration_strategy.strategy_label，唯一） */
  label: string;
  /** 策略描述 */
  description: string;
  /** JSONNode 编排定义 */
  definition: JSONNodeDefinition;
}

/** 构造一个 JSONNode 节点，简化重复字段书写 */
function node(
  nodeId: NodeId,
  nodeType: string,
  params: Record<string, unknown>,
  next: NodeId | null,
  onError?: NodeId,
  extra?: Partial<Pick<JSONNodeItem, 'true_next' | 'false_next'>>,
): JSONNodeItem {
  return { node_id: nodeId, node_type: nodeType, params, next, ...extra, ...(onError ? { on_error: onError } : {}) };
}

/** SIMPLE 策略：构建单个 WorkAgent → 执行 → 汇总 → 评估 → 保存响应 */
const SIMPLE_DEFINITION: JSONNodeDefinition = {
  version: '1.0',
  orchestration_id: 'builtin_simple',
  start_node: S.saveUserInput,
  nodes: [
    node(S.saveUserInput, 'SAVE_USER_INPUT', { info_type: 'REQUEST', update_work_status: 'PROCESSING' }, S.buildWorkContext, S.handleError),
    node(S.buildWorkContext, 'BUILD_WORK_CONTEXT', { max_recent_works: 5, include_user_profile: true }, S.buildWorkAgent, S.handleError),
    node(S.buildWorkAgent, 'BUILD_WORK_AGENT', { force_new: false }, S.execAgent, S.handleError),
    node(S.execAgent, 'EXEC_AGENT', { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, S.writeResult, S.handleError),
    node(S.writeResult, 'WRITE_RESULT', { agent_results_key: 'agent_results', save_response_key: 'final_response' }, S.evalResult, S.handleError),
    node(S.evalResult, 'EVAL_RESULT', { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, S.saveResponse, S.handleError),
    node(S.saveResponse, 'SAVE_RESPONSE', { response_key: 'final_response', update_work_status: 'COMPLETED' }, null, S.handleError),
    node(S.handleError, 'HANDLE_ERROR', { default_response: DEFAULT_ERROR_RESPONSE, update_work_status: 'FAILED' }, null),
  ],
};

/** PLANNING 策略：PlannerAgent 拆解任务 → 按任务数走单 Agent 或 DAG → 汇总 → 评估 → 保存响应 */
const PLANNING_DEFINITION: JSONNodeDefinition = {
  version: '1.0',
  orchestration_id: 'builtin_planning',
  start_node: P.saveUserInput,
  nodes: [
    node(P.saveUserInput, 'SAVE_USER_INPUT', { info_type: 'REQUEST', update_work_status: 'PROCESSING' }, P.buildWorkContext, P.handleError),
    node(P.buildWorkContext, 'BUILD_WORK_CONTEXT', { max_recent_works: 5, include_user_profile: true }, P.planWork, P.handleError),
    node(P.planWork, 'PLAN_WORK', { save_plan_key: 'plan_result' }, P.condition, P.handleError),
    node(
      P.condition, 'CONDITION', { field: 'task_count', operator: 'EQ', value: '1' }, null, P.handleError,
      { true_next: P.buildWorkAgent, false_next: P.buildAgentDag },
    ),
    node(P.buildAgentDag, 'BUILD_AGENT_DAG', { plan_key: 'plan_result', save_agent_dag_key: 'agent_dag' }, P.execDag, P.handleError),
    node(P.buildWorkAgent, 'BUILD_WORK_AGENT', { force_new: false }, P.execAgent, P.handleError),
    node(P.execAgent, 'EXEC_AGENT', { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, P.writeResult, P.handleError),
    node(P.execDag, 'EXEC_DAG', { agent_dag_key: 'agent_dag', save_results_key: 'agent_results' }, P.writeResult, P.handleError),
    node(P.writeResult, 'WRITE_RESULT', { agent_results_key: 'agent_results', save_response_key: 'final_response' }, P.evalResult, P.handleError),
    node(P.evalResult, 'EVAL_RESULT', { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, P.saveResponse, P.handleError),
    node(P.saveResponse, 'SAVE_RESPONSE', { response_key: 'final_response', update_work_status: 'COMPLETED' }, null, P.handleError),
    node(P.handleError, 'HANDLE_ERROR', { default_response: DEFAULT_ERROR_RESPONSE, update_work_status: 'FAILED' }, null),
  ],
};

/** 全部内置策略（按 label 排序，保证插入顺序稳定） */
export const BUILTIN_STRATEGIES: readonly BuiltinStrategyDefinition[] = [
  {
    label: 'SIMPLE',
    description: 'Simple strategy: build a single WorkAgent and execute it via JSONNode orchestration',
    definition: SIMPLE_DEFINITION,
  },
  {
    label: 'PLANNING',
    description: 'Planning strategy: decompose task via PlannerAgent, build Agent DAG and execute via JSONNode orchestration',
    definition: PLANNING_DEFINITION,
  },
];
