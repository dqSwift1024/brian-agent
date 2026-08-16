/**
 * @fileoverview Cron 表达式工具（无状态纯函数）。
 *
 * 采用 6 字段 Quartz 风格 cron：`秒 分 时 日 月 周`。
 * 各字段取值范围：
 *   - 秒   second：0-59
 *   - 分   minute：0-59
 *   - 时   hour：0-23
 *   - 日   day：1-31（月中的第几天）
 *   - 月   month：1-12
 *   - 周   week：0-6（0=周日，6=周六），兼容 7 表示周日
 *
 * 字段语法支持：`*`（任意）、单值（如 `5`）、列表（如 `1,15,30`）、
 * 区间（如 `10-20`）、步长（如 `*`/5、`10-20`/2）。
 *
 * 兼容 5 字段标准 cron（分 时 日 月 周）：自动在最前面补 `0` 作为秒字段。
 */

/** Cron 字段定义（生成/解析用） */
export interface CronFields {
  second: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  week: string;
}

/** Cron 校验结果 */
export interface CronCheckResult {
  valid: boolean;
  error: string;
  /** 归一化后的 6 字段表达式（合法时有效） */
  normalized: string;
}

/** 字段范围定义 */
const FIELD_RANGES: Record<keyof CronFields, { min: number; max: number }> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  day: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  week: { min: 0, max: 7 },
};

const FIELD_ORDER: Array<keyof CronFields> = ['second', 'minute', 'hour', 'day', 'month', 'week'];

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEK_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** 月份名称 → 数字（不区分大小写），无匹配返回 null */
function resolveMonthName(token: string): number | null {
  const lower = token.toLowerCase();
  return MONTH_NAMES[lower] ?? null;
}

/** 周名称 → 数字（0=周日），无匹配返回 null */
function resolveWeekName(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower === '7' || lower === 'sunday') return 0;
  return WEEK_NAMES[lower] ?? null;
}

/** 校验单个字段表达式（支持 *、单值、列表、区间、步长） */
function validateField(field: keyof CronFields, expr: string): string | null {
  const range = FIELD_RANGES[field];
  if (!expr || expr.trim() === '') return `${field} 字段不能为空`;

  const parts = expr.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part === '') return `${field} 字段包含空项`;

    // 步长
    let step = 1;
    let base = part;
    const slashIdx = part.indexOf('/');
    if (slashIdx >= 0) {
      base = part.slice(0, slashIdx);
      const stepStr = part.slice(slashIdx + 1);
      if (!/^\d+$/.test(stepStr)) return `${field} 字段步长非法：${part}`;
      step = parseInt(stepStr, 10);
      if (step <= 0) return `${field} 字段步长必须为正整数：${part}`;
    }

    if (base === '*') {
      // */step 合法
      continue;
    }

    if (base.includes('-')) {
      const seg = base.split('-');
      if (seg.length !== 2) return `${field} 字段区间非法：${part}`;
      const lo = resolveValue(field, seg[0]);
      const hi = resolveValue(field, seg[1]);
      if (lo === null || hi === null) return `${field} 字段区间值非法：${part}`;
      if (lo < range.min || hi > range.max) return `${field} 字段区间超出范围 ${range.min}-${range.max}：${part}`;
      if (lo > hi) return `${field} 字段区间起止颠倒：${part}`;
      continue;
    }

    const val = resolveValue(field, base);
    if (val === null) return `${field} 字段值非法：${part}`;
    if (val < range.min || val > range.max) return `${field} 字段值超出范围 ${range.min}-${range.max}：${part}`;
  }
  return null;
}

/** 解析单个值（数字 / 月份名 / 周名），返回数字或 null */
function resolveValue(field: keyof CronFields, token: string): number | null {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    return parseInt(t, 10);
  }
  if (field === 'month') {
    return resolveMonthName(t);
  }
  if (field === 'week') {
    return resolveWeekName(t);
  }
  return null;
}

/** 将表达式归一化为 6 字段（兼容 5 字段与 7 字段） */
export function normalizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    return `0 ${parts.join(' ')}`;
  }
  if (parts.length === 7) {
    return parts.slice(0, 6).join(' ');
  }
  if (parts.length === 6) {
    return parts.join(' ');
  }
  return expr.trim();
}

