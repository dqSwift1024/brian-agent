/**
 * @fileoverview ToolProvider 表结构初始化。
 *
 * 仅创建 tool_config 配置表（key-value 结构），用于存储 HTTP 超时等全局配置。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { TOOL_CONFIG_TABLE } from '../domain/types';

export class ToolSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${TOOL_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}