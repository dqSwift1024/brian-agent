import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

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

    // 内置策略默认编排数据（jsonnode_definition）在 SQL 语句中制定
    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_strategy
        (id, created, updated, strategy_id, strategy_label, strategy_description, jsonnode_definition, enable)
      VALUES
        ('${simpleId}', ${now}, ${now}, '${simpleStrategyId}', 'SIMPLE', 'Simple strategy: build a single WorkAgent and execute it via JSONNode orchestration', '{"version":"1.0","orchestration_id":"builtin_simple","start_node":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","nodes":[{"node_id":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","node_type":"SAVE_USER_INPUT","params":{"info_type":"REQUEST","update_work_status":"PROCESSING"},"next":"319cc27a-a772-4fc3-ad17-83ee5308c738","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"319cc27a-a772-4fc3-ad17-83ee5308c738","node_type":"BUILD_WORK_CONTEXT","params":{"max_recent_works":5,"include_user_profile":true},"next":"7323f015-bd2a-482a-9b90-5dc174d8498f","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"7323f015-bd2a-482a-9b90-5dc174d8498f","node_type":"BUILD_WORK_AGENT","params":{"force_new":false},"next":"89f2cd05-40b0-416e-b2e0-9063713610b1","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"89f2cd05-40b0-416e-b2e0-9063713610b1","node_type":"EXEC_AGENT","params":{"agent_id_key":"current_agent_id","save_result_key":"agent_answer"},"next":"a235938b-4de9-4db1-b1b0-d186862444c8","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"a235938b-4de9-4db1-b1b0-d186862444c8","node_type":"WRITE_RESULT","params":{"agent_results_key":"agent_results","save_response_key":"final_response"},"next":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","node_type":"EVAL_RESULT","params":{"agent_results_key":"agent_results","final_response_key":"final_response","async":true},"next":"3fd5e18a-22b3-40db-985a-684a1ad51f76","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"3fd5e18a-22b3-40db-985a-684a1ad51f76","node_type":"SAVE_RESPONSE","params":{"response_key":"final_response","update_work_status":"COMPLETED"},"next":null,"on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","node_type":"HANDLE_ERROR","params":{"default_response":"抱歉，处理您的问题时出现了错误。","update_work_status":"FAILED"},"next":null}]}', 1),
        ('${planningId}', ${now}, ${now}, '${planningStrategyId}', 'PLANNING', 'Planning strategy: decompose task via PlannerAgent, build Agent DAG and execute via JSONNode orchestration', '{"version":"1.0","orchestration_id":"builtin_planning","start_node":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","nodes":[{"node_id":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","node_type":"SAVE_USER_INPUT","params":{"info_type":"REQUEST","update_work_status":"PROCESSING"},"next":"319cc27a-a772-4fc3-ad17-83ee5308c738","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"319cc27a-a772-4fc3-ad17-83ee5308c738","node_type":"BUILD_WORK_CONTEXT","params":{"max_recent_works":5,"include_user_profile":true},"next":"7323f015-bd2a-482a-9b90-5dc174d8498f","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"7323f015-bd2a-482a-9b90-5dc174d8498f","node_type":"PLAN_WORK","params":{"save_plan_key":"plan_result"},"next":"89f2cd05-40b0-416e-b2e0-9063713610b1","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"89f2cd05-40b0-416e-b2e0-9063713610b1","node_type":"CONDITION","params":{"field":"task_count","operator":"EQ","value":"1"},"next":null,"true_next":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","false_next":"a235938b-4de9-4db1-b1b0-d186862444c8","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"a235938b-4de9-4db1-b1b0-d186862444c8","node_type":"BUILD_AGENT_DAG","params":{"plan_key":"plan_result","save_agent_dag_key":"agent_dag"},"next":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","node_type":"BUILD_WORK_AGENT","params":{"force_new":false},"next":"3fd5e18a-22b3-40db-985a-684a1ad51f76","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3fd5e18a-22b3-40db-985a-684a1ad51f76","node_type":"EXEC_AGENT","params":{"agent_id_key":"current_agent_id","save_result_key":"agent_answer"},"next":"8287543e-3718-4130-9f13-8e397df9f585","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","node_type":"EXEC_DAG","params":{"agent_dag_key":"agent_dag","save_results_key":"agent_results"},"next":"8287543e-3718-4130-9f13-8e397df9f585","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"8287543e-3718-4130-9f13-8e397df9f585","node_type":"WRITE_RESULT","params":{"agent_results_key":"agent_results","save_response_key":"final_response"},"next":"3fd8e744-dada-49cc-a997-cce892b950a6","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3fd8e744-dada-49cc-a997-cce892b950a6","node_type":"EVAL_RESULT","params":{"agent_results_key":"agent_results","final_response_key":"final_response","async":true},"next":"1298946d-57e1-4b0a-99bb-217fba94ff9d","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"1298946d-57e1-4b0a-99bb-217fba94ff9d","node_type":"SAVE_RESPONSE","params":{"response_key":"final_response","update_work_status":"COMPLETED"},"next":null,"on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5","node_type":"HANDLE_ERROR","params":{"default_response":"抱歉，处理您的问题时出现了错误。","update_work_status":"FAILED"},"next":null}]}', 1)
    `);

    // 修复历史旧数据：确保内置策略始终使用固定 UUID 的编排定义
    this.relationDb.executeRaw(`
      UPDATE orchestration_strategy
      SET jsonnode_definition = '{"version":"1.0","orchestration_id":"builtin_simple","start_node":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","nodes":[{"node_id":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","node_type":"SAVE_USER_INPUT","params":{"info_type":"REQUEST","update_work_status":"PROCESSING"},"next":"319cc27a-a772-4fc3-ad17-83ee5308c738","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"319cc27a-a772-4fc3-ad17-83ee5308c738","node_type":"BUILD_WORK_CONTEXT","params":{"max_recent_works":5,"include_user_profile":true},"next":"7323f015-bd2a-482a-9b90-5dc174d8498f","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"7323f015-bd2a-482a-9b90-5dc174d8498f","node_type":"BUILD_WORK_AGENT","params":{"force_new":false},"next":"89f2cd05-40b0-416e-b2e0-9063713610b1","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"89f2cd05-40b0-416e-b2e0-9063713610b1","node_type":"EXEC_AGENT","params":{"agent_id_key":"current_agent_id","save_result_key":"agent_answer"},"next":"a235938b-4de9-4db1-b1b0-d186862444c8","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"a235938b-4de9-4db1-b1b0-d186862444c8","node_type":"WRITE_RESULT","params":{"agent_results_key":"agent_results","save_response_key":"final_response"},"next":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","node_type":"EVAL_RESULT","params":{"agent_results_key":"agent_results","final_response_key":"final_response","async":true},"next":"3fd5e18a-22b3-40db-985a-684a1ad51f76","on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"3fd5e18a-22b3-40db-985a-684a1ad51f76","node_type":"SAVE_RESPONSE","params":{"response_key":"final_response","update_work_status":"COMPLETED"},"next":null,"on_error":"8493f9ea-6cf8-4a99-b277-a73bfa920bed"},{"node_id":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","node_type":"HANDLE_ERROR","params":{"default_response":"抱歉，处理您的问题时出现了错误。","update_work_status":"FAILED"},"next":null}]}', updated = ${now}
      WHERE strategy_label = 'SIMPLE'
    `);
    this.relationDb.executeRaw(`
      UPDATE orchestration_strategy
      SET jsonnode_definition = '{"version":"1.0","orchestration_id":"builtin_planning","start_node":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","nodes":[{"node_id":"f8d50a2a-dfec-4d0a-a217-7be7f04c624d","node_type":"SAVE_USER_INPUT","params":{"info_type":"REQUEST","update_work_status":"PROCESSING"},"next":"319cc27a-a772-4fc3-ad17-83ee5308c738","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"319cc27a-a772-4fc3-ad17-83ee5308c738","node_type":"BUILD_WORK_CONTEXT","params":{"max_recent_works":5,"include_user_profile":true},"next":"7323f015-bd2a-482a-9b90-5dc174d8498f","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"7323f015-bd2a-482a-9b90-5dc174d8498f","node_type":"PLAN_WORK","params":{"save_plan_key":"plan_result"},"next":"89f2cd05-40b0-416e-b2e0-9063713610b1","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"89f2cd05-40b0-416e-b2e0-9063713610b1","node_type":"CONDITION","params":{"field":"task_count","operator":"EQ","value":"1"},"next":null,"true_next":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","false_next":"a235938b-4de9-4db1-b1b0-d186862444c8","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"a235938b-4de9-4db1-b1b0-d186862444c8","node_type":"BUILD_AGENT_DAG","params":{"plan_key":"plan_result","save_agent_dag_key":"agent_dag"},"next":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"341b3f6b-cff9-4c1b-8b38-fd70d29c51b1","node_type":"BUILD_WORK_AGENT","params":{"force_new":false},"next":"3fd5e18a-22b3-40db-985a-684a1ad51f76","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3fd5e18a-22b3-40db-985a-684a1ad51f76","node_type":"EXEC_AGENT","params":{"agent_id_key":"current_agent_id","save_result_key":"agent_answer"},"next":"8287543e-3718-4130-9f13-8e397df9f585","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"8493f9ea-6cf8-4a99-b277-a73bfa920bed","node_type":"EXEC_DAG","params":{"agent_dag_key":"agent_dag","save_results_key":"agent_results"},"next":"8287543e-3718-4130-9f13-8e397df9f585","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"8287543e-3718-4130-9f13-8e397df9f585","node_type":"WRITE_RESULT","params":{"agent_results_key":"agent_results","save_response_key":"final_response"},"next":"3fd8e744-dada-49cc-a997-cce892b950a6","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3fd8e744-dada-49cc-a997-cce892b950a6","node_type":"EVAL_RESULT","params":{"agent_results_key":"agent_results","final_response_key":"final_response","async":true},"next":"1298946d-57e1-4b0a-99bb-217fba94ff9d","on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"1298946d-57e1-4b0a-99bb-217fba94ff9d","node_type":"SAVE_RESPONSE","params":{"response_key":"final_response","update_work_status":"COMPLETED"},"next":null,"on_error":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5"},{"node_id":"3ef919cf-4cc3-44a5-a026-fec89a9ed3e5","node_type":"HANDLE_ERROR","params":{"default_response":"抱歉，处理您的问题时出现了错误。","update_work_status":"FAILED"},"next":null}]}', updated = ${now}
      WHERE strategy_label = 'PLANNING'
    `);
  }
}
