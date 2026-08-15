import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

function buildSimpleJsonNodeDefinition(): string {
  const n1 = IdGenerator.generate();
  const n2 = IdGenerator.generate();
  const n3 = IdGenerator.generate();
  const n4 = IdGenerator.generate();
  const n5 = IdGenerator.generate();
  const n6 = IdGenerator.generate();
  const n7 = IdGenerator.generate();
  const n8 = IdGenerator.generate();

  return JSON.stringify({
    version: '1.0',
    orchestration_id: 'builtin_simple',
    start_node: n1,
    nodes: [
      {
        node_id: n1,
        node_type: 'SAVE_USER_INPUT',
        params: { info_type: 'REQUEST', update_work_status: 'PROCESSING' },
        next: n2,
        on_error: n8,
      },
      {
        node_id: n2,
        node_type: 'BUILD_WORK_CONTEXT',
        params: { max_recent_works: 5, include_user_profile: true },
        next: n3,
        on_error: n8,
      },
      {
        node_id: n3,
        node_type: 'BUILD_WORK_AGENT',
        params: { force_new: false },
        next: n4,
        on_error: n8,
      },
      {
        node_id: n4,
        node_type: 'EXEC_AGENT',
        params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' },
        next: n5,
        on_error: n8,
      },
      {
        node_id: n5,
        node_type: 'WRITE_RESULT',
        params: { agent_results_key: 'agent_results', save_response_key: 'final_response' },
        next: n6,
        on_error: n8,
      },
      {
        node_id: n6,
        node_type: 'EVAL_RESULT',
        params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true },
        next: n7,
        on_error: n8,
      },
      {
        node_id: n7,
        node_type: 'SAVE_RESPONSE',
        params: { response_key: 'final_response', update_work_status: 'COMPLETED' },
        next: null,
        on_error: n8,
      },
      {
        node_id: n8,
        node_type: 'HANDLE_ERROR',
        params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' },
        next: null,
      },
    ],
  });
}

function buildPlanningJsonNodeDefinition(): string {
  const n1 = IdGenerator.generate();
  const n2 = IdGenerator.generate();
  const n3 = IdGenerator.generate();
  const n4 = IdGenerator.generate();
  const n5 = IdGenerator.generate();
  const n6 = IdGenerator.generate();
  const n7 = IdGenerator.generate();
  const n8 = IdGenerator.generate();
  const n9 = IdGenerator.generate();
  const n10 = IdGenerator.generate();
  const n11 = IdGenerator.generate();
  const n12 = IdGenerator.generate();

  return JSON.stringify({
    version: '1.0',
    orchestration_id: 'builtin_planning',
    start_node: n1,
    nodes: [
      {
        node_id: n1,
        node_type: 'SAVE_USER_INPUT',
        params: { info_type: 'REQUEST', update_work_status: 'PROCESSING' },
        next: n2,
        on_error: n12,
      },
      {
        node_id: n2,
        node_type: 'BUILD_WORK_CONTEXT',
        params: { max_recent_works: 5, include_user_profile: true },
        next: n3,
        on_error: n12,
      },
      {
        node_id: n3,
        node_type: 'PLAN_WORK',
        params: { save_plan_key: 'plan_result' },
        next: n4,
        on_error: n12,
      },
      {
        node_id: n4,
        node_type: 'CONDITION',
        params: { field: 'task_count', operator: 'EQ', value: '1' },
        next: null,
        true_next: n6,
        false_next: n5,
        on_error: n12,
      },
      {
        node_id: n5,
        node_type: 'BUILD_AGENT_DAG',
        params: { plan_key: 'plan_result', save_agent_dag_key: 'agent_dag' },
        next: n8,
        on_error: n12,
      },
      {
        node_id: n6,
        node_type: 'BUILD_WORK_AGENT',
        params: { force_new: false },
        next: n7,
        on_error: n12,
      },
      {
        node_id: n7,
        node_type: 'EXEC_AGENT',
        params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' },
        next: n9,
        on_error: n12,
      },
      {
        node_id: n8,
        node_type: 'EXEC_DAG',
        params: { agent_dag_key: 'agent_dag', max_concurrent: 1, save_results_key: 'agent_results' },
        next: n9,
        on_error: n12,
      },
      {
        node_id: n9,
        node_type: 'WRITE_RESULT',
        params: { agent_results_key: 'agent_results', save_response_key: 'final_response' },
        next: n10,
        on_error: n12,
      },
      {
        node_id: n10,
        node_type: 'EVAL_RESULT',
        params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true },
        next: n11,
        on_error: n12,
      },
      {
        node_id: n11,
        node_type: 'SAVE_RESPONSE',
        params: { response_key: 'final_response', update_work_status: 'COMPLETED' },
        next: null,
        on_error: n12,
      },
      {
        node_id: n12,
        node_type: 'HANDLE_ERROR',
        params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' },
        next: null,
      },
    ],
  });
}

export class OrchestrationStrategySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_strategy (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        strategy_id TEXT NOT NULL UNIQUE,
        strategy_label TEXT NOT NULL UNIQUE,
        strategy_description TEXT NOT NULL,
        jsonnode_definition TEXT NOT NULL,
        enable INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_strategy_id ON orchestration_strategy(strategy_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_label ON orchestration_strategy(strategy_label)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_strategy_execution (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        execution_id TEXT NOT NULL UNIQUE,
        work_id TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        plan_id TEXT,
        plan_retry_count INTEGER NOT NULL DEFAULT 0,
        execution_status TEXT NOT NULL,
        error_info TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_execution_id ON orchestration_strategy_execution(execution_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_work_id ON orchestration_strategy_execution(work_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_strategy_id ON orchestration_strategy_execution(strategy_id)',
    );

    const now = Date.now();
    const simpleId = IdGenerator.generate();
    const planningId = IdGenerator.generate();
    const simpleStrategyId = IdGenerator.generate();
    const planningStrategyId = IdGenerator.generate();

    const simpleJsonNodeDefinition = buildSimpleJsonNodeDefinition();
    const planningJsonNodeDefinition = buildPlanningJsonNodeDefinition();

    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_strategy
        (id, created, updated, strategy_id, strategy_label, strategy_description, jsonnode_definition, enable)
      VALUES
        ('${simpleId}', ${now}, ${now}, '${simpleStrategyId}', 'SIMPLE', 'Simple strategy: build a single WorkAgent and execute it via JSONNode orchestration', '${simpleJsonNodeDefinition.replace(/'/g, "''")}', 1),
        ('${planningId}', ${now}, ${now}, '${planningStrategyId}', 'PLANNING', 'Planning strategy: decompose task via PlannerAgent, build Agent DAG and execute via JSONNode orchestration', '${planningJsonNodeDefinition.replace(/'/g, "''")}', 1)
    `);
  }
}
