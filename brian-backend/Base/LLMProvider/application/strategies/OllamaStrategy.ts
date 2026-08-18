/**
 * @fileoverview Ollama / 本地模型提供商策略。
 *
 * 针对本地部署的 Ollama 服务：
 * 1. 默认无需 API Key；
 * 2. 默认兼容 OpenAI 路径 `/v1/chat/completions` 与 `/v1/models`；
 * 3. 增强对 Ollama 原生 `/api/tags` 模型列表的解析支持。
 */

import type { LLMProviderRecord } from '../../domain/types';
import type { ParsedModelItem } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class OllamaStrategy extends BaseLLMStrategy {
  override readonly name: string = 'ollama';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return title.includes('ollama') || url.includes(':11434');
  }

  override parseListModelsResponse(json: unknown, rawText: string): ParsedModelItem[] {
    // 支持 Ollama 原生 /api/tags 返回格式: { models: [{ name: 'llama3:latest', details: { family: 'llama', parameter_size: '8.0B' } }] }
    if (json && typeof json === 'object') {
      const obj = json as { models?: Array<Record<string, unknown>> };
      if (Array.isArray(obj.models) && obj.models.some((m) => m && typeof m === 'object' && ('details' in m || 'size' in m))) {
        return obj.models.map((m) => {
          const modelId = String(m.name || m.model || '');
          const details = m.details as Record<string, unknown> | undefined;
          const family = details?.family ? String(details.family) : '';
          const paramSize = details?.parameter_size ? String(details.parameter_size) : '';
          const brief = [family, paramSize].filter(Boolean).join(' ') || undefined;

          return {
            modelId,
            displayName: modelId,
            description: brief,
            maxTokens: 0,
            raw: m,
          };
        }).filter((item) => Boolean(item.modelId));
      }
    }

    // 默认使用基类标准解析
    return super.parseListModelsResponse(json, rawText);
  }
}
