/**
 * @fileoverview LLM 调用 + JSON 解析 + 可选重试 的公共封装。
 *
 * 收敛各模块"调 LLM → 解析 JSON → 失败重试/降级"的重复模式
 * （改造前 15+ 处各自实现，仅 1 处有重试）。
 *
 * 失败语义：
 * - 提供 `fallback` 时：重试耗尽后返回 fallback() 结果，不抛错；
 * - 未提供 `fallback` 时：重试耗尽后抛出 ProviderError（error_code = 'LLM_JSON_ERROR'）。
 */

import type { LLMAccess } from '../../LLMProvider/access/LLMAccess';
import { ExecLLMInput, ExecLLMOutput, LLMContext, ProviderError } from '@brian-agent/base';

/** callLLMJson 选项 */
export interface CallLLMJsonOptions<T> {
  /** LLM 记录 ID（空串表示使用默认启用模型） */
  llmId?: string;
  /** 用户侧 Prompt */
  prompt: string;
  /** 系统提示词（可选） */
  system?: string;
  /** 解析函数：把 LLM 原文解析为业务对象，返回 null 表示格式不可用 */
  parse: (text: string) => T | null;
  /** 失败重试次数（默认 0，即只调用一次） */
  retries?: number;
  /** 全部重试耗尽后的降级取值（可选） */
  fallback?: () => T;
  /** 每次失败时的回调（用于日志） */
  onError?: (error: unknown, attempt: number) => void;
}

/**
 * 调用 LLM 并解析 JSON 输出，失败按 retries 重试。
 *
 * @param llmAccess LLMAccess 接入层（外部资源唯一入口）
 * @param opts 调用选项（prompt/parse/retries/fallback）
 * @returns 解析结果；无 fallback 且最终失败时抛出 ProviderError
 */
export async function callLLMJson<T>(
  llmAccess: LLMAccess,
  opts: CallLLMJsonOptions<T>,
): Promise<T | null> {
  const retries = opts.retries ?? 0;
  const maxAttempts = retries + 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = new ExecLLMOutput();
      const input = Object.assign(new ExecLLMInput(), {
        id: opts.llmId ?? '',
        prompt: opts.prompt,
        ...(opts.system !== undefined ? { system: opts.system } : {}),
      });
      const ok = await llmAccess.execLLM(input, out, new LLMContext());
      if (!ok) throw new Error(out.error || 'LLM 调用失败');
      const parsed = opts.parse(out.result || '');
      if (parsed === null) throw new Error('LLM 输出 JSON 解析失败');
      return parsed;
    } catch (err: unknown) {
      lastError = err;
      opts.onError?.(err, attempt);
    }
  }

  if (opts.fallback) return opts.fallback();
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ProviderError(`LLM JSON 调用失败: ${msg}`, 'LLM_JSON_ERROR');
}
