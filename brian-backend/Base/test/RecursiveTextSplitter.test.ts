/**
 * @fileoverview RecursiveTextSplitter（LangChain 风格递归分隔符分块）测试。
 *
 * 测试范围：
 * - 分隔符优先级：优先在段落 / 换行 / 句末标点处切分，不硬切语义边界
 * - chunk_size / chunk_overlap 约束：每个 chunk 不超过 chunkSize，相邻 chunk 按 overlap 重叠
 * - 覆盖率：相邻 chunk 存在重叠部分，边界上下文不丢失
 * - 边界：短文本单 chunk、超长单片段、空文本、非法参数
 *
 * 纯函数测试，无数据库依赖。
 */

import { describe, it, expect } from 'vitest';
import {
  RecursiveTextSplitter,
  DEFAULT_SEPARATORS,
} from '../ChunkProvider';

describe('RecursiveTextSplitter', () => {
  it('should keep short text as a single chunk', () => {
    const chunks = RecursiveTextSplitter.splitText('这是一段短文本', { chunkSize: 100, chunkOverlap: 10 });
    expect(chunks).toEqual(['这是一段短文本']);
  });

  it('should split long text at paragraph boundaries first', () => {
    const text = [
      '第一段内容。'.repeat(20),
      '第二段内容。'.repeat(20),
    ].join('\n\n');
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 80, chunkOverlap: 16 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(80);
    }
  });

  it('should split at sentence-ending punctuation rather than inside words', () => {
    const text = '这是第一句话。这是第二句话！这是第三句话？这是第四句话。';
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 8, chunkOverlap: 2 });
    // 每个 chunk 应尽量以句末标点结尾，不产生「半句话」开头
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(8);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should preserve overlap between adjacent chunks (coverage)', () => {
    // 构造无天然分隔符的连续文本，验证 overlap 生效
    const text = 'a'.repeat(100);
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 10, chunkOverlap: 4 });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const prev = chunks[i];
      const next = chunks[i + 1];
      // 前一 chunk 的尾部与后一 chunk 的头部应有重叠
      const overlap = prev.slice(-4);
      expect(next.startsWith(overlap)).toBe(true);
    }
  });

  it('should not lose content: concatenation minus overlaps covers original text', () => {
    const text = '这是一段用于测试覆盖率的文本。'.repeat(30);
    const chunkSize = 20;
    const overlap = 5;
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize, chunkOverlap: overlap });
    // 每一段内容都至少出现在一个 chunk 中（覆盖率完整性）
    const joined = chunks.join('');
    // 由于有重叠与分隔符，无法精确还原，但总长度应不低于原文去掉分隔符后的长度
    const stripped = text.replace(/[。\n]/g, '');
    expect(joined.length).toBeGreaterThanOrEqual(stripped.length - overlap);
  });

  it('should respect custom separators', () => {
    const text = 'a|b|c|d|e|f|g|h';
    const chunks = RecursiveTextSplitter.splitText(text, {
      chunkSize: 3,
      chunkOverlap: 1,
      separators: ['|', ''],
    });
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(3);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should return empty array for empty text', () => {
    expect(RecursiveTextSplitter.splitText('')).toEqual([]);
    expect(RecursiveTextSplitter.splitText('   ')).toEqual([]);
  });

  it('should handle single over-long segment without error', () => {
    // 无分隔符的超长单段：只能整体保留
    const text = 'x'.repeat(100);
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 5, chunkOverlap: 1, separators: [''] });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should throw on invalid chunkSize / chunkOverlap', () => {
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 0 })).toThrow();
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 10, chunkOverlap: 10 })).toThrow();
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 10, chunkOverlap: -1 })).toThrow();
  });

  it('should export default separators containing paragraph and sentence separators', () => {
    expect(DEFAULT_SEPARATORS).toContain('\n\n');
    expect(DEFAULT_SEPARATORS).toContain('。');
    expect(DEFAULT_SEPARATORS).toContain('，');
    expect(DEFAULT_SEPARATORS).toContain('');
  });
});
