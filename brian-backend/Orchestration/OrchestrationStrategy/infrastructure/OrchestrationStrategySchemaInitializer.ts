import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { BUILTIN_STRATEGIES } from '../domain/builtinStrategies';

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

    // 内置策略采用「INSERT OR IGNORE + UPDATE」的幂等 upsert：
    //  - 首次安装时按 label 插入（strategy_id 随机生成）；
    //  - 后续启动时按 label 同步 jsonnode_definition，保证「代码即事实」，
    //    即使历史数据定义漂移也会被自动修正，且不依赖脆弱的 SQL 字符串拼接。
    const now = IdGenerator.now();
    for (const builtin of BUILTIN_STRATEGIES) {
      const id = IdGenerator.generate();
      const strategyId = IdGenerator.generate();
      const definitionJson = JSON.stringify(builtin.definition);

      this.relationDb.executeRaw(
        `INSERT OR IGNORE INTO orchestration_strategy
           (id, created, updated, strategy_id, strategy_label, strategy_description, jsonnode_definition, enable)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, now, now, strategyId, builtin.label, builtin.description, definitionJson],
      );

      this.relationDb.executeRaw(
        `UPDATE orchestration_strategy
         SET jsonnode_definition = ?, strategy_description = ?, updated = ?
         WHERE strategy_label = ?`,
        [definitionJson, builtin.description, now, builtin.label],
      );
    }
  }
}
