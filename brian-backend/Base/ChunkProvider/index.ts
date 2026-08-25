/**
 * @fileoverview ChunkProvider 模块统一导出。
 */

// access 层
export { ChunkAccess } from './access/ChunkAccess';

// domain 层类型
export {
  ChunkContext,
  ChunkTextInput,
  ChunkTextOutput,
  ChunkFileInput,
  ChunkFileOutput,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_OVERLAP_RATIO,
} from './domain/types';

export type { ChunkResult, ChunkConfig } from './domain/types';

// 递归分隔符文本分块器（LangChain 风格，供向量化等场景做语义友好的分块）
export { RecursiveTextSplitter, DEFAULT_SEPARATORS } from './application/RecursiveTextSplitter';
export type { RecursiveSplitOptions } from './application/RecursiveTextSplitter';
