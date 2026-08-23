/**
 * @fileoverview Agent 执行轨迹（trace）领域模型。
 *
 * 核心思想：轨迹只存「食材」（模板引用 + 小变量 + 输出），不存「成品」（渲染后的完整 prompt）。
 * 完整 prompt 在展示时经 PromptProvider 用模板引用 + 上下文/历史重建，避免
 * 上下文（context_data）被每个 Agent × 每轮迭代重复内联导致指数级膨胀。
 */

/**
 * Prompt 引用：替代完整 prompt 字符串。
 *
 * 仅保留渲染所需的小变量与模板引用；`context_data`（召回上下文）与 `history`
 * （ReACT 累积历史）不在此存储，展示时分别按 work_id 与 iterations 重建。
 */
export interface PromptReference {
  /** prompt 模板 id（如 builtin.think / 配置的自定义模板 id） */
  template_id: string;
  /** 渲染变量（小体积；不含 context_data / history / soul 全文） */
  variables: PromptVariables;
}

/** 可重建 prompt 的最小变量集（各阶段略有差异，可选字段按阶段填充）。 */
export interface PromptVariables {
  task_content: string;
  agent_name: string;
  domain: string;
  iteration?: number;
  max_iterations?: number;
  tools_json: string;
  /** soul 以 id 引用，展示时按 id 取内容，避免重复内联 soul 全文 */
  soul_id: string;
}

/** Think 阶段轨迹（去 prompt 化后）。 */
export interface ThinkStep {
  reasoning: string;
  next_action: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

/** Act 阶段轨迹（无 LLM 调用，无 prompt）。 */
export interface ActStep {
  result: string;
  tool_type: string;
  tool_id: string;
}

/** Reflect 阶段轨迹（去 prompt 化后）。 */
export interface ReflectStep {
  should_continue: boolean;
  reflection: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

/** Answer 阶段轨迹（去 prompt 化后）。 */
export interface AnswerStep {
  answer: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

/** 一轮迭代轨迹（think / act / reflect / answer 至少其一）。 */
export interface TraceIterationRecord {
  iteration_index: number;
  think?: ThinkStep;
  act?: ActStep;
  reflect?: ReflectStep;
  answer?: AnswerStep;
  iteration_elapsed_ms: number;
}

/** 持久化到 agent_execution_trace.iterations_json 的完整轨迹。 */
export type TraceIterations = TraceIterationRecord[];

/** info_raw 中 ACT 类型的轻量 trace 引用（供 ChatMap 展示，不含完整 iterations）。 */
export interface LightTraceRef {
  type: 'trace';
  trace_id: string;
  answer: string;
  total_token_usage: number;
}
