/**
 * @fileoverview 上下文文本化（context formatter）。
 *
 * 将 InfoCoreProvider 构建出的结构化上下文（categories / list）渲染为 prompt 片段文本，
 * 作为 `context_data` 变量注入 Prompt 模板。属于 Prompt 装配层职责，由 PromptProvider
 * 统一承载，避免各 Agent 层重复实现上下文 → 文本的拼接逻辑。
 *
 * 说明：此处仅依赖纯接口（ContextItemLike / ContextOutputLike），不依赖 Core 层具体类型，
 * 保证 Base 层不反向依赖上层。
 */

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
