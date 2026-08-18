/**
 * @fileoverview LLM 提供商策略模式单元测试。
 *
 * 验证 LLMStrategyFactory、BaseLLMStrategy、OpenAIStrategy、GoogleStrategy、
 * AnthropicStrategy、OllamaStrategy 的请求构造与响应解析多态行为。
 */

import { describe, it, expect } from 'vitest';
import {
  LLMStrategyFactory,
  BaseLLMStrategy,
  OpenAIStrategy,
  GoogleStrategy,
  AnthropicStrategy,
  OllamaStrategy,
} from '../LLMProvider/application/strategies';
import type { LLMProviderRecord, LLMAvailableRecord, ExecLLMInput } from '../LLMProvider/domain/types';

function createMockProvider(overrides?: Partial<LLMProviderRecord>): LLMProviderRecord {
  return {
    id: 'prov-1',
    created: Date.now(),
    updated: Date.now(),
    llm_provider_url: 'https://api.openai.com/v1',
    llm_provider_title: 'OpenAI',
    llm_provider_brief: '',
    enable: true,
    api_key: 'sk-test-key-123',
    ...overrides,
  };
}

function createMockModel(overrides?: Partial<LLMAvailableRecord>): LLMAvailableRecord {
  return {
    id: 'model-1',
    created: Date.now(),
    updated: Date.now(),
    llm_provider_id: 'prov-1',
    llm_title: 'gpt-4o',
    llm_brief: 'GPT-4o model',
    llm_type: 'text',
    enable: true,
    is_default: false,
    max_tokens: 4096,
    ...overrides,
  };
}

