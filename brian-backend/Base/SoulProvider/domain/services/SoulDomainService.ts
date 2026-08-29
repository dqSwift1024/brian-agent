/**
 * @fileoverview Soul 领域服务：纯业务规则与数据加工，零 I/O、零 access 依赖。
 *
 * 从 SoulService 剥离的数据处理职责（流程控制仍留在应用服务）：
 * - 目标条件解析（delSoul / updateSoul / soSoulById 三处同构逻辑归一）
 * - 关键词 LIKE 条件组装
 * - 使用统计聚合（今日 / 近 7 天 / 近 30 天 / 总量 四维）
 * - usage 加权排序与分页
 */

import type { Condition, OrderBy, Page } from '../../../shared/query';
import { Operator, Logic } from '../../../shared/query';
import type { SoulRecord } from '../types';

/** Soul 单日使用统计行（soul_usage 表记录的业务子集） */
export interface SoulUsageRow {
  soul_id: string;
  usage_date: string;
  usage_count: number;
}

/** 四维使用统计 */
export interface SoulUsageStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

/**
 * 解析操作目标条件：id / ids / conditions 三选一归一为 Condition[]。
 *
 * @param params 单条 id、批量 ids、或显式 conditions
 * @returns 条件数组；三者皆空时返回 null（由调用方决定是否抛校验错误）
 */
export function resolveTargetConditions(params: {
  id?: string;
  ids?: string[];
  conditions?: Condition[];
}): Condition[] | null {
  if (params.id) {
    return [{ field: 'id', operator: Operator.EQ, value: params.id }];
  }
  if (params.ids) {
    return [{ field: 'id', operator: Operator.IN, value: params.ids }];
  }
  if (params.conditions && params.conditions.length > 0) {
    return params.conditions;
  }
  return null;
}

/**
 * 组装关键词 LIKE 条件：soul_content 与 soul_brief 二选一命中（OR）。
 *
 * @param keyword 关键词
 */
export function buildKeywordConditions(keyword: string): Condition[] {
  return [
    { field: 'soul_content', operator: Operator.LIKE, value: `%${keyword}%` },
    { field: 'soul_brief', operator: Operator.LIKE, value: `%${keyword}%`, logic: Logic.OR },
  ];
}

/**
 * 聚合使用统计：按 soul_id 归并每日计数，计算今日 / 近 7 天 / 近 30 天 / 总量。
 *
 * @param usageRows soul_usage 全表行
 * @param today 今日日期（YYYY-MM-DD）
 * @param sevenDaysAgo 7 天前日期
 * @param thirtyDaysAgo 30 天前日期
 */
export function aggregateUsageStats(
  usageRows: SoulUsageRow[],
  today: string,
  sevenDaysAgo: string,
  thirtyDaysAgo: string,
): Map<string, SoulUsageStats> {
  const usageMap = new Map<string, SoulUsageStats>();
  for (const row of usageRows) {
    let stats = usageMap.get(row.soul_id);
    if (!stats) {
      stats = { today: 0, week: 0, month: 0, total: 0 };
      usageMap.set(row.soul_id, stats);
    }
    const cnt = row.usage_count ?? 0;
    stats.total += cnt;
    if (row.usage_date === today) stats.today += cnt;
    if (row.usage_date >= sevenDaysAgo) stats.week += cnt;
    if (row.usage_date >= thirtyDaysAgo) stats.month += cnt;
  }
  return usageMap;
}

/**
 * 读取单个 Soul 在指定 usage_ 字段上的统计值。
 *
 * @param field 支持 usage_today_count / usage_7d_count / usage_30d_count / usage_total_count
 */
export function getUsageValue(
  soul: SoulRecord,
  field: string,
  usageMap: Map<string, SoulUsageStats>,
): number {
  const stats = usageMap.get(soul.id);
  if (!stats) return 0;
  switch (field) {
    case 'usage_today_count':
      return stats.today;
    case 'usage_7d_count':
      return stats.week;
    case 'usage_30d_count':
      return stats.month;
    case 'usage_total_count':
      return stats.total;
    default:
      return 0;
  }
}

/**
 * 判断排序字段是否为 usage 统计字段（需走内存聚合排序）。
 */
export function hasUsageSorting(orderBy: OrderBy[] | undefined): boolean {
  return !!orderBy?.some(
    (ob) => typeof ob.field === 'string' && ob.field.startsWith('usage_'),
  );
}

/**
 * 内存排序：支持多字段、ASC/DESC、usage_ 统计字段与普通字段混合；null 值按方向沉底。
 *
 * @param souls 待排序列表（原地排序后返回）
 * @param orderBy 排序说明
 * @param usageMap 使用统计（usage_ 字段取值来源）
 */
export function sortByOrder(
  souls: SoulRecord[],
  orderBy: OrderBy[],
  usageMap: Map<string, SoulUsageStats>,
): SoulRecord[] {
  souls.sort((a, b) => {
    for (const ob of orderBy) {
      const isDesc = ob.direction === 'DESC';
      let valA: unknown;
      let valB: unknown;

      if (typeof ob.field === 'string' && ob.field.startsWith('usage_')) {
        valA = getUsageValue(a, ob.field, usageMap);
        valB = getUsageValue(b, ob.field, usageMap);
      } else {
        valA = (a as unknown as Record<string, unknown>)[ob.field];
        valB = (b as unknown as Record<string, unknown>)[ob.field];
      }

      if (valA === null || valA === undefined) {
        return valB === null || valB === undefined ? 0 : isDesc ? 1 : -1;
      }
      if (valB === null || valB === undefined) {
        return isDesc ? -1 : 1;
      }
      if (valA < valB) return isDesc ? 1 : -1;
      if (valA > valB) return isDesc ? -1 : 1;
    }
    return 0;
  });
  return souls;
}

/**
 * 内存分页：按 page.current / page.size 切片；未传分页时原样返回。
 */
export function paginate<T>(items: T[], page: Page | undefined): T[] {
  if (!page) return items;
  const start = (page.current - 1) * page.size;
  return items.slice(start, start + page.size);
}
