import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import {
  Operator, ValidationError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoSoulOutput, AddSoulOutput, SoulContext,
  PROMPT_IDS,
} from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import {
  InfoCoreContext, LastNInfoInput, LastNInfoOutput,
  ContextInfoInput, ContextInfoOutput,
} from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, UpdateAgentInput, UpdateAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { parseJsonObject } from '../../shared/signature';
import {
  IntentAgentContext,
  UnderstandRequirementInput, UnderstandRequirementOutput,
  INTENT_SOUL_BRIEF, INTENT_SOUL_CONTENT, INTENT_SOUL_USAGE,
} from '../domain/types';

export class IntentAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly soulAccess: SoulAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmCore?: LLMCoreAccess,
    private readonly logger?: Logger,
  ) {}

  async ensureBuiltin(_ctx: IntentAgentContext): Promise<boolean> {
    const builtinSoulId = await this.ensureBuiltinSoul();

    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(
      Object.assign(new BuildSystemAgentInput(), { agent_type: 'INTENT' }),
      new AgentBuilderContext(),
      buildOut,
    );
    if (!buildOut.agent_id) throw new ValidationError('buildIntentAgent failed');

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      new AgentLibraryContext(),
      getOut,
    );
    const agent = getOut.agents[0];
    if (agent && builtinSoulId && agent.soul_id !== builtinSoulId) {
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), { agent_id: buildOut.agent_id, soul_id: builtinSoulId }),
        new AgentLibraryContext(),
        new UpdateAgentOutput(),
      );
    }
    return true;
  }

  async understandRequirement(
    input: UnderstandRequirementInput,
    _ctx: IntentAgentContext,
    output: UnderstandRequirementOutput,
  ): Promise<boolean> {
    if (!input.user_query || !input.user_query.trim()) {
      output.understood_requirement = input.user_query ?? '';
      output.match_score = 100;
      output.reasoning = '用户输入为空';
      output.should_modify_query = false;
      return true;
    }

    const threshold = await this.getMatchThresholdConfig();
    output.threshold_score = threshold;

    // 1. 获取基于时间的历史上下文
    const historyText = await this.fetchRecentHistory(input.session_id);

    // 2. 获取钉住的固定信息
    const pinnedText = await this.fetchPinnedInfo(input.session_id, input.work_id);

    // 3. 获取显式引用的消息
    const citingText = await this.fetchCitingMessages(
      input.session_id,
      input.citing_msg_ids ?? [],
      input.selected_msg_ids ?? [],
    );

    // 4. 执行 Prompt 与 LLM 推理
    const promptIn = Object.assign(new ExecPromptInput(), {
      id: PROMPT_IDS.intentUnderstanding,
      variables: {
        user_query: input.user_query,
        recent_history: historyText || '（无历史上下文）',
        pinned_info: pinnedText || '（无固定钉住信息）',
        citing_messages: citingText || '（无显式引用消息）',
      },
    });
    const promptOut = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(promptIn, new PromptContext(), promptOut);
    output.prompt = promptOut.prompt;

    const llmIn = Object.assign(new ExecLLMInput(), {
      prompt: promptOut.prompt,
    });
    const llmOut = new ExecLLMOutput();
    await this.llmAccess.execLLM(llmIn, new LLMContext(), llmOut);

    const parsed = parseJsonObject(llmOut.result);
    if (parsed && typeof parsed.understood_requirement === 'string') {
      output.understood_requirement = parsed.understood_requirement.trim() || input.user_query;
      const rawScore = Number(parsed.match_score);
      output.match_score = Number.isNaN(rawScore) ? 100 : Math.min(100, Math.max(0, rawScore));
      output.reasoning = String(parsed.reasoning ?? '');
    } else {
      output.understood_requirement = input.user_query;
      output.match_score = 100;
      output.reasoning = 'LLM 返回格式解析不确定，降级保持原始需求';
    }

    output.should_modify_query = output.match_score < output.threshold_score;
    return true;
  }

  private async ensureBuiltinSoul(): Promise<string> {
    const so = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'soul_brief', operator: Operator.EQ, value: INTENT_SOUL_BRIEF }] },
      new SoulContext(),
      so,
    );
    if (so.list.length > 0) return so.list[0].id;

    const addOut = new AddSoulOutput();
    await this.soulAccess.addSoul(
      {
        data: {
          soul_brief: INTENT_SOUL_BRIEF,
          soul_content: INTENT_SOUL_CONTENT,
          soul_usage: INTENT_SOUL_USAGE,
        },
      },
      new SoulContext(),
      addOut,
    );
    return addOut.id;
  }

  private async getMatchThresholdConfig(): Promise<number> {
    try {
      const rows = await this.relationDb.select('config_value', {
        conditions: [{ field: 'config_key', operator: Operator.EQ, value: 'intent_agent.match_threshold' }],
      });
      if (rows.length > 0 && rows[0].config_value !== undefined) {
        const val = Number(rows[0].config_value);
        if (!Number.isNaN(val)) return val;
      }
    } catch {
      /* best-effort */
    }
    return 80;
  }

  private async fetchRecentHistory(sessionId: string): Promise<string> {
    if (!sessionId) return '';
    try {
      const historyIn = Object.assign(new LastNInfoInput(), {
        session_id: sessionId,
        lastN: 10,
      });
      const historyOut = new LastNInfoOutput();
      await this.infoCore.lastNInfo(historyIn, new InfoCoreContext(), historyOut);

      return (historyOut.list ?? [])
        .map((info: any) => `[${info.info_creator_role || 'USER'}]: ${info.info_content}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  private async fetchPinnedInfo(sessionId: string, workId?: string): Promise<string> {
    if (!sessionId) return '';
    try {
      const ctxIn = Object.assign(new ContextInfoInput(), {
        session_id: sessionId,
        work_id: workId || '',
      });
      const ctxOut = new ContextInfoOutput();
      await this.infoCore.context(ctxIn, new InfoCoreContext(), ctxOut);

      return (ctxOut.categories?.pinned ?? [])
        .map((pin: any, idx: number) => `${idx + 1}. ${pin.info ?? pin.content ?? ''}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  private async fetchCitingMessages(
    sessionId: string,
    citingIds: string[],
    selectedIds: string[],
  ): Promise<string> {
    const allIds = Array.from(new Set([...citingIds, ...selectedIds])).filter(Boolean);
    if (allIds.length === 0) return '';
    try {
      const historyIn = Object.assign(new LastNInfoInput(), {
        session_id: sessionId,
        lastN: 50,
      });
      const historyOut = new LastNInfoOutput();
      await this.infoCore.lastNInfo(historyIn, new InfoCoreContext(), historyOut);

      const matched = (historyOut.list ?? []).filter((info: any) =>
        allIds.includes(info.id) || (info.info_id && allIds.includes(info.info_id)),
      );

      return matched.map((info: any) => `> ${info.info_content}`).join('\n');
    } catch {
      return '';
    }
  }
}
