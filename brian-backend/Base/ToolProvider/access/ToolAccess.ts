/**
 * @fileoverview ToolProvider 接入层。
 *
 * 作为工具能力的统一对外入口（无状态纯工具，不依赖数据库、无 AOP 日志切面）。
 *
 * 用法示例：
 * ```typescript
 * import { ToolAccess } from '@brian-agent/base';
 * const tool = new ToolAccess();
 * tool.generateId();
 * tool.jsonFormat('{"a":1}');
 * ```
 */

import { ToolService } from '../application/ToolService';
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

export class ToolAccess {
  private readonly service = new ToolService();

  /** 生成一个 UUID v4 */
  generateId(): string {
    return this.service.generateId();
  }

  /** 批量生成指定数量的 UUID */
  generateIds(count: number): string[] {
    return this.service.generateIds(count);
  }

  /** 当前毫秒时间戳 */
  now(): number {
    return this.service.now();
  }

  /** 当天日期（YYYY-MM-DD） */
  today(): string {
    return this.service.today();
  }

  /** 检查 JSON 合法性 */
  jsonCheck(text: string): ToolCheckResult {
    return this.service.jsonCheck(text);
  }

  /** 格式化（美化）JSON */
  jsonFormat(text: string, indent = 2): ToolTransformResult {
    return this.service.jsonFormat(text, indent);
  }

  /** 压缩（minify）JSON */
  jsonMinify(text: string): ToolTransformResult {
    return this.service.jsonMinify(text);
  }

  /** 检查 XML 合法性 */
  xmlCheck(text: string): ToolCheckResult {
    return this.service.xmlCheck(text);
  }

  /** 格式化（美化）XML */
  xmlFormat(text: string, indent = 2): ToolTransformResult {
    return this.service.xmlFormat(text, indent);
  }

  /** 压缩（minify）XML */
  xmlMinify(text: string): ToolTransformResult {
    return this.service.xmlMinify(text);
  }

  /** 正则表达式匹配 */
  regexMatch(pattern: string, text: string, flags = ''): ToolRegexResult {
    return this.service.regexMatch(pattern, text, flags);
  }

  /** 校验 cron 表达式 */
  cronCheck(expr: string): ToolCronCheckResult {
    return this.service.cronCheck(expr);
  }

  /** 由字段生成 cron 表达式 */
  cronGenerate(fields: CronFields): ToolCronGenerateResult {
    return this.service.cronGenerate(fields);
  }

  /** 解析 cron 表达式为字段 */
  cronParse(expr: string): ToolCronParseResult {
    return this.service.cronParse(expr);
  }

  /** 计算 cron 下次执行时间 */
  cronNext(expr: string, fromMs?: number): ToolCronNextResult {
    return this.service.cronNext(expr, fromMs);
  }
}
