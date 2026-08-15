/**
 * @fileoverview ToolProvider 统一导出。
 *
 * 工具模块（无状态纯工具），承载：
 * - IdGenerator：UUID 生成器与时间工具
 * - JsonParser：JSON 解析 / 提取 / 检查 / 格式化 / 压缩
 * - XmlParser：XML 解析 / 提取 / 检查 / 格式化 / 压缩
 * - ToolAccess：工具业务用例对外入口（含正则表达式匹配）
 */

export { ToolAccess } from './access/ToolAccess';
export { IdGenerator } from './IdGenerator';
export { JsonParser } from './JsonParser';
export { XmlParser } from './XmlParser';
export type { XmlNode } from './XmlParser';
export * from './domain/types';
