import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError, NotFoundError } from '@brian-agent/base';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import {
  AgentStrategyContext, MatchStrategyInput, MatchStrategyOutput, GetStrategyInput, GetStrategyOutput,
  SoStrategyInput, SoStrategyOutput, AddStrategyInput, AddStrategyOutput,
  UpdateStrategyInput, UpdateStrategyOutput, ConfigAgentStrategyInput, ConfigAgentStrategyOutput,
} from '../AgentStrategy/domain/types';
import { createTestDb, setupAgentTestMocks, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS } from './test-helpers';

function ruleJson() { return JSON.stringify({ version: '1.0', steps: [{ step: 'Think', next: 'Answer' }, { step: 'Answer', next: null }] }); }
function uid() { return `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

describe('AgentStrategy', () => {
  let service: AgentStrategyService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    service = new AgentStrategyService(await createTestDb(), NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
  });

  describe('addStrategy', () => {
    it('TC-AS-001: 正常新增策略', async () => {
      const out = new AddStrategyOutput();
      await service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: `test-${uid()}`, suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), out, new AgentStrategyContext());
      expect(out.strategy_id).toBeTruthy();
    });

    it('TC-AS-002: label 为空抛异常', async () => {
      await expect(service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: '', suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), new AddStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AS-003: complexity 范围非法', async () => {
      await expect(service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: `bad-${uid()}`, suitable_complexity_min: 80, suitable_complexity_max: 30,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), new AddStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AS-004: 重复 label 抛异常', async () => {
      const label = `dup-${uid()}`;
      await service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: label, suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), new AddStrategyOutput(), new AgentStrategyContext());
      await expect(service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: label, suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), new AddStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AS-005: execution_rule 无效 JSON', async () => {
      await expect(service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: `bad-json-${uid()}`, suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: 'not-json',
      }), new AddStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AS-006: execution_rule 不含 steps/phases', async () => {
      await expect(service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: `no-steps-${uid()}`, suitable_complexity_min: 0, suitable_complexity_max: 100,
        suitable_domains: '["*"]', execution_rule: '{"version":"1.0"}',
      }), new AddStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('matchStrategy', () => {
    it('TC-AS-011: 按复杂度匹配', async () => {
      await service.addStrategy(Object.assign(new AddStrategyInput(), {
        strategy_label: `low-${uid()}`, suitable_complexity_min: 0, suitable_complexity_max: 30,
        suitable_domains: '["*"]', execution_rule: ruleJson(),
      }), new AddStrategyOutput(), new AgentStrategyContext());
      const m = new MatchStrategyOutput();
      await service.matchStrategy(Object.assign(new MatchStrategyInput(), {
        task_content: 'test', task_complexity: 20, task_domain: 'general',
      }), m, new AgentStrategyContext());
      expect(m.strategy_id).toBeTruthy();
    });
  });

  describe('soStrategyById', () => {
    it('TC-AS-021: 不存在抛 NotFoundError', async () => {
      await expect(service.soStrategyById(Object.assign(new GetStrategyInput(), { strategy_id: 'nonexistent-strat-xyz' }),
        new GetStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateStrategy', () => {
    it('TC-AS-032: 不存在抛 NotFoundError', async () => {
      await expect(service.updateStrategy(Object.assign(new UpdateStrategyInput(), { strategy_id: 'nx-strat-xyz', strategy_label: 'x' }),
        new UpdateStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(NotFoundError);
    });
  });

  describe('configAgentStrategy', () => {
    it('TC-AS-050: 配置可用', async () => {
      const out = new ConfigAgentStrategyOutput();
      await service.configAgentStrategy(new ConfigAgentStrategyInput(), out, new AgentStrategyContext());
      expect(out.config).toBeTruthy();
    });

    it('TC-AS-052: default_strategy_id 不存在抛异常', async () => {
      await expect(service.configAgentStrategy(Object.assign(new ConfigAgentStrategyInput(), { default_strategy_id: 'nx-strat-xyz' }),
        new ConfigAgentStrategyOutput(), new AgentStrategyContext())).rejects.toThrow(ValidationError);
    });
  });
});
