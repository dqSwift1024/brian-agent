/**
 * @fileoverview ChunkProvider 应用服务层。
 *
 * 实现滑动窗口 + 重叠机制的文本分块：
 * - chunkText：对文本字符串进行分块
 * - chunkFile：对流式读取的文件进行分块（避免大文件内存占用）
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { ValidationError } from '../../shared/errors';
import {
  ChunkContext,
  ChunkResult,
  ChunkConfig,
  ChunkTextInput,
  ChunkTextOutput,
  ChunkFileInput,
  ChunkFileOutput,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_OVERLAP_RATIO,
} from '../domain/types';

export class ChunkService {

  /** 默认配置 */
  static readonly defaults: ChunkConfig = {
    windowSize: DEFAULT_WINDOW_SIZE,
    overlapRatio: DEFAULT_OVERLAP_RATIO,
  };

  /**
   * 对文本字符串进行滑动窗口 + 重叠分块。
   */
  async chunkText(
    input: ChunkTextInput,
    _context: ChunkContext,
    output: ChunkTextOutput,
  ): Promise<boolean> {
    if (!input.content) {
      throw new ValidationError('content 不能为空');
    }
    const config = this.mergeConfig(input.config);
    output.chunks = this.slidingWindow(input.content, config);
    return true;
  }

  /**
   * 对流式读取的文件进行滑动窗口 + 重叠分块。
   *
   * 使用 Node.js readline 逐行读取，避免大文件一次性加载到内存。
   * 先将全部行读入内存后合并为完整文本，再用滑动窗口分块。
   * 对于超大文件（>1000行），使用缓冲区滚动机制限制内存占用。
   */
  async chunkFile(
    input: ChunkFileInput,
    _context: ChunkContext,
    output: ChunkFileOutput,
  ): Promise<boolean> {
    if (!input.filePath) {
      throw new ValidationError('filePath 不能为空');
    }
    const config = this.mergeConfig(input.config);

    const bufferMaxLines = Math.ceil(config.windowSize / 30) + 100; // 估算行数容量
    let buffer = '';
    let lineCount = 0;
    let totalOffset = 0;
    const chunks: ChunkResult[] = [];

    const stream = createReadStream(input.filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      buffer += line + '\n';
      lineCount++;
      totalOffset += line.length + 1;

      // 缓冲区滚动：超过容量时，对缓冲区做分块，保留末尾重叠部分
      if (lineCount >= bufferMaxLines) {
        const partial = this.slidingWindow(buffer, config, 0, true);
        // 最后一 chunk 可能不完整，保留到下次合并
        if (partial.length > 1) {
          for (let i = 0; i < partial.length - 1; i++) {
            partial[i].index = chunks.length;
            chunks.push(partial[i]);
          }
          buffer = partial[partial.length - 1].content;
          lineCount = buffer.split('\n').length;
        } else {
          buffer = buffer.slice(-config.windowSize * 2);
          lineCount = buffer.split('\n').length;
        }
      }
    }
    rl.close();

    // 处理剩余缓冲区
    if (buffer.trim()) {
      const remaining = this.slidingWindow(buffer, config, 0);
      for (const c of remaining) {
        c.index = chunks.length;
        chunks.push(c);
      }
    }

    output.chunks = chunks;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 核心算法：滑动窗口 + 重叠
  // ---------------------------------------------------------------------------

  /**
   * 滑动窗口分块核心算法。
   *
   * @param text     待分块文本
   * @param config   窗口配置
   * @param baseIdx  起始序号偏移
   * @param keepLast 是否保留末尾不完整 chunk（用于滚动缓冲区）
   */
  private slidingWindow(
    text: string,
    config: ChunkConfig,
    baseIdx = 0,
    keepLast = false,
  ): ChunkResult[] {
    const { windowSize, overlapRatio } = config;
    const step = Math.max(1, Math.floor(windowSize * (1 - overlapRatio)));
    const results: ChunkResult[] = [];

    let start = 0;
    let idx = baseIdx;

    while (start < text.length) {
      const end = start + windowSize;
      const content = text.substring(start, end).trim();

      if (content || !keepLast || start + windowSize >= text.length) {
        if (content) {
          results.push({
            index: idx++,
            content,
            startOffset: start,
            endOffset: Math.min(end, text.length),
          });
        }
      }

      if (end >= text.length) break;
      start += step;
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // 工具
  // ---------------------------------------------------------------------------

  private mergeConfig(partial?: ChunkConfig): ChunkConfig {
    const c: ChunkConfig = partial ?? ChunkService.defaults;
    return {
      windowSize: c.windowSize ?? ChunkService.defaults.windowSize,
      overlapRatio: c.overlapRatio ?? ChunkService.defaults.overlapRatio,
    };
  }
}
