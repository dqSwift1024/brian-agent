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

// 上下文拼接的安全上限：单条消息与总字符数均做截断，防止 LLM 输入超限
// （火山方舟输入上限约 1MB，此处保守控制上下文规模，为 soul/history/task 留足空间）。
const MAX_ITEM_CHARS = 2000;
const MAX_TOTAL_CHARS = 150000;

export function formatContextCategories(ctxOut?: ContextOutputLike): string {
  if (!ctxOut) return '';

  const cat = ctxOut.categories;
  const sections: string[] = [];
  let totalChars = 0;

  const truncateItem = (text: string): string => {
    const t = (text ?? '').trim();
    if (t.length <= MAX_ITEM_CHARS) return t;
    return `${t.slice(0, MAX_ITEM_CHARS)}…(截断)`;
  };

  const addCategorySection = (title: string, items?: ContextItemLike[]) => {
    if (!items || items.length === 0) return;
    if (totalChars >= MAX_TOTAL_CHARS) return;
    const lines: string[] = [];
    for (const i of items) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      const line = truncateItem(i.info || i.content || i.summary || '');
      if (!line) continue;
      lines.push(line);
      totalChars += line.length;
    }
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
    const fallbackLines: string[] = [];
    for (const i of ctxOut.list) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      const line = truncateItem(i.info || i.content || i.summary || '');
      if (!line) continue;
      fallbackLines.push(line);
      totalChars += line.length;
    }
    if (fallbackLines.length > 0) {
      return `<上下文信息>\n<历史消息>\n${fallbackLines.map((l) => `- ${l}`).join('\n')}\n</历史消息>\n</上下文信息>`;
    }
  }

  return '';
}

export function parseTaskContentAndContext(rawTaskContent: string): {
  cleanTaskContent: string;
  extractedWorkContext?: Record<string, unknown>;
} {
  if (!rawTaskContent) return { cleanTaskContent: '' };

  const str = String(rawTaskContent).trim();
  if (str.includes('\n---\n')) {
    const idx = str.indexOf('\n---\n');
    const firstPart = str.slice(0, idx).trim();
    const restPart = str.slice(idx + 5).trim();

    if (firstPart.startsWith('{') && firstPart.endsWith('}')) {
      try {
        const parsed = JSON.parse(firstPart);
        if (parsed && typeof parsed === 'object' && ('work_id' in parsed || 'session_id' in parsed || 'session_context' in parsed || 'context_categories' in parsed)) {
          return {
            cleanTaskContent: restPart,
            extractedWorkContext: parsed as Record<string, unknown>,
          };
        }
      } catch { /* ignore */ }
    }
  }

  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') {
        let clean = '';
        if (parsed.user_query) clean = String(parsed.user_query);
        else if (parsed.task_content) clean = String(parsed.task_content);
        if (clean) {
          return {
            cleanTaskContent: clean,
            extractedWorkContext: parsed as Record<string, unknown>,
          };
        }
      }
    } catch { /* ignore */ }
  }

  return { cleanTaskContent: str };
}
