/**
 * task_signature 统一格式：`[domain] 任务前256字`
 * 对齐 docs/_01_TerminologyStandardization.md
 */
import { JsonParser } from '@brian-agent/base';

export function buildTaskSignature(taskContent: string, domain = ''): string {
  const body = (taskContent ?? '').slice(0, 256);
  const d = (domain ?? '').trim() || 'general';
  return `[${d}] ${body}`;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const value = JsonParser.parse(text);
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

export interface ContextItemLike {
  info?: string;
  content?: string;
  summary?: string;
  collection_source?: string;
  source?: string;
}

export interface ContextCategoriesLike {
  selected?: ContextItemLike[];
  custom?: ContextItemLike[];
  pinned?: ContextItemLike[];
  timeline?: ContextItemLike[];
  citing?: ContextItemLike[];
  tag_relative?: ContextItemLike[];
  similarity?: ContextItemLike[];
  keyword?: ContextItemLike[];
  random?: ContextItemLike[];
}

export interface ContextOutputLike {
  categories?: ContextCategoriesLike;
  list?: ContextItemLike[];
}

export function formatContextCategories(ctxOut?: ContextOutputLike): string {
  if (!ctxOut) return '';

  const cat = ctxOut.categories;
  const sections: string[] = [];

  const addCategorySection = (title: string, items?: ContextItemLike[]) => {
    if (!items || items.length === 0) return;
    const lines = items
      .map((i) => (i.info || i.content || i.summary || '').trim())
      .filter(Boolean);
    if (lines.length > 0) {
      sections.push(`<${title}>\n${lines.map((l) => `- ${l}`).join('\n')}\n</${title}>`);
    }
  };

  if (cat) {
    addCategorySection('指定消息', cat.selected || cat.custom);
    addCategorySection('钉住的消息', cat.pinned);
    addCategorySection('时间线消息', cat.timeline);
    addCategorySection('引用关联消息', cat.citing);
    addCategorySection('标签关联消息', cat.tag_relative);
    addCategorySection('向量语义消息', cat.similarity);
    addCategorySection('关键词匹配消息', cat.keyword);
    addCategorySection('探查随机消息', cat.random);
  }

  if (sections.length > 0) {
    return `<上下文信息>\n${sections.join('\n\n')}\n</上下文信息>`;
  }

  if (ctxOut.list && ctxOut.list.length > 0) {
    const fallbackLines = ctxOut.list
      .map((i) => (i.info || i.content || i.summary || '').trim())
      .filter(Boolean);
    if (fallbackLines.length > 0) {
      return `<上下文信息>\n<历史消息>\n${fallbackLines.map((l) => `- ${l}`).join('\n')}\n</历史消息>\n</上下文信息>`;
    }
  }

  return '';
}
