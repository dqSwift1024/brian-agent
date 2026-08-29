import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentStrategySchemaInitializer } from '../infrastructure/AgentStrategySchemaInitializer';
import { AgentStrategyService } from '../application/AgentStrategyService';
import {
  AgentStrategyContext,
  MatchStrategyInput, MatchStrategyOutput,
  GetStrategyInput, GetStrategyOutput,
  SoStrategyInput, SoStrategyOutput,
  AddStrategyInput, AddStrategyOutput,
  UpdateStrategyInput, UpdateStrategyOutput,
  ToggleStrategyInput, ToggleStrategyOutput,
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput,
} from '../domain/types';

export class AgentStrategyAccess {
  private readonly service: AgentStrategyService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new AgentStrategySchemaInitializer(relationDb).init();
    const raw = new AgentStrategyService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async matchStrategy(i: MatchStrategyInput, o: MatchStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.matchStrategy(i, o, c, metrics, report);
  }

  async soStrategyById(i: GetStrategyInput, o: GetStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soStrategyById(i, o, c, metrics, report);
  }

  async soStrategy(i: SoStrategyInput, o: SoStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soStrategy(i, o, c, metrics, report);
  }

  async addStrategy(i: AddStrategyInput, o: AddStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addStrategy(i, o, c, metrics, report);
  }

  async updateStrategy(i: UpdateStrategyInput, o: UpdateStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateStrategy(i, o, c, metrics, report);
  }

  async toggleStrategy(i: ToggleStrategyInput, o: ToggleStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.toggleStrategy(i, o, c, metrics, report);
  }

  async configAgentStrategy(i: ConfigAgentStrategyInput, o: ConfigAgentStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentStrategy(i, o, c, metrics, report);
  }
}