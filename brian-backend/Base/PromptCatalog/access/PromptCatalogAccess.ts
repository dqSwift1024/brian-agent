/**
 * @fileoverview PromptCatalog 接入层：内置 Prompt 幂等种子化。
 *
 * 将 {@link BUILTIN_PROMPTS} 全部内置 Prompt 以稳定 ID 写入 prompt_template 表，
 * 已存在的按最新定义同步（标题 / 摘要 / 模板），保证内置 Prompt 始终 canonical。
 *
 * 说明：种子化在 PromptsAccess.initialize() 中执行一次。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import { PROMPT_TEMPLATE_TABLE } from '../../PromptsProvider/domain/types';
import { BUILTIN_PROMPTS } from '../catalog';

export class PromptCatalogAccess {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 幂等写入全部内置 Prompt（存在则更新标题/摘要/模板，不存在则插入）。
   */
  async seed(): Promise<void> {
    const now = IdGenerator.now();
    for (const def of BUILTIN_PROMPTS) {
      const existing = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
        { field: 'id', operator: Operator.EQ, value: def.id },
      ]);
      if (existing) {
        await this.relationDb.update(
          PROMPT_TEMPLATE_TABLE,
          [
            { field: 'prompt_template_title', value: def.title },
            { field: 'prompt_template_brief', value: def.brief },
            { field: 'prompt_template', value: def.template },
            { field: 'updated', value: now },
          ],
          [{ field: 'id', operator: Operator.EQ, value: def.id }],
        );
      } else {
        await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, [
          { field: 'id', value: def.id },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'prompt_template_title', value: def.title },
          { field: 'prompt_template_brief', value: def.brief },
          { field: 'prompt_template', value: def.template },
          { field: 'enable', value: 1 },
        ]);
      }
    }
  }
}
