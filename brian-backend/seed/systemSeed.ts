/**
 * @fileoverview 系统数据种子（通用数据）导入。
 *
 * 发行包在 server/seed/system-seed.json 携带目录类通用数据
 * （模型提供商目录、MCP 提供商目录等，见 packaging/export-system-data.mjs
 * 的分类规则）；后端启动时若设置了 BRIAN_SEED_FILE 则导入。
 *
 * 幂等保证：仅对**空表**导入（表中已有数据说明用户已在用，一概不覆盖）。
 */

import fs from 'node:fs';
import type { RelationDBAccess } from '../Base/RelationDBProvider/access/RelationDBAccess';

interface SeedTable {
  table: string;
  rows: Array<Record<string, unknown>>;
}

interface SystemSeed {
  kind: string;
  version: number;
  tables: SeedTable[];
}

export interface SeedApplyResult {
  /** (表名, 导入行数)；跳过的表不在其中 */
  imported: Array<{ table: string; rows: number }>;
  skipped: string[];
}

/**
 * 应用系统数据种子。
 * @param seedPath JSON 种子文件路径（BRIAN_SEED_FILE）
 */
export async function applySystemSeed(
  relationDb: RelationDBAccess,
  seedPath: string,
): Promise<SeedApplyResult> {
  if (!fs.existsSync(seedPath)) return { imported: [], skipped: [] };

  let seed: SystemSeed;
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SystemSeed;
  } catch (e) {
    throw new Error(`种子文件解析失败: ${seedPath} - ${(e as Error).message}`);
  }
  if (seed.kind !== 'brian-system-seed' || !Array.isArray(seed.tables)) {
    throw new Error(`种子文件格式不正确（kind=${(seed as { kind?: string }).kind}）`);
  }

  const result: SeedApplyResult = { imported: [], skipped: [] };

  for (const { table, rows } of seed.tables) {
    if (!table || !Array.isArray(rows) || rows.length === 0) continue;

    // 幂等：空表才导入，绝不覆盖运行中产生的数据
    const countRows = relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) AS c FROM "${table}"`, [],
    );
    if ((countRows?.[0]?.c ?? 0) > 0) {
      result.skipped.push(table);
      continue;
    }

    for (const row of rows) {
      const keys = Object.keys(row);
      if (keys.length === 0) continue;
      const cols = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((k) => row[k]);
      relationDb.executeRaw(
        `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`, values,
      );
    }
    result.imported.push({ table, rows: rows.length });
  }

  return result;
}
