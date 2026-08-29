import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { PlannerAgentSchemaInitializer } from '../infrastructure/PlannerAgentSchemaInitializer';
import { PlannerAgentService } from '../application/PlannerAgentService';
import {
  PlannerAgentContext,
  PlanInput, PlanOutput,
  PlanHierarchicalInput, PlanHierarchicalOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
} from '../domain/types';

export class PlannerAgentAccess {
  private readonly service: PlannerAgentService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    llmCore?: LLMCoreAccess,
    logger?: Logger,
  ) {
    this.initPromise = new PlannerAgentSchemaInitializer(relationDb).init();
    const raw = new PlannerAgentService(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, llmCore);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async execPlan(i: PlanInput, o: PlanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execPlan(i, o, c, metrics, report);
  }

  async planHierarchical(i: PlanHierarchicalInput, o: PlanHierarchicalOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.planHierarchical(i, o, c, metrics, report);
  }

  async replan(i: ReplanInput, o: ReplanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.replan(i, o, c, metrics, report);
  }

  async soPlan(i: GetPlanInput, o: GetPlanOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.soPlan(i, o, c, metrics, report);
  }

  async configPlannerAgent(i: ConfigPlannerAgentInput, o: ConfigPlannerAgentOutput, c: PlannerAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configPlannerAgent(i, o, c, metrics, report);
  }
}