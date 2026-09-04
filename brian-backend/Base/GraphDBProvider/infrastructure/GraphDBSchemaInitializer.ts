/**
 * @fileoverview GraphDBProvider 配置表结构初始化。
 *
 * 图数据表由 LeanGraph 自动管理，无需显式创建。
 * 配置表 graphdb_config 通过 RelationDBAccess.executeRaw() 在主 SQLite 中创建。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { GRAPHDB_CONFIG_TABLE } from '../domain/types';

/**
 * GraphDBProvider 配置表初始化器。
 */
export class GraphDBSchemaInitializer {
  constructor(
    private readonly relationDb: RelationDBAccess,
  ) {}

  /**
   * 初始化配置表（幂等）。
   */
  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${GRAPHDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}