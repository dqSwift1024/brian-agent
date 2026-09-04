/**
 * @fileoverview MQ 领域服务：纯业务规则校验，零 I/O。
 *
 * 从 MQService.sendMQ 剥离的入参校验规则（流程与 I/O 留在应用服务）。
 */

import type { MessageData } from '../types';
import { ValidationError } from '../../../shared/errors';

/**
 * 校验发送消息入参（queue / payload 必填）。
 *
 * @throws ValidationError 当 data / queue / payload 缺失或类型非法
 */
export function validateSendMessage(data: MessageData | undefined): void {
  if (!data) {
    throw new ValidationError('data 不能为空');
  }
  if (!data.queue || typeof data.queue !== 'string') {
    throw new ValidationError('queue 不能为空');
  }
  if (data.payload === undefined || data.payload === null) {
    throw new ValidationError('payload 不能为空');
  }
}

/**
 * 校验优先级取值范围（0-10）。
 *
 * @throws ValidationError 超出范围或非数值
 */
export function validatePriority(priority: number): void {
  if (typeof priority !== 'number' || priority < 0 || priority > 10) {
    throw new ValidationError('priority 必须为 0-10 之间的整数');
  }
}
