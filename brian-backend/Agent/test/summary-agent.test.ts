import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummaryAgentService } from '../SummaryAgent/application/SummaryAgentService';
import {
  GenerateSummaryInput, GenerateSummaryOutput, SummaryAgentContext,
} from '../SummaryAgent/domain/types';

function makeMocks() {
  const infoCore = {
    soInfoSummaryConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = { id: 'cfg1', created: 0, updated: 0, llm_id: '', prompt_template_id: '', enable: 1, threshold: 100, info_types: 'RESPONSE' };
      return true;
    }),
  };
  const promptsAccess = {
    soPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.list = [];
      o.total = 0;
      return true;
    }),
    execPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.prompt = 'rendered-prompt'; return true; }),
    addPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.id = 'p-new'; return true; }),
  };
  const soulAccess = {
    soSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; o.total = 0; return true; }),
    addSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.id = 'soul-builtin'; return true; }),
    getSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.soul = { soul_content: '摘要专家', soul_brief: '摘要生成专家', soul_usage: '摘要' }; return true; }),
  };
  const agentBuilder = {
    buildSystemAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agent_id = 'agent-summary'; return true; }),
  };
  const agentLibrary = {
    getAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agents = [{ agent_id: 'agent-summary', agent_type: 'SUMMARY', soul_id: 'soul-builtin', llm_id: 'llm-1', enable: 1 }];
      return true;
    }),
    updateAgent: vi.fn().mockResolvedValue(true),
  };
  const llmAccess = {
    execLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.result = '这是 LLM 生成的摘要'; return true; }),
  };
  return { infoCore, promptsAccess, soulAccess, agentBuilder, agentLibrary, llmAccess };
}

function makeService(mocks: ReturnType<typeof makeMocks>) {
  return new SummaryAgentService(
    null as any, mocks.llmAccess as any, mocks.promptsAccess as any,
    mocks.soulAccess as any, mocks.agentBuilder as any, mocks.agentLibrary as any,
    mocks.infoCore as any,
  );
}

describe('SummaryAgent', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let svc: SummaryAgentService;

  beforeEach(() => {
    mocks = makeMocks();
    svc = makeService(mocks);
  });

  describe('generateSummary', () => {
    it('TC-SUM-001: 内容未超过阈值时直接返回原文作为摘要', async () => {
      const out = new GenerateSummaryOutput();
      await svc.generateSummary(
        Object.assign(new GenerateSummaryInput(), { info_type: 'RESPONSE', info: '短内容' }),
        new SummaryAgentContext(),
        out,
      );
      expect(out.summary).toBe('短内容');
      expect(mocks.llmAccess.execLLM).not.toHaveBeenCalled();
    });

    it('TC-SUM-002: 内容超过阈值时调用 LLM 生成摘要', async () => {
      mocks.promptsAccess.soPrompt.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [{ id: 'p1', prompt_template_title: '系统响应摘要生成', prompt_template: '{{text}}' }];
        o.total = 1;
        return true;
      });
      const long = '长'.repeat(150);
      const out = new GenerateSummaryOutput();
      await svc.generateSummary(
        Object.assign(new GenerateSummaryInput(), { info_type: 'RESPONSE', info: long }),
        new SummaryAgentContext(),
        out,
      );
      expect(out.summary).toBe('这是 LLM 生成的摘要');
      expect(mocks.llmAccess.execLLM).toHaveBeenCalled();
    });

    it('TC-SUM-003: info_type 不在白名单时返回空摘要', async () => {
      const out = new GenerateSummaryOutput();
      await svc.generateSummary(
        Object.assign(new GenerateSummaryInput(), { info_type: 'THINK', info: '长'.repeat(150) }),
        new SummaryAgentContext(),
        out,
      );
      expect(out.summary).toBe('');
      expect(mocks.llmAccess.execLLM).not.toHaveBeenCalled();
    });

    it('TC-SUM-004: 摘要生成禁用时返回空摘要', async () => {
      mocks.infoCore.soInfoSummaryConfig.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.config = { enable: 0, threshold: 100, info_types: 'RESPONSE' };
        return true;
      });
      const out = new GenerateSummaryOutput();
      await svc.generateSummary(
        Object.assign(new GenerateSummaryInput(), { info_type: 'RESPONSE', info: '长'.repeat(150) }),
        new SummaryAgentContext(),
        out,
      );
      expect(out.summary).toBe('');
    });
  });

  describe('ensureBuiltin', () => {
    it('TC-SUM-010: 创建内置 Soul 与 Prompt 并构建 SUMMARY Agent', async () => {
      const ok = await svc.ensureBuiltin(new SummaryAgentContext());
      expect(ok).toBe(true);
      expect(mocks.soulAccess.addSoul).toHaveBeenCalled();
      expect(mocks.promptsAccess.addPrompt).toHaveBeenCalled();
      expect(mocks.agentBuilder.buildSystemAgent).toHaveBeenCalled();
    });

    it('TC-SUM-011: 内置 Soul 已存在时复用', async () => {
      mocks.soulAccess.soSoul.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [{ id: 'soul-existing', soul_brief: '摘要生成专家', soul_content: 'x', soul_usage: 'x' }];
        o.total = 1;
        return true;
      });
      await svc.ensureBuiltin(new SummaryAgentContext());
      expect(mocks.soulAccess.addSoul).not.toHaveBeenCalled();
    });
  });
});