describe('LLM Strategies & Factory', () => {
  describe('LLMStrategyFactory', () => {
    it('应该将 Google 提供商正确路由到 GoogleStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Google', llm_provider_url: 'https://generativelanguage.googleapis.com/v1beta' });
      expect(LLMStrategyFactory.getStrategy(p1)).toBeInstanceOf(GoogleStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Custom', llm_provider_url: 'https://my-proxy.googleapis.com' });
      expect(LLMStrategyFactory.getStrategy(p2)).toBeInstanceOf(GoogleStrategy);
    });

    it('应该将 Anthropic 提供商正确路由到 AnthropicStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Anthropic', llm_provider_url: 'https://api.anthropic.com/v1' });
      expect(LLMStrategyFactory.getStrategy(p1)).toBeInstanceOf(AnthropicStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Claude Gateway', llm_provider_url: 'https://api.custom.com' });
      expect(LLMStrategyFactory.getStrategy(p2)).toBeInstanceOf(AnthropicStrategy);
    });

    it('应该将 Ollama 提供商正确路由到 OllamaStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Ollama', llm_provider_url: 'http://127.0.0.1:11434' });
      expect(LLMStrategyFactory.getStrategy(p1)).toBeInstanceOf(OllamaStrategy);
    });

    it('通用或 DeepSeek / Moonshot / Volcano 提供商应路由到通用 OpenAIStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'DeepSeek', llm_provider_url: 'https://api.deepseek.com/v1' });
      expect(LLMStrategyFactory.getStrategy(p1)).toBeInstanceOf(OpenAIStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Volcano Engine', llm_provider_url: 'https://ark.cn-beijing.volces.com/api/v3' });
      expect(LLMStrategyFactory.getStrategy(p2)).toBeInstanceOf(OpenAIStrategy);
    });
  });

  describe('GoogleStrategy', () => {
    const strategy = new GoogleStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Google',
      llm_provider_url: 'https://generativelanguage.googleapis.com/v1beta',
      api_key: 'AIzaSyTestKey',
    });
    const model = createMockModel({ llm_title: 'gemini-1.5-pro' });

    it('buildChatRequest 应该正确构造请求头与带 key 的 URL，并默认使用 openai/chat/completions', () => {
      const input = { prompt: 'Hello', system: 'You are helpful' } as ExecLLMInput;
      const req = strategy.buildChatRequest(provider, model, input);

      expect(req.url).toContain('/v1beta/openai/chat/completions');
      expect(req.url).toContain('key=AIzaSyTestKey');
      expect(req.headers['Authorization']).toBe('Bearer AIzaSyTestKey');
      expect(req.headers['x-goog-api-key']).toBe('AIzaSyTestKey');

      const body = JSON.parse(req.body!);
      expect(body.model).toBe('gemini-1.5-pro');
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('parseChatResponse 应该兼容解析 Google 原生 generateContent 返回', () => {
      const nativeJson = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Google 原生回复' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 30,
        },
      };
      const res = strategy.parseChatResponse(nativeJson, JSON.stringify(nativeJson));
      expect(res.content).toBe('Google 原生回复');
      expect(res.inputTokens).toBe(15);
      expect(res.outputTokens).toBe(30);
    });

    it('parseChatResponse 应该正常解析 OpenAI 兼容格式', () => {
      const openAiJson = {
        choices: [{ message: { content: 'Gemini OpenAI 兼容回复' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
      const res = strategy.parseChatResponse(openAiJson, JSON.stringify(openAiJson));
      expect(res.content).toBe('Gemini OpenAI 兼容回复');
      expect(res.inputTokens).toBe(10);
      expect(res.outputTokens).toBe(20);
    });
  });

  describe('AnthropicStrategy', () => {
    const strategy = new AnthropicStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Anthropic',
      llm_provider_url: 'https://api.anthropic.com/v1',
      api_key: 'sk-ant-test-key',
    });
    const model = createMockModel({ llm_title: 'claude-3-5-sonnet-20241022', max_tokens: 8192 });

    it('buildChatRequest 应该注入 x-api-key、anthropic-version，并将 system 提升为顶层字段', () => {
      const input = { prompt: 'Explain quantum physics', system: 'Be concise' } as ExecLLMInput;
      const req = strategy.buildChatRequest(provider, model, input);

      expect(req.url).toContain('/v1/v1/messages');
      expect(req.headers['x-api-key']).toBe('sk-ant-test-key');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');

      const body = JSON.parse(req.body!);
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
      expect(body.system).toBe('Be concise');
      expect(body.messages).toEqual([{ role: 'user', content: 'Explain quantum physics' }]);
      expect(body.max_tokens).toBe(8192);
    });

    it('parseChatResponse 应该正确解析 Anthropic content 数组结构', () => {
      const anthropicJson = {
        content: [{ type: 'text', text: 'Claude 回复内容' }],
        usage: { input_tokens: 50, output_tokens: 120 },
      };
      const res = strategy.parseChatResponse(anthropicJson, JSON.stringify(anthropicJson));
      expect(res.content).toBe('Claude 回复内容');
      expect(res.inputTokens).toBe(50);
      expect(res.outputTokens).toBe(120);
    });
  });

  describe('OllamaStrategy', () => {
    const strategy = new OllamaStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Ollama',
      llm_provider_url: 'http://127.0.0.1:11434',
    });

    it('parseListModelsResponse 应该支持解析 Ollama 原生 /api/tags 返回格式', () => {
      const tagsJson = {
        models: [
          {
            name: 'llama3:latest',
            model: 'llama3:latest',
            details: { family: 'llama', parameter_size: '8.0B' },
          },
          {
            name: 'qwen2.5:7b',
            model: 'qwen2.5:7b',
            details: { family: 'qwen2', parameter_size: '7.6B' },
          },
        ],
      };
      const list = strategy.parseListModelsResponse(tagsJson, JSON.stringify(tagsJson));
      expect(list).toHaveLength(2);
      expect(list[0].modelId).toBe('llama3:latest');
      expect(list[0].description).toBe('llama 8.0B');
      expect(list[1].modelId).toBe('qwen2.5:7b');
      expect(list[1].description).toBe('qwen2 7.6B');
    });
  });
});
