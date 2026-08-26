import type { RelationDBAccess } from '@brian-agent/base';
import { PROMPT_IDS } from '@brian-agent/base';

const STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID = PROMPT_IDS.strategySelector;

export class OrchestrationEntrySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_work (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        work_id TEXT NOT NULL UNIQUE,
        interact_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_query TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        orchestration_strategy TEXT NOT NULL DEFAULT '',
        task_count INTEGER NOT NULL DEFAULT 0,
        completed_task_count INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        cancel_reason TEXT,
        error_message TEXT,
        final_response TEXT,
        metadata TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_work_id ON orchestration_work(work_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_session_id ON orchestration_work(session_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_status ON orchestration_work(status)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_config (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
        strategy_prompt_template_id TEXT NOT NULL DEFAULT '',
        default_strategy TEXT NOT NULL DEFAULT 'SIMPLE',
        max_recent_works INTEGER NOT NULL DEFAULT 5,
        async_worker_interval INTEGER NOT NULL DEFAULT 1000,
        default_strategy_id TEXT,
        max_plan_retries INTEGER NOT NULL DEFAULT 2,
        max_concurrent INTEGER NOT NULL DEFAULT 1,
        dag_timeout_ms INTEGER NOT NULL DEFAULT 600000,
        max_execution_depth INTEGER NOT NULL DEFAULT 50,
        node_timeout_ms INTEGER NOT NULL DEFAULT 300000,
        trace_enabled INTEGER NOT NULL DEFAULT 1,
        max_nodes_in_graph INTEGER NOT NULL DEFAULT 50,
        enable_planner INTEGER NOT NULL DEFAULT 1
      )
    `);

    const now = Date.now();

    // 迁移：新增单 Agent 执行超时列（幂等）—— 必须在 INSERT 之前执行，确保旧表结构兼容
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE orchestration_config ADD COLUMN agent_timeout_ms INTEGER NOT NULL DEFAULT 300000`,
      );
    } catch { /* 列已存在 */ }

    // 迁移：新增 Planner 启用开关列（幂等）—— 必须在 INSERT 之前执行
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE orchestration_config ADD COLUMN enable_planner INTEGER NOT NULL DEFAULT 1`,
      );
    } catch { /* 列已存在 */ }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS prompt_template (
        id                    TEXT    NOT NULL PRIMARY KEY,
        created               INTEGER NOT NULL,
        updated               INTEGER NOT NULL,
        prompt_template_title TEXT    NOT NULL,
        prompt_template_brief TEXT,
        prompt_template       TEXT    NOT NULL,
        enable                INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_config
        (id, created, updated, complexity_decompose_threshold, strategy_prompt_template_id,
         default_strategy, max_recent_works, async_worker_interval, default_strategy_id,
         max_plan_retries, max_concurrent,
         dag_timeout_ms, max_execution_depth, node_timeout_ms, trace_enabled,
         max_nodes_in_graph, enable_planner)
      VALUES
        ('orchestration_config_default', ${now}, ${now}, 50,
         '${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}',
         'SIMPLE', 5, 1000, NULL,
         2, 1, 300000, 50, 300000, 1, 50, 1)
    `);

    this.relationDb.executeRaw(`
      UPDATE orchestration_config
      SET strategy_prompt_template_id = '${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}',
          updated = ${now}
      WHERE id = 'orchestration_config_default'
        AND (strategy_prompt_template_id = '' OR strategy_prompt_template_id IS NULL)
    `);

    // 迁移：节点级超时收敛到合理区间（<=10 分钟），避免单点卡死放大到 20 分钟以上
    this.relationDb.executeRaw(`
      UPDATE orchestration_config
      SET node_timeout_ms = 600000, updated = ${now}
      WHERE node_timeout_ms > 600000
    `);
  }
}
