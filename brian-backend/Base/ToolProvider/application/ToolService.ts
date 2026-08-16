/**
 * @fileoverview ToolProvider 应用服务层。
 *
 * 提供无状态的工具业务用例：
 * - ID 生成（UUID / 时间戳 / 日期）
 * - JSON 检查 / 格式化 / 压缩
 * - XML 检查 / 格式化 / 压缩
 * - 正则表达式匹配
 *
 * 复用底层纯工具 IdGenerator / JsonParser / XmlParser。
 */

import { IdGenerator } from '../IdGenerator';
import { JsonParser } from '../JsonParser';
import { XmlParser } from '../XmlParser';
import {
  checkCron,
  generateCron,
  parseCron,
  nextRunTime,
} from '../CronUtils';
import type {
  ToolCheckResult,
  ToolTransformResult,
  ToolRegexResult,
  CronFields,
  ToolCronCheckResult,
  ToolCronGenerateResult,
  ToolCronParseResult,
  ToolCronNextResult,
} from '../domain/types';

export class ToolService {
  // -------------------------------------------------------------------------
  // ID 生成
  // -------------------------------------------------------------------------

  /** 生成一个 UUID v4 */
  generateId(): string {
    return IdGenerator.generate();
  }

  /** 批量生成指定数量的 UUID */
  generateIds(count: number): string[] {
    const n = Math.max(0, Math.min(Math.trunc(count) || 0, 1000));
    return Array.from({ length: n }, () => IdGenerator.generate());
  }

  /** 当前毫秒时间戳 */
  now(): number {
    return IdGenerator.now();
  }

  /** 当天日期（YYYY-MM-DD） */
  today(): string {
    return IdGenerator.today();
  }

  // -------------------------------------------------------------------------
  // JSON
  // -------------------------------------------------------------------------

  /** 检查 JSON 合法性 */
  jsonCheck(text: string): ToolCheckResult {
    return JsonParser.check(text);
  }

  /** 格式化（美化）JSON */
  jsonFormat(text: string, indent = 2): ToolTransformResult {
    const result = JsonParser.format(text, indent);
    if (result === null) {
      return { valid: false, error: 'JSON 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  /** 压缩（minify）JSON */
  jsonMinify(text: string): ToolTransformResult {
    const result = JsonParser.minify(text);
    if (result === null) {
      return { valid: false, error: 'JSON 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  // -------------------------------------------------------------------------
  // XML
  // -------------------------------------------------------------------------

  /** 检查 XML 合法性 */
  xmlCheck(text: string): ToolCheckResult {
    return XmlParser.check(text);
  }

  /** 格式化（美化）XML */
  xmlFormat(text: string, indent = 2): ToolTransformResult {
    const result = XmlParser.format(text, indent);
    if (result === null) {
      return { valid: false, error: 'XML 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  /** 压缩（minify）XML */
  xmlMinify(text: string): ToolTransformResult {
    const result = XmlParser.minify(text);
    if (result === null) {
      return { valid: false, error: 'XML 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  // -------------------------------------------------------------------------
  // 正则表达式
  // -------------------------------------------------------------------------

  /**
   * 正则表达式匹配。
   *
   * @param pattern 正则表达式字符串
   * @param text 待匹配文本
   * @param flags 正则标志（如 g / i / m / s），可选
   */
  regexMatch(pattern: string, text: string, flags = ''): ToolRegexResult {
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
        matched: false,
        matches: [],
        count: 0,
      };
    }

    try {
      if (re.global) {
        const matches = text.match(re) || [];
        return {
          valid: true,
          error: '',
          matched: matches.length > 0,
          matches,
          count: matches.length,
        };
      }

      const m = text.match(re);
      return {
        valid: true,
        error: '',
        matched: m !== null,
        matches: m ? [m[0]] : [],
        count: m ? 1 : 0,
        groups: m?.groups ? [m.groups] : undefined,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
        matched: false,
        matches: [],
        count: 0,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Cron
  // -------------------------------------------------------------------------

  /** 校验 cron 表达式 */
  cronCheck(expr: string): ToolCronCheckResult {
    const r = checkCron(expr);
    return { valid: r.valid, error: r.error, normalized: r.normalized };
  }

  /** 由字段生成 cron 表达式 */
  cronGenerate(fields: CronFields): ToolCronGenerateResult {
    try {
      const expression = generateCron(fields);
      return { valid: true, error: '', expression };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), expression: '' };
    }
  }

  /** 解析 cron 表达式为字段 */
  cronParse(expr: string): ToolCronParseResult {
    try {
      const fields = parseCron(expr);
      return { valid: true, error: '', fields };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), fields: null };
    }
  }

  /** 计算 cron 下次执行时间 */
  cronNext(expr: string, fromMs?: number): ToolCronNextResult {
    try {
      const next = nextRunTime(expr, fromMs);
      return { valid: true, error: '', next_time: next };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), next_time: null };
    }
  }
}
