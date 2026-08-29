/**
 * @fileoverview SoulProvider 应用服务层（流程编排 only）。
 *
 * 数据加工已下沉至领域服务 `domain/services/SoulDomainService.ts`；
 * 记录组装复用 `shared/query/RecordBuilder`（newRecord/newPatch）。
 *
 * 实现所有用例：addSoul / delSoul / updateSoul / soSoulById / soSoul /
 * enableSoul / closeSoul / recordSoulUsage。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { newPatch, newRecord } from '../../shared/query';
import { Operator } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';
import {
  SoulContext, SoulRecord, AddSoulInput, AddSoulOutput, DelSoulInput, DelSoulOutput, UpdateSoulInput, UpdateSoulOutput, GetSoulInput, GetSoulOutput, SoSoulInput, SoSoulOutput, EnableSoulInput, EnableSoulOutput, CloseSoulInput, CloseSoulOutput, RecordSoulUsageInput, RecordSoulUsageOutput, SOUL_TABLE, SOUL_USAGE_TABLE, SOUL_CONFIG_TABLE,
} from '../domain/types';
import {
  aggregateUsageStats,
  buildKeywordConditions,
  hasUsageSorting,
  paginate,
  resolveTargetConditions,
  sortByOrder,
} from '../domain/services/SoulDomainService';
import type { SoulUsageRow } from '../domain/services/SoulDomainService';

/**
 * SoulProvider 应用服务。
 *
 * SoulProvider 是 Soul 的唯一操作入口，上层不可直接操作数据库。
 */
export class SoulService {
  /** 运行时启用状态 */
  private enabled = true;

