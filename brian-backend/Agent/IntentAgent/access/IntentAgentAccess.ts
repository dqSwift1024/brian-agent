import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { IntentAgentService } from '../application/IntentAgentService';
import {
  IntentAgentContext,
  UnderstandRequirementInput, UnderstandRequirementOutput,
} from '../domain/types';

export class IntentAgentAccess {
  private readonly service: IntentAgentService;

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
    const raw = new IntentAgentService(
      relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async ensureBuiltin(ctx: IntentAgentContext): Promise<boolean> {
    return this.service.ensureBuiltin(ctx);
  }

  async understandRequirement(i: UnderstandRequirementInput, o: UnderstandRequirementOutput, c: IntentAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.understandRequirement(i, o, c, metrics, report);
  }
}
