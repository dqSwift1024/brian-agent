/**
 * @fileoverview ChunkProvider 领域类型定义。
 *
 * 滑动窗口 + 重叠机制的文本分块模块。
 */

import { Input, Context, Output } from '../../shared/base';

export interface ChunkResult {
  /** 分块序号，从 0 开始 */
  index: number;
  /** 分块文本内容 */
  content: string;
  /** 起始偏移（字符数），仅文本模式有效 */
  startOffset?: number;
  /** 结束偏移（字符数），仅文本模式有效 */
  endOffset?: number;
}

export interface ChunkConfig {
  /** 窗口大小（字符数），默认 500 */
  windowSize: number;
  /** 重叠比例（0-1），默认 0.2 表示 20% 重叠 */
  overlapRatio: number;
}

export class ChunkContext extends Context {}

// ---- Text Chunk ----

export class ChunkTextInput extends Input {
  /** 待分块文本内容 */
  content!: string;
  /** 分块配置（可选，使用默认值） */
  config?: ChunkConfig;
}

export class ChunkTextOutput extends Output {
  /** 分块结果列表 */
  chunks: ChunkResult[] = [];
}

// ---- File Chunk ----

export class ChunkFileInput extends Input {
  /** 文件绝对路径 */
  filePath!: string;
  /** 分块配置（可选，使用默认值） */
  config?: ChunkConfig;
}

export class ChunkFileOutput extends Output {
  /** 分块结果列表 */
  chunks: ChunkResult[] = [];
}

/** 默认窗口大小（字符数） */
export const DEFAULT_WINDOW_SIZE = 500;

/** 默认重叠比例 */
export const DEFAULT_OVERLAP_RATIO = 0.2;