  /** 是否已执行 closeSoul（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   */
  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, SOUL_CONFIG_TABLE);
  }

  /**
   * 初始化：恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用（closed 为终态，优先级高于 enabled）。
   *
   * @throws DatabaseError 组件已关闭
   * @throws ComponentDisabledError 组件被禁用
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        'Soul 组件已关闭（closeSoul 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('Soul');
    }
  }

  /**
   * 新增 Soul（addSoul）。
   *
   * PRD 3.1.1 条。
   *
   * @param input.data Soul 内容（soul_content / soul_brief / soul_usage / enable）
   * @param output.id 新增记录 ID
   */
  async addSoul(input: AddSoulInput, output: AddSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    const id = IdGenerator.generate();
    await this.relationDb.insert(
      SOUL_TABLE,
      newRecord({
        id,
        soul_content: data.soul_content,
        soul_brief: data.soul_brief,
        soul_usage: data.soul_usage,
        enable: data.enable !== false ? 1 : 0,
      }),
    );
    output.id = id;
    return true;
  }

  /**
   * 删除 Soul（delSoul）。
   *
   * PRD 3.1.2 条：支持按 ID 批量删除或按条件删除；
   * 按 ids 删除时级联清理 soul_usage 中的引用记录。
   *
   * @throws ValidationError ids 与 conditions 均未传
   */
  async delSoul(input: DelSoulInput, output: DelSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    output.affected_rows = await this.relationDb.delete(SOUL_TABLE, conditions);

    // 清理 soul_usage 表中引用该 Soul 的记录
    if (input.ids) {
      await this.relationDb.delete(SOUL_USAGE_TABLE, [
        { field: 'soul_id', operator: Operator.IN, value: input.ids },
      ]);
    }
    return true;
  }

  /**
   * 更新 Soul（updateSoul）。
   *
   * PRD 3.1.3 条：支持按 ID 或按条件更新；
   * 资源级启用/禁用通过修改 enable 字段实现。
   *
   * @throws ValidationError id 与 conditions 均未传
   */
  async updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const patch = input.data;
    const data = newPatch({
      soul_content: patch.soul_content,
      soul_brief: patch.soul_brief,
      soul_usage: patch.soul_usage,
      enable: patch.enable !== undefined ? (patch.enable ? 1 : 0) : undefined,
    });

    output.affected_rows = await this.relationDb.update(SOUL_TABLE, data, conditions);
    return true;
  }

  /**
   * 获取 Soul（soSoulById）。
   *
   * PRD 3.1.4 条：按 ID 或按条件获取第一条。
   *
   * @throws ValidationError id 与 conditions 均未传
   */
  async soSoulById(input: GetSoulInput, output: GetSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const row = await this.relationDb.selectOne(SOUL_TABLE, conditions);
    output.soul = row ? (row as unknown as SoulRecord) : null;
    return true;
  }

  /**
   * 搜索 Soul（soSoul）。
   *
   * PRD 3.1.5 条：支持关键词、条件过滤、排序、分页。
   * 关键词匹配 soul_content 与 soul_brief（OR）；
   * 按 usage_* 排序时由领域服务聚合 soul_usage 统计后在内存排序分页。
   */
  async soSoul(input: SoSoulInput, output: SoSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 关键词命中可能跨 content/brief 两列，flat conditions 无法表达分组，
    // 先用关键词查出 ID 再以 IN 组合用户条件
    let keywordIds: string[] | undefined;
    if (input.keyword) {
      const keywordRows = await this.relationDb.select(SOUL_TABLE, {
        conditions: buildKeywordConditions(input.keyword),
        fields: ['id'],
      });
      keywordIds = keywordRows.map((r) => r.id as string);
      if (keywordIds.length === 0) {
        output.list = [];
        output.total = 0;
        return true;
      }
    }

    const conditions: Condition[] = [];
    if (keywordIds) {
      conditions.push({ field: 'id', operator: Operator.IN, value: keywordIds });
    }
    if (input.conditions) {
      conditions.push(...input.conditions);
    }

    if (hasUsageSorting(input.order_by)) {
      await this.soSoulWithUsageSorting(
        conditions.length > 0 ? conditions : undefined,
        input.order_by!,
        input.page,
        output,
      );
      return true;
    }

    const rows = await this.relationDb.select(SOUL_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    output.list = rows as unknown as SoulRecord[];
    output.total = await this.relationDb.count(
      SOUL_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    return true;
  }

  /**
   * 按使用频率排序的搜索实现（流程：取全量 → 领域服务聚合 → 排序 → 分页）。
   */
  private async soSoulWithUsageSorting(
    conditions: Condition[] | undefined,
    orderBy: OrderBy[],
    page: Page | undefined,
    output: SoSoulOutput,
  ): Promise<void> {
    const rows = await this.relationDb.select(SOUL_TABLE, { conditions });
    const souls = rows as unknown as SoulRecord[];
    if (souls.length === 0) {
      output.list = [];
      output.total = 0;
      return;
    }

    const usageRows = await this.relationDb.select(SOUL_USAGE_TABLE, {});
    const usageMap = aggregateUsageStats(
      usageRows as unknown as SoulUsageRow[],
      IdGenerator.today(),
      this.daysAgo(7),
      this.daysAgo(30),
    );

    sortByOrder(souls, orderBy, usageMap);
    output.list = paginate(souls, page);
    output.total = souls.length;
  }

  /**
   * 获取 N 天前的日期字符串（YYYY-MM-DD）。
   */
  private daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 启用/禁用 Soul 组件（enableSoul）。
   *
   * PRD 3.2.1 条：运行时控制 Soul 组件的可用状态，状态持久化到 soul_config。
   * 注：closeSoul 为终态操作，执行后不可通过本方法恢复。
   *
   * @throws DatabaseError 组件已关闭
   */
  async enableSoul(input: EnableSoulInput, _output: EnableSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        'Soul 组件已关闭（closeSoul 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'Soul 组件是否启用（enableSoul 读写）',
    );
    return true;
  }

  /**
   * 关闭 Soul 组件（closeSoul）。
   *
   * PRD 5.6 条：系统关闭时的终态释放。SoulProvider 不持有独立数据库连接
   * （使用 RelationDBProvider 共享连接），本方法仅标记终态。
   */
  async closeSoul(_input: CloseSoulInput, _output: CloseSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // Soul 使用统计
  // -------------------------------------------------------------------------

  /**
   * 记录 Soul 使用次数（recordSoulUsage）。
   *
   * 按天统计，upsert 语义：当天记录存在则 usage_count + 1，否则新增。
   *
   * @throws ValidationError soul_id 为空
   */
  async recordSoulUsage(input: RecordSoulUsageInput, _output: RecordSoulUsageOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.soul_id) {
      throw new ValidationError('soul_id 不能为空');
    }

    const usageDate = IdGenerator.today();

    const existing = await this.relationDb.selectOne(SOUL_USAGE_TABLE, [
      { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
      { field: 'usage_date', operator: Operator.EQ, value: usageDate },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      await this.relationDb.update(
        SOUL_USAGE_TABLE,
        newPatch({ usage_count: currentCount + 1 }),
        [
          { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
          { field: 'usage_date', operator: Operator.EQ, value: usageDate },
        ],
      );
    } else {
      await this.relationDb.insert(
        SOUL_USAGE_TABLE,
        newRecord({ soul_id: input.soul_id, usage_date: usageDate, usage_count: 1 }),
      );
    }
    return true;
  }
}
