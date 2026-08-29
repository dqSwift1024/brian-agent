import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { SummaryAgentService } from '../application/SummaryAgentService';
import {
  SummaryAgentContext,
  GenerateSummaryInput, GenerateSummaryOutput,
} from '../domain/types';

export class SummaryAgentAccess {
  private readonly service: SummaryAgentService;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    soulAccess: SoulAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    infoCore: InfoCoreAccess,
    llmCore?: LLMCoreAccess,
    logger?: Logger,
  ) {
    const raw = new SummaryAgentService(
      relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {}

  async ensureBuiltin(ctx: SummaryAgentContext): Promise<boolean> {
    return this.service.ensureBuiltin(ctx);
  }

  async generateSummary(i: GenerateSummaryInput, o: GenerateSummaryOutput, c: SummaryAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.generateSummary(i, o, c, metrics, report);
  }
}
