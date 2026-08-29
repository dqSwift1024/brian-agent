import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type {
  AgentBuilderAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import type { JSONNodeAccess } from '../../JSONNode/access/JSONNodeAccess';
import { OrchestrationStrategySchemaInitializer } from '../infrastructure/OrchestrationStrategySchemaInitializer';
import { OrchestrationStrategyService } from '../application/OrchestrationStrategyService';
import {
  OrchestrationStrategyContext,
  StartOrchestrationInput, StartOrchestrationOutput,
  ExecuteSimpleStrategyInput, ExecuteSimpleStrategyOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
  ExecutePostProcessingInput, ExecutePostProcessingOutput,
  AddOrchestrationStrategyInput, AddOrchestrationStrategyOutput,
  HandleDAGFailureInput, HandleDAGFailureOutput,
  GetOrchestrationStrategyInput, GetOrchestrationStrategyOutput,
  UpdateOrchestrationStrategyInput, UpdateOrchestrationStrategyOutput,
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput,
} from '../domain/types';

export class OrchestrationStrategyAccess {
  private readonly service: OrchestrationStrategyService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentBuilder: AgentBuilderAccess,
    plannerAgent: PlannerAgentAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    jsonNode: JSONNodeAccess,
    mqCore?: any,
    logger?: Logger,
  ) {
    this.initPromise = new OrchestrationStrategySchemaInitializer(relationDb).init();
    const raw = new OrchestrationStrategyService(
      relationDb, agentBuilder, plannerAgent, writerAgent, evolutorAgent,
      orchestrationExecution, jsonNode, mqCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async startOrchestration(i: StartOrchestrationInput, o: StartOrchestrationOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.startOrchestration(i, o, c, metrics, report);
  }

  async executeSimpleStrategy(i: ExecuteSimpleStrategyInput, o: ExecuteSimpleStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executeSimpleStrategy(i, o, c, metrics, report);
  }

  async executePlanningStrategy(i: ExecutePlanningStrategyInput, o: ExecutePlanningStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executePlanningStrategy(i, o, c, metrics, report);
  }

  async executePostProcessing(i: ExecutePostProcessingInput, o: ExecutePostProcessingOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executePostProcessing(i, o, c, metrics, report);
  }

  async addStrategy(i: AddOrchestrationStrategyInput, o: AddOrchestrationStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addStrategy(i, o, c, metrics, report);
  }

  async handleDAGFailure(i: HandleDAGFailureInput, o: HandleDAGFailureOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.handleDAGFailure(i, o, c, metrics, report);
  }

  async soStrategyById(i: GetOrchestrationStrategyInput, o: GetOrchestrationStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soStrategyById(i, o, c, metrics, report);
  }

  async updateStrategy(i: UpdateOrchestrationStrategyInput, o: UpdateOrchestrationStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateStrategy(i, o, c, metrics, report);
  }

  async configOrchestrationStrategy(i: ConfigOrchestrationStrategyInput, o: ConfigOrchestrationStrategyOutput, c: OrchestrationStrategyContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationStrategy(i, o, c, metrics, report);
  }
}
