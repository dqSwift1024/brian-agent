/**
 * @fileoverview LLM 提供商策略工厂与注册中心。
 *
 * 维护系统内置与扩展的 LLM 提供商策略列表。
 * 根据提供商的名称、URL 特征动态匹配最适策略，实现多态调用。
 */

import type { LLMProviderRecord } from '../../domain/types';
import type { ILLMProviderStrategy } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';
import { OpenAIStrategy } from './OpenAIStrategy';
import { GoogleStrategy } from './GoogleStrategy';
import { AnthropicStrategy } from './AnthropicStrategy';
import { OllamaStrategy } from './OllamaStrategy';
import { VolcanoEngineStrategy } from './VolcanoEngineStrategy';

export class LLMStrategyFactory {
  private static readonly strategies: ILLMProviderStrategy[] = [];
  private static readonly fallbackStrategy: ILLMProviderStrategy = new BaseLLMStrategy();

  static {
    // 注册内置策略（按优先级先后顺序尝试匹配，特定提供商排在通用策略前面）
    this.registerStrategy(new GoogleStrategy());
    this.registerStrategy(new AnthropicStrategy());
    this.registerStrategy(new OllamaStrategy());
    this.registerStrategy(new VolcanoEngineStrategy());
    this.registerStrategy(new OpenAIStrategy());
  }

  /**
   * 注册自定义策略（新注册策略置于前列优先匹配）。
   */
  static registerStrategy(strategy: ILLMProviderStrategy): void {
    const existingIdx = this.strategies.findIndex((s) => s.name === strategy.name);
    if (existingIdx >= 0) {
      this.strategies[existingIdx] = strategy;
    } else {
      this.strategies.unshift(strategy);
    }
  }

  /**
   * 根据提供商记录动态匹配策略。
   *
   * @param provider LLM 提供商记录
   * @returns 匹配的策略实例；若无特殊匹配则返回通用 OpenAI 兼容策略
   */
  static getStrategy(provider: LLMProviderRecord): ILLMProviderStrategy {
    for (const strategy of this.strategies) {
      // 避免 BaseLLMStrategy / OpenAIStrategy 在特定提供商之前过早拦截
      if (strategy.name === 'openai-compatible' || strategy.name === 'openai') {
        continue;
      }
      if (strategy.supports(provider)) {
        return strategy;
      }
    }
    // 未匹配特殊提供商时，使用标准 OpenAI 兼容策略
    const openAi = this.strategies.find((s) => s.name === 'openai');
    return openAi || this.fallbackStrategy;
  }
}
