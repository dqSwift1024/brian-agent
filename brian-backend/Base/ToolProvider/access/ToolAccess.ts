/**
 * @fileoverview ToolProvider 接入层。
 *
 * 工具能力的统一对外入口（无状态纯工具，不依赖数据库）。
 * 签名规范：`Boolean method(Input, Output, Context, Metrics, Report)`；
 * 纯工具方法在 access 内直调 service 并将结果写入 output，无 AOP 切面。
 *
 * 用法示例：
 * ```typescript
 * const tool = new ToolAccess();
 * const output = new JsonCheckOutput();
 * await tool.jsonCheck(Object.assign(new JsonCheckInput(), { text: '{"a":1}' }), output, new ToolContext());
 * ```
 */

import { ToolService } from '../application/ToolService';
import type {
  ToolContext,
  GenerateIdInput, GenerateIdOutput,
  GenerateIdsInput, GenerateIdsOutput,
  NowInput, NowOutput,
  TodayInput, TodayOutput,
  JsonCheckInput, JsonCheckOutput,
  JsonFormatInput, JsonFormatOutput,
  JsonMinifyInput, JsonMinifyOutput,
  XmlCheckInput, XmlCheckOutput,
  XmlFormatInput, XmlFormatOutput,
  XmlMinifyInput, XmlMinifyOutput,
  RegexMatchInput, RegexMatchOutput,
  CronCheckInput, CronCheckOutput,
  CronGenerateInput, CronGenerateOutput,
  CronParseInput, CronParseOutput,
  CronNextInput, CronNextOutput,
} from '../domain/types';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class ToolAccess {
  private readonly service = new ToolService();

  /** 生成一个 UUID v4 */
  async generateId(input: GenerateIdInput, output: GenerateIdOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.id = this.service.generateId();
    return true;
  }

  /** 批量生成指定数量的 UUID */
  async generateIds(input: GenerateIdsInput, output: GenerateIdsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.ids = this.service.generateIds(input.count);
    return true;
  }

  /** 当前毫秒时间戳 */
  async now(input: NowInput, output: NowOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.ms = this.service.now();
    return true;
  }

  /** 当天日期（YYYY-MM-DD） */
  async today(input: TodayInput, output: TodayOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.date = this.service.today();
    return true;
  }

  /** 检查 JSON 合法性 */
  async jsonCheck(input: JsonCheckInput, output: JsonCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonCheck(input.text);
    return true;
  }

  /** 格式化（美化）JSON */
  async jsonFormat(input: JsonFormatInput, output: JsonFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonFormat(input.text, input.indent);
    return true;
  }

  /** 压缩（minify）JSON */
  async jsonMinify(input: JsonMinifyInput, output: JsonMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonMinify(input.text);
    return true;
  }

  /** 检查 XML 合法性 */
  async xmlCheck(input: XmlCheckInput, output: XmlCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlCheck(input.text);
    return true;
  }

  /** 格式化（美化）XML */
  async xmlFormat(input: XmlFormatInput, output: XmlFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlFormat(input.text, input.indent);
    return true;
  }

  /** 压缩（minify）XML */
  async xmlMinify(input: XmlMinifyInput, output: XmlMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlMinify(input.text);
    return true;
  }

  /** 正则表达式匹配 */
  async regexMatch(input: RegexMatchInput, output: RegexMatchOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.regexMatch(input.pattern, input.text, input.flags);
    return true;
  }

  /** 校验 cron 表达式 */
  async cronCheck(input: CronCheckInput, output: CronCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronCheck(input.expr);
    return true;
  }

  /** 由字段生成 cron 表达式 */
  async cronGenerate(input: CronGenerateInput, output: CronGenerateOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronGenerate(input.fields);
    return true;
  }

  /** 解析 cron 表达式为字段 */
  async cronParse(input: CronParseInput, output: CronParseOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronParse(input.expr);
    return true;
  }

  /** 计算 cron 下次执行时间 */
  async cronNext(input: CronNextInput, output: CronNextOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronNext(input.expr, input.from_ms);
    return true;
  }
}
