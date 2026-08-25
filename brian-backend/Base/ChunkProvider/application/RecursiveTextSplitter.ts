/**
 * @fileoverview 递归分隔符文本分块器（LangChain RecursiveCharacterTextSplitter 算法移植）。
 *
 * 解决「滑动窗口」分块会在句子/段落中间硬切、破坏语义边界的问题：
 * 1. 按分隔符优先级从粗到细递归切分（段落 → 换行 → 句末标点 → 逗号顿号 → 空格 → 逐字符硬切）；
 * 2. 切出的原子片段再合并到 chunk_size（merge 阶段）；
 * 3. 相邻 chunk 之间按 chunk_overlap 重叠，保证边界上下文的覆盖率，避免信息因切割而缺失。
 *
 * 默认按 Unicode 码点计数（中文 1 字 = 1），与 embedding 模型的 token 上限解耦，
 * 由调用方（InfoCore）按 chunk_size 配置控制单 chunk 长度。
 */

export interface RecursiveSplitOptions {
  /** 每个 chunk 的最大长度（字符/码点数），默认 512 */
  chunkSize?: number;
  /** 相邻 chunk 之间的重叠长度（码点数），默认 64，必须 < chunkSize */
  chunkOverlap?: number;
  /** 分隔符优先级列表（从粗到细），默认使用 {@link DEFAULT_SEPARATORS} */
  separators?: string[];
  /** 长度计算函数，默认按 Unicode 码点数计数 */
  lengthFunction?: (text: string) => number;
  /** 是否在切分时保留分隔符（并入前一 chunk 末尾），默认 true */
  keepSeparator?: boolean;
}

export const DEFAULT_SEPARATORS: string[] = [
  '\n\n',
  '\r\n\r\n',
  '\n',
  '\r\n',
  '。',
  '！',
  '？',
  '；',
  '…',
  '. ',
  '! ',
  '? ',
  '; ',
  '，',
  '、',
  ', ',
  '：',
  ': ',
  ' ',
  '\t',
  '',
];

/**
 * 递归分隔符文本分块器。
 *
 * 算法对齐 LangChain `RecursiveCharacterTextSplitter.splitText`：
 * - `_splitText`：从当前分隔符开始，逐层向更细的分隔符递归，直到片段长度小于 chunkSize；
 * - `_mergeSplits`：把足够小的原子片段按 chunkSize 合并，并在合并时回退 chunkOverlap 字符。
 */
export class RecursiveTextSplitter {
  static readonly DEFAULT_SEPARATORS: string[] = DEFAULT_SEPARATORS;

  /** 默认长度函数：Unicode 码点数（中文/英文/emoji 均按 1 个码点计） */
  static readonly charLength = (text: string): number => [...text].length;

  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly separators: string[];
  private readonly lengthFunction: (text: string) => number;
  private readonly keepSeparator: boolean;

  constructor(options: RecursiveSplitOptions = {}) {
    const chunkSize = options.chunkSize ?? 512;
    const chunkOverlap = options.chunkOverlap ?? 64;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error(`chunkSize 必须为正整数，当前值：${chunkSize}`);
    }
    if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new Error(`chunkOverlap 必须满足 0 <= chunkOverlap < chunkSize，当前值：${chunkOverlap}`);
    }
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = options.separators && options.separators.length > 0
      ? options.separators
      : [...DEFAULT_SEPARATORS];
    this.lengthFunction = options.lengthFunction ?? RecursiveTextSplitter.charLength;
    this.keepSeparator = options.keepSeparator ?? true;
  }

  /** 便捷静态入口。 */
  static splitText(text: string, options: RecursiveSplitOptions = {}): string[] {
    return new RecursiveTextSplitter(options).splitText(text);
  }

  /** 对文本执行分块，返回按顺序排列的 chunk 列表。 */
  splitText(text: string): string[] {
    if (text == null || text.length === 0) return [];
    return this.splitTextRecursive(text, this.separators);
  }

  // -------------------------------------------------------------------------
  // 核心算法：递归切分（对齐 LangChain `_split_text`）
  // -------------------------------------------------------------------------

  private splitTextRecursive(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];

    // 选择当前层能命中文本的「最粗」分隔符，并截取其后更细的层级
    let separator: string = separators[separators.length - 1];
    let newSeparators: string[] = [];
    for (let i = 0; i < separators.length; i++) {
      const candidate = separators[i];
      if (candidate === '') {
        separator = candidate;
        break;
      }
      if (text.includes(candidate)) {
        separator = candidate;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = this.splitWithSeparator(text, separator);
    const goodSplits: string[] = [];
    const mergedSeparator = this.keepSeparator ? '' : separator;

    for (const s of splits) {
      if (this.lengthFunction(s) < this.chunkSize) {
        goodSplits.push(s);
      } else {
        if (goodSplits.length > 0) {
          finalChunks.push(...this.mergeSplits(goodSplits, mergedSeparator));
          goodSplits.length = 0;
        }
        if (newSeparators.length === 0) {
          // 已到最细层级，超长片段只能整体保留
          finalChunks.push(s);
        } else {
          finalChunks.push(...this.splitTextRecursive(s, newSeparators));
        }
      }
    }

    if (goodSplits.length > 0) {
      finalChunks.push(...this.mergeSplits(goodSplits, mergedSeparator));
    }

    return finalChunks;
  }

  /** 按分隔符切分；保留分隔符时把分隔符并入前一片段。 */
  private splitWithSeparator(text: string, separator: string): string[] {
    if (separator === '') {
      // 兜底：逐码点硬切，避免 split('') 拆开 emoji 等代理对
      return [...text];
    }
    if (!this.keepSeparator) {
      return text.split(separator);
    }
    const parts = text.split(separator);
    if (parts.length <= 1) return parts;
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const withSep = i < parts.length - 1 ? part + separator : part;
      result.push(withSep);
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 核心算法：合并 + 重叠回退（对齐 LangChain `_merge_splits`）
  // -------------------------------------------------------------------------

  private mergeSplits(splits: string[], separator: string): string[] {
    const separatorLen = this.lengthFunction(separator);
    const docs: string[] = [];
    let currentDoc: string[] = [];
    let total = 0;

    for (const d of splits) {
      const len = this.lengthFunction(d);
      const pending = total + len + (currentDoc.length > 0 ? separatorLen : 0);

      if (pending > this.chunkSize) {
        if (currentDoc.length > 0) {
          const doc = this.joinDocs(currentDoc, separator);
          if (doc !== null) docs.push(doc);

          // 回退 overlap：移除头部片段直到满足重叠与容量约束
          while (
            total > this.chunkOverlap ||
            (total + len + separatorLen > this.chunkSize && total > 0)
          ) {
            total -= this.lengthFunction(currentDoc[0]) + (currentDoc.length > 1 ? separatorLen : 0);
            currentDoc = currentDoc.slice(1);
          }
        }
      }

      currentDoc.push(d);
      total += len + (currentDoc.length > 1 ? separatorLen : 0);
    }

    const doc = this.joinDocs(currentDoc, separator);
    if (doc !== null) docs.push(doc);
    return docs;
  }

  private joinDocs(docs: string[], separator: string): string | null {
    const text = docs.join(separator).trim();
    return text === '' ? null : text;
  }
}
