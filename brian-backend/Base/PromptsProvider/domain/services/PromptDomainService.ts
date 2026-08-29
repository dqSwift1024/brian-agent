/**
 * @fileoverview Prompt 领域服务：模板渲染的纯数据加工，零 I/O。
 */

import { stripEmptyConditionalBlocks } from '../../../PromptCatalog/catalog';

/** 转义正则特殊字符 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 渲染 Prompt 模板：
 * 1. 先移除变量为空/缺失的 {{#if var}}...{{/if}} 条件块；
 * 2. 再将 {{variable_name}} 替换为 variables 中对应的值。
 *
 * @param template 模板原文
 * @param variables 变量键值对
 */
export function renderPromptTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  let rendered = stripEmptyConditionalBlocks(template, variables);
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
    rendered = rendered.replace(pattern, () => String(value));
  }
  return rendered;
}

