/**
 * @fileoverview 单行配置表领域仓库（单行配置仓）。
 *
 * Core 层各 CoreProvider 的配置表均为"整表至多一行"的单行配置模式：
 * 读取（缓存 + 回退默认值）与更新（存在则 update、不存在则 insert）的逻辑在
 * LLM/Skill/Soul/MCP 四个 Core 服务中完全同构，本类将其收敛为唯一实现。
 *
 * 模式：Repository（单行配置仓）。字段级校验由各服务的 configXxxCore 负责，
 * 本类只承接已通过校验的字段补丁。
 */

import type { RelationDBAccess, DataObject } from '@brian-agent/base';
import { IdGenerator, Operator } from '@brian-agent/base';

/** 单行配置仓构造选项 */
export interface SingleRowConfigStoreOptions<T> {
  /** 配置表名 */
  table: string;
  /** 行 → 配置对象（含字段默认值回退） */
  toRecord: (row: Record<string, unknown>) => T;
  /** 首次访问且表为空时写入的默认行（不含 id/created/updated） */
  defaults: DataObject[];
}

/**
 * 单行配置仓。
 *
 * @typeParam T 配置记录类型
 */
export class SingleRowConfigStore<T> {
  /** 进程内配置缓存（null 表示未加载或已失效） */
  private cache: T | null = null;

  /**
   * @param db 关系数据库接入实例
   * @param opts 表名 / 行映射 / 默认行
   */
  constructor(
    private readonly db: RelationDBAccess,
    private readonly opts: SingleRowConfigStoreOptions<T>,
  ) {}

  /**
   * 读取配置（优先进程内缓存；表为空时写入默认行）。
   *
   * @returns 配置对象；极端异常情况下返回 null
   */
  async load(): Promise<T | null> {
    if (this.cache !== null) return this.cache;
    const row = await this.db.selectOne(this.opts.table, []);
    if (!row) {
      await this.ensureDefault();
      return this.cache;
    }
    this.cache = this.opts.toRecord(row);
    return this.cache;
  }

  /**
   * 应用字段补丁：表中有行则 update，否则插入首行（自动补 id/created/updated）。
   * 成功后使进程内缓存失效。
   *
   * @param patch 已通过业务校验的字段补丁
   */
  async upsert(patch: DataObject[]): Promise<void> {
    const now = IdGenerator.now();
    const existing = await this.db.selectOne(this.opts.table, []);
    const data: DataObject[] = [...patch, { field: 'updated', value: now }];
    if (existing?.id) {
      await this.db.update(
        this.opts.table,
        data,
        [{ field: 'id', operator: Operator.EQ, value: String(existing.id) }],
      );
    } else {
      // 表约束补齐：defaults 中的字段若补丁未携带则写入默认值
      const pad = this.opts.defaults.filter((d) => !data.some((x) => x.field === d.field));
      await this.db.insert(this.opts.table, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        ...pad,
        ...data,
      ]);
    }
    this.cache = null;
  }

  /** 使进程内缓存失效（外部直接改表后调用） */
  invalidate(): void {
    this.cache = null;
  }

  /** 表为空时写入默认行（幂等） */
  private async ensureDefault(): Promise<void> {
    const now = IdGenerator.now();
    await this.db.insert(this.opts.table, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      ...this.opts.defaults,
    ]);
    const row = await this.db.selectOne(this.opts.table, []);
    this.cache = row ? this.opts.toRecord(row) : null;
  }
}
