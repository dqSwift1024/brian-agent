import { describe, it, expect, vi } from 'vitest';
import { IntentAgentService } from '../IntentAgent/application/IntentAgentService';
import {
  UnderstandRequirementInput, UnderstandRequirementOutput, IntentAgentContext,
} from '../IntentAgent/domain/types';

function makeMocks() {
  const infoCore = {
    getLastNInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.info_list = [
        { id: 'msg1', info_creator_role: 'USER', info_content: '之前的想法是实现内置Agent' },
      ];
      return true;
    }),
    getPinInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.pin_list = [{ info_content: '重要提醒：需求理解得分低于阈值触发弹窗确认' }];
      return true;
    }),
  };
  const promptsAccess = {
    execPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.prompt = 'rendered prompt with 4 contexts';
      return true;
    }),
  };
  const soulAccess = {
    soSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; return true; }),
    addSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.id = 'soul-intent-id'; return true; }),
  };
  const agentBuilder = {
    buildSystemAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agent_id = 'agent-intent-id'; return true; }),
  };
  const agentLibrary = {
    getAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agents = [{ agent_id: 'agent-intent-id', agent_type: 'INTENT', soul_id: 'soul-intent-id', enable: 1 }];
      return true;
    }),
    updateAgent: vi.fn().mockResolvedValue(true),
  };
  const llmAccess = {
    execLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.result = JSON.stringify({
        understood_requirement: '系统根据历史对话与钉住信息理解后的需求',
        match_score: 60,
        reasoning: '理解需求与用户表达存在部分偏差',
      });
      return true;
    }),
  };
  const relationDb = {
    select: vi.fn().mockResolvedValue([{ config_value: '80' }]),
  };
  return { infoCore, promptsAccess, soulAccess, agentBuilder, agentLibrary, llmAccess, relationDb };
}

function makeService(mocks: ReturnType<typeof makeMocks>) {
  return new IntentAgentService(
    mocks.relationDb as any,
    mocks.llmAccess as any,
    mocks.promptsAccess as any,
    mocks.soulAccess as any,
    mocks.agentBuilder as any,
    mocks.agentLibrary as any,
    mocks.infoCore as any,
  );
}

describe('IntentAgent', () => {
  it('ensureBuiltin 幂等生成内置 Agent 和 Soul', async () => {
    const mocks = makeMocks();
    const svc = makeService(mocks);
    const ok = await svc.ensureBuiltin(new IntentAgentContext());
    expect(ok).toBe(true);
    expect(mocks.agentBuilder.buildSystemAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agent_type: 'INTENT' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('understandRequirement 当匹配得分低于阈值时 should_modify_query 为 true', async () => {
    const mocks = makeMocks();
    const svc = makeService(mocks);
    const input = Object.assign(new UnderstandRequirementInput(), {
      session_id: 'session-1',
      user_query: '修改需求Agent',
      citing_msg_ids: ['msg1'],
    });
    const output = new UnderstandRequirementOutput();
    const ok = await svc.understandRequirement(input, new IntentAgentContext(), output);

    expect(ok).toBe(true);
    expect(output.match_score).toBe(60);
    expect(output.threshold_score).toBe(80);
    expect(output.should_modify_query).toBe(true);
    expect(output.understood_requirement).toBe('系统根据历史对话与钉住信息理解后的需求');
  });

  it('understandRequirement 当匹配得分高于阈值时 should_modify_query 为 false', async () => {
    const mocks = makeMocks();
    mocks.llmAccess.execLLM.mockImplementationOnce(async (_i: any, _c: any, o: any) => {
      o.result = JSON.stringify({
        understood_requirement: '修改需求Agent',
        match_score: 95,
        reasoning: '高度匹配',
      });
      return true;
    });
    const svc = makeService(mocks);
    const input = Object.assign(new UnderstandRequirementInput(), {
      session_id: 'session-1',
      user_query: '修改需求Agent',
    });
    const output = new UnderstandRequirementOutput();
    await svc.understandRequirement(input, new IntentAgentContext(), output);

    expect(output.match_score).toBe(95);
    expect(output.should_modify_query).toBe(false);
  });
});
