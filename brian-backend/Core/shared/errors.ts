/**
 * @fileoverview Core 层共享错误类型定义。
 *
 * 统一错误体系：Core 层不再自定义错误类层次，直接复用 Base/shared/errors 的
 * ProviderError 体系（ValidationError / NotFoundError / DatabaseError 等），
 * 并补充领域处理错误 ProcessingError。跨层 instanceof 判断因此始终可靠。
 */
export {
  ProviderError,
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '@brian-agent/base';

import { ProviderError } from '@brian-agent/base';

/**
 * 领域处理错误。
 *
 * Core 层业务规则执行失败（如 LLM 结果解析失败、聚合计算失败）时抛出。
 */
export class ProcessingError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROCESSING_ERROR');
  }
}
