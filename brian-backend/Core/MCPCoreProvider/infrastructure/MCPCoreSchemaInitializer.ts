import type { RelationDBAccess } from '@brian-agent/base';
import {
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_TABLE,
  AGENT_MCP_USAGE_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CORE_CONFIG_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "regen_rate"           INTEGER NOT NULL DEFAULT ${DEFAULT_REGENERATE_RATE},
        "similarity_threshold" REAL    NOT NULL DEFAULT 0.7,
        "prompt_template_id"   TEXT
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_MCP_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "agent_id"      TEXT    NOT NULL,
        "mcp_id"        TEXT    NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${AGENT_MCP_TABLE}_agent_mcp" ON "${AGENT_MCP_TABLE}" ("agent_id", "mcp_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_MCP_TABLE}_agent_id" ON "${AGENT_MCP_TABLE}" ("agent_id")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_MCP_USAGE_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "agent_mcp_id"  TEXT    NOT NULL,
        "timestamp"     INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_MCP_USAGE_TABLE}_agent_mcp_id" ON "${AGENT_MCP_USAGE_TABLE}" ("agent_mcp_id")`,
    );
  }
}
