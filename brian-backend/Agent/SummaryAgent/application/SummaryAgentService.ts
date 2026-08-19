import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import {
  Operator, ValidationError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput, AddPromptInput, AddPromptOutput,
  SoSoulInput, SoSoulOutput, AddSoulInput, AddSoulOutput,
  GetSoulInput, GetSoulOutput, SoulContext,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  InfoCoreContext, SoInfoSummaryConfigInput, SoInfoSummaryConfigOutput,
} from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, UpdateAgentInput, UpdateAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import {
  SummaryAgentContext,
  GenerateSummaryInput, GenerateSummaryOutput,
  SUMMARY_SOUL_BRIEF, SUMMARY_SOUL_CONTENT, SUMMARY_SOUL_USAGE,
  SUMMARY_PROMPT_TITLE, SUMMARY_PROMPT_TEMPLATE,
} from '../domain/types';

export class SummaryAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly soulAccess: SoulAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly logger?: Logger,
  ) {}

  async ensureBuiltin(_ctx: SummaryAgentContext): Promise<boolean> {
    const builtinSoulId = await this.ensureBuiltinSoul();
    await this.ensureBuiltinPrompt();

    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(
      Object.assign(new BuildSystemAgentInput(), { agent_type: 'SUMMARY' }),
      new AgentBuilderContext(),
      buildOut,
    );
    if (!buildOut.agent_id) throw new ValidationError('buildSummaryAgent failed');

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

  async generateSummary(
    input: GenerateSummaryInput,
    _ctx: SummaryAgentContext,
    output: GenerateSummaryOutput,
  ): Promise<boolean> {
    const cfgOut = new SoInfoSummaryConfigOutput();
    await this.infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), new InfoCoreContext(), cfgOut);
    const config = cfgOut.config;
    if (!config || config.enable !== 1) {
      output.summary = '';
      return true;
    }

    const types = String(config.info_types ?? 'RESPONSE')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (types.length > 0 && !types.includes(input.info_type)) {
      output.summary = '';
      return true;
    }

    const threshold = config.threshold ?? 100;
    if (input.info.length <= threshold) {
      output.summary = input.info;
      return true;
    }

    output.summary = await this.generateByLLM(input.info);
    return true;
  }

  private async ensureBuiltinSoul(): Promise<string> {
    const so = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'soul_brief', operator: Operator.EQ, value: SUMMARY_SOUL_BRIEF }] },
      new SoulContext(),
      so,
    );
    if (so.list.length > 0) return so.list[0].id;

    const addOut = new AddSoulOutput();
    await this.soulAccess.addSoul(
      {
        data: {
          soul_brief: SUMMARY_SOUL_BRIEF,
          soul_content: SUMMARY_SOUL_CONTENT,
          soul_usage: SUMMARY_SOUL_USAGE,
        },
      },
      new SoulContext(),
      addOut,
    );
    return addOut.id;
  }

  private async ensureBuiltinPrompt(): Promise<string> {
    const so = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      { conditions: [{ field: 'prompt_template_title', operator: Operator.EQ, value: SUMMARY_PROMPT_TITLE }] },
      new PromptContext(),
      so,
    );
    if (so.list.length > 0) return so.list[0].id;

    const addOut = new AddPromptOutput();
    await this.promptsAccess.addPrompt(
      {
        data: {
          prompt_template_title: SUMMARY_PROMPT_TITLE,
          prompt_template_brief: SUMMARY_PROMPT_TITLE,
          prompt_template: SUMMARY_PROMPT_TEMPLATE,
        },
      },
      new PromptContext(),
      addOut,
    );
    return addOut.id;
  }

  private async generateByLLM(info: string): Promise<string> {
    const soPromptOut = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      { conditions: [{ field: 'prompt_template_title', operator: Operator.EQ, value: SUMMARY_PROMPT_TITLE }] },
      new PromptContext(),
      soPromptOut,
    );
    const template = soPromptOut.list?.[0];
    if (!template) return '';

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_type: 'SUMMARY' }),
      new AgentLibraryContext(),
      getOut,
    );
    const agent = getOut.agents.find((a) => a.enable);
    const llmId = agent?.llm_id || '';

    let system = '';
    if (agent?.soul_id) {
      try {
        const soulOut = new GetSoulOutput();
        await this.soulAccess.getSoul(
          Object.assign(new GetSoulInput(), { id: agent.soul_id }),
          new SoulContext(),
          soulOut,
        );
        system = soulOut.soul?.soul_content ?? soulOut.soul?.soul_brief ?? '';
      } catch {
        /* ignore */
      }
    }

    const promptOut = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), {
        id: template.id,
        variables: { text: info, soul: system },
      }),
      new PromptContext(),
      promptOut,
    );
    if (!promptOut.prompt) return '';

    const llmOut = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: llmId,
        prompt: promptOut.prompt,
        ...(system ? { system } : {}),
      }),
      new LLMContext(),
      llmOut,
    );
    if (!ok || !llmOut.result) return '';
    return llmOut.result.trim();
  }
}
