/**
 * @fileoverview ToolProvider 领域层类型定义。
 *
 * ToolProvider 为无状态纯工具模块（ID 生成、JSON/XML 检查/格式化/压缩、
 * 正则表达式匹配），不依赖数据库，无需表结构与 SchemaInitializer。
 */

/** 格式检查结果 */
export interface ToolCheckResult {
  /** 是否合法 */
  valid: boolean;
  /** 错误信息（合法时为空串） */
  error: string;
}

/** 格式化 / 压缩结果 */
export interface ToolTransformResult {
  /** 是否成功 */
  valid: boolean;
  /** 错误信息（成功时为空串） */
  error: string;
  /** 处理后的结果文本（失败时为空串） */
  result: string;
}

/** 正则表达式匹配结果 */
export interface ToolRegexResult {
  /** 正则表达式是否合法 */
  valid: boolean;
  /** 正则错误信息（合法时为空串） */
  error: string;
  /** 是否至少匹配一次 */
  matched: boolean;
  /** 匹配到的字符串列表 */
  matches: string[];
  /** 匹配次数 */
  count: number;
  /** 捕获组（仅非全局匹配时返回） */
  groups?: Array<Record<string, string>>;
}
