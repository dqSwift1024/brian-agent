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
