/**
 * @fileoverview StreamProvider 表结构与默认配置初始化。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { STREAM_CONFIG_TABLE } from '../domain/types';

export class StreamSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${STREAM_CONFIG_TABLE}" (
        "id"                        TEXT    NOT NULL PRIMARY KEY,
        "sse_heartbeat_interval_ms" INTEGER NOT NULL DEFAULT 15000,
        "chunk_min_chars"           INTEGER NOT NULL DEFAULT 2,
        "chunk_max_chars"           INTEGER NOT NULL DEFAULT 5,
        "created"                   INTEGER NOT NULL,
        "updated"                   INTEGER NOT NULL
      )
    `);

    // 初始化默认单行配置
    const rows = this.relationDb.queryRaw(`SELECT "id" FROM "${STREAM_CONFIG_TABLE}" LIMIT 1`);
    if (rows.length === 0) {
      const now = IdGenerator.now();
      this.relationDb.executeRaw(`
        INSERT INTO "${STREAM_CONFIG_TABLE}" (
          "id", "sse_heartbeat_interval_ms", "chunk_min_chars", "chunk_max_chars", "created", "updated"
        ) VALUES (
          'default_stream_config', 15000, 2, 5, ${now}, ${now}
        )
      `);
    }
  }
}