/** 校验 cron 表达式，返回归一化后的结果 */
export function checkCron(expr: string): CronCheckResult {
  if (!expr || expr.trim() === '') {
    return { valid: false, error: 'cron 表达式不能为空', normalized: '' };
  }
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6 && parts.length !== 7) {
    return { valid: false, error: `cron 表达式字段数应为 5 或 6（当前 ${parts.length}）`, normalized: '' };
  }

  const normalized = normalizeCron(expr);
  const normParts = normalized.split(/\s+/);
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    const field = FIELD_ORDER[i];
    const err = validateField(field, normParts[i]);
    if (err) return { valid: false, error: err, normalized: '' };
  }
  return { valid: true, error: '', normalized };
}

/** 解析 cron 表达式为字段对象（非法时抛错） */
export function parseCron(expr: string): CronFields {
  const result = checkCron(expr);
  if (!result.valid) {
    throw new Error(result.error);
  }
  const parts = result.normalized.split(/\s+/);
  return {
    second: parts[0],
    minute: parts[1],
    hour: parts[2],
    day: parts[3],
    month: parts[4],
    week: parts[5],
  };
}

/** 由字段生成 cron 表达式（非法字段抛错） */
export function generateCron(fields: CronFields): string {
  const values: string[] = [];
  for (const field of FIELD_ORDER) {
    const expr = (fields[field] ?? '*').toString().trim();
    const err = validateField(field, expr);
    if (err) throw new Error(err);
    values.push(expr === '' ? '*' : expr);
  }
  return values.join(' ');
}

/** 判断某个字段表达式是否匹配给定值 */
function matchesField(field: keyof CronFields, expr: string, value: number): boolean {
  if (expr === '*') return true;
  const parts = expr.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    let step = 1;
    let base = part;
    const slashIdx = part.indexOf('/');
    if (slashIdx >= 0) {
      base = part.slice(0, slashIdx);
      step = parseInt(part.slice(slashIdx + 1), 10);
    }

    if (base === '*') {
      if (value % step === 0) return true;
      continue;
    }
    if (base.includes('-')) {
      const [lo, hi] = base.split('-').map((s) => resolveValue(field, s)!);
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }
    const val = resolveValue(field, base);
    if (field === 'week' && val === 7) {
      if (value === 0) return true; // 7 视作周日（0）
    } else if (val !== null && value === val) {
      return true;
    }
  }
  return false;
}

/** 判断某个时间戳是否匹配 cron 表达式 */
export function matchesCron(expr: string, date: Date): boolean {
  const result = checkCron(expr);
  if (!result.valid) return false;
  const parts = result.normalized.split(/\s+/);
  const d = new Date(date.getTime());
  const week = d.getDay(); // 0=周日
  return (
    matchesField('second', parts[0], d.getSeconds()) &&
    matchesField('minute', parts[1], d.getMinutes()) &&
    matchesField('hour', parts[2], d.getHours()) &&
    matchesField('day', parts[3], d.getDate()) &&
    matchesField('month', parts[4], d.getMonth() + 1) &&
    matchesField('week', parts[5], week)
  );
}

/** 计算下次匹配时间（毫秒时间戳），找不到返回 null（上限 400 天） */
export function nextRunTime(expr: string, fromMs?: number): number | null {
  const result = checkCron(expr);
  if (!result.valid) return null;

  const from = fromMs !== undefined ? fromMs : Date.now();
  const limit = from + 400 * 24 * 60 * 60 * 1000;

  // 秒字段为 0 或 * 时按分钟粒度迭代，提升效率
  const parts = result.normalized.split(/\s+/);
  const secondField = parts[0];
  const minuteGranular = secondField === '0' || secondField === '*';

  if (minuteGranular) {
    let t = Math.floor(from / 60000) * 60000 + 60000; // 下一分钟
    while (t <= limit) {
      const d = new Date(t);
      if (
        matchesField('minute', parts[1], d.getMinutes()) &&
        matchesField('hour', parts[2], d.getHours()) &&
        matchesField('day', parts[3], d.getDate()) &&
        matchesField('month', parts[4], d.getMonth() + 1) &&
        matchesField('week', parts[5], d.getDay())
      ) {
        return t;
      }
      t += 60000;
    }
    return null;
  }

  // 秒级粒度逐秒迭代
  let t = from + 1000;
  while (t <= limit) {
    if (matchesCron(result.normalized, new Date(t))) return t;
    t += 1000;
  }
  return null;
}
