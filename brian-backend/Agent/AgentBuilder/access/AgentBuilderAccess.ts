import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, StreamAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, InfoCoreAccess } from '@brian-agent/core';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import { AgentBuilderSchemaInitializer } from '../infrastructure/AgentBuilderSchemaInitializer';
import { AgentBuilderService } from '../application/AgentBuilderService';
import {
  AgentBuilderContext,
  BuildAgentInput, BuildAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput,
  BuildSystemAgentInput, BuildSystemAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../domain/types';

export class AgentBuilderAccess {
  private readonly service: AgentBuilderService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    agentLibrary: AgentLibraryAccess,
    agentStrategy: AgentStrategyAccess,
    llmCore: LLMCoreAccess,
    mcpCore: MCPCoreAccess,
    skillCore: SkillCoreAccess,
    soulCore: SoulCoreAccess,
    logger?: Logger,
    infoCore?: InfoCoreAccess,
    streamAccess?: StreamAccess,
  ) {
    this.initPromise = new AgentBuilderSchemaInitializer(relationDb).init();
    const raw = new AgentBuilderService(
      relationDb, llmAccess, promptsAccess, agentLibrary, agentStrategy,
      llmCore, mcpCore, skillCore, soulCore, logger, infoCore, streamAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async buildAgent(i: BuildAgentInput, o: BuildAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildAgent(i, o, c, metrics, report);
  }

  async optimizeAgent(i: OptimizeAgentInput, o: OptimizeAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.optimizeAgent(i, o, c, metrics, report);
  }

  async buildSystemAgent(i: BuildSystemAgentInput, o: BuildSystemAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildSystemAgent(i, o, c, metrics, report);
  }

  async configAgentBuilder(i: ConfigAgentBuilderInput, o: ConfigAgentBuilderOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentBuilder(i, o, c, metrics, report);
  }
}