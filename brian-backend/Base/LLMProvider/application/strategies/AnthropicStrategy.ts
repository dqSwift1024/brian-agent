/**
 * @fileoverview Anthropic Claude 提供商策略。
 *
 * 针对 Anthropic Claude 提供商的 API 规范：
 * 1. 默认路径为 `v1/messages`，模型列表路径为 `v1/models`；
 * 2. 鉴权头部使用 `x-api-key: <api_key>` 与 `anthropic-version: 2023-06-01`；
 * 3. 对话请求体中 `system` 为顶层独立字段（不能作为 message.role='system' 传入）；
 * 4. `max_tokens` 为必填字段，未指定时默认使用 4096 或模型上限；
 * 5. 响应内容从 `content[0].text` 提取，Token 统计从 `usage.input_tokens` / `output_tokens` 提取。
 */

import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
} from '../../domain/types';
import type { HttpRequestOptions, ParsedChatResult } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class AnthropicStrategy extends BaseLLMStrategy {
  override readonly name: string = 'anthropic';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return title.includes('anthropic') || url.includes('anthropic.com') || title.includes('claude');
  }

  protected override buildHeaders(
    provider: LLMProviderRecord,
    contentType = 'application/json',
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (provider.api_key) {
      headers['x-api-key'] = provider.api_key;
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['anthropic-version'] = '2023-06-01';
    }
    return headers;
  }

  override buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions {
    return {
      url: provider.llm_provider_url,
      method: 'GET',
      headers: this.buildHeaders(provider, ''),
    };
  }

  override buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const modelsPath = provider.models_path || 'v1/models';
    const url = this.buildEndpoint(provider.llm_provider_url, modelsPath);
    return {
      url,
      method: 'GET',
      headers: this.buildHeaders(provider, ''),
    };
  }

  override buildChatRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMInput,
  ): HttpRequestOptions {
    const chatPath = provider.chat_path || 'v1/messages';
    const url = this.buildEndpoint(provider.llm_provider_url, chatPath);

    // Anthropic 要求 max_tokens 必须为正整数
    const maxTokens = input.max_tokens ?? (model.max_tokens && model.max_tokens > 0 ? model.max_tokens : 4096);

    const body: Record<string, unknown> = {
      model: model.llm_title,
      messages: [{ role: 'user', content: String(input.prompt ?? '') }],
      max_tokens: maxTokens,
    };

    // Anthropic 顶层 system 提示词
    if (input.system) {
      body.system = input.system;
    }
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }

    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        if (!['prompt', 'system', 'temperature', 'max_tokens', 'model', 'messages', 'api_key'].includes(k)) {
          body[k] = v;
        }
      }
    }

    return {
      url,
      method: 'POST',
      headers: this.buildHeaders(provider, 'application/json'),
      body: JSON.stringify(body),
    };
  }

  override parseChatResponse(json: unknown, rawText: string): ParsedChatResult {
    // 优先解析 Anthropic 结构: { content: [{ type: 'text', text: '...' }], usage: { input_tokens, output_tokens } }
    if (json && typeof json === 'object') {
      const obj = json as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (Array.isArray(obj.content) && obj.content.length > 0) {
        const textParts = obj.content
          .filter((c) => c.type === 'text' || !c.type)
          .map((c) => c.text || '')
          .join('');
        return {
          content: textParts,
          inputTokens: obj.usage?.input_tokens ?? 0,
          outputTokens: obj.usage?.output_tokens ?? 0,
        };
      }
    }

    // 兜底尝试标准 OpenAI 兼容结构（如使用了第三方 OpenAI 格式反向代理）
    return super.parseChatResponse(json, rawText);
  }
}
