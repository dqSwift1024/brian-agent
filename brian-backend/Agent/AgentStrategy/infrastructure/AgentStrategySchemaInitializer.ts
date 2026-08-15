import type { RelationDBAccess } from '@brian-agent/base';
import { AGENT_STRATEGY_TABLE, AGENT_STRATEGY_CONFIG_TABLE } from '../domain/types';

export class AgentStrategySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        strategy_id TEXT NOT NULL UNIQUE, strategy_label TEXT NOT NULL,
        suitable_complexity_min INTEGER NOT NULL, suitable_complexity_max INTEGER NOT NULL,
        suitable_domains TEXT NOT NULL, execution_rule TEXT NOT NULL,
        enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_created ON ${AGENT_STRATEGY_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_enable ON ${AGENT_STRATEGY_TABLE}(enable)`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        default_strategy_id TEXT NOT NULL, match_prompt_template_id TEXT NOT NULL
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_config_created ON ${AGENT_STRATEGY_CONFIG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_config_updated ON ${AGENT_STRATEGY_CONFIG_TABLE}(updated)`,
    );
  }
}
