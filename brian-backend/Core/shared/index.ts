/**
 * @fileoverview Core 层共享工具导出。
 */
export * from './errors';
export { ensureDefaultConfig } from './ConfigHelper';
export { AgingEngine, type AgingConfig, type AgingRuleRecord, type BindingRecord } from './AgingEngine';
export {
  checkMatchCache,
  clearMatchCache,
  persistMatchBinding,
  type MatchCacheEntry,
  type MatchCacheCheckResult,
  type RegenMode,
} from './MatchCacheHelper';
export { simpleSimilarity, shouldReuseByRegenRate } from './SimilarityHelper';
