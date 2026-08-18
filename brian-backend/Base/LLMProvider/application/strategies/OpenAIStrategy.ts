/**
 * @fileoverview OpenAI / 通用兼容模型提供商策略。
 *
 * 适用于 OpenAI、DeepSeek、Moonshot (Kimi)、Zhipu AI、Qwen、SiliconFlow、
 * OpenRouter、Groq、Together AI、Volcano Engine 等完全遵循 OpenAI 规范的提供商。
 */

import { BaseLLMStrategy } from './BaseLLMStrategy';

export class OpenAIStrategy extends BaseLLMStrategy {
  override readonly name: string = 'openai';
}
