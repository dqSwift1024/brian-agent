import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { AgentLibraryAccess, AgentExecutionAccess } from '@brian-agent/agent';
import { OrchestrationVisualizationSchemaInitializer } from '../infrastructure/OrchestrationVisualizationSchemaInitializer';
import { OrchestrationVisualizationService } from '../application/OrchestrationVisualizationService';
import {
  OrchestrationVisualizationContext,
  VisualizeAgentDAGInput, VisualizeAgentDAGOutput,
  VisualizeWorkFlowInput, VisualizeWorkFlowOutput,
  GetAgentNodeDetailInput, GetAgentNodeDetailOutput,
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput,
} from '../domain/types';

export class OrchestrationVisualizationAccess {
  private readonly service: OrchestrationVisualizationService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentLibrary: AgentLibraryAccess,
    agentExecution: AgentExecutionAccess,
    logger?: Logger,
  ) {
    this.initPromise = new OrchestrationVisualizationSchemaInitializer().init();
    const raw = new OrchestrationVisualizationService(relationDb, agentLibrary, agentExecution, logger);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async visualizeAgentDAG(i: VisualizeAgentDAGInput, o: VisualizeAgentDAGOutput, c: OrchestrationVisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.visualizeAgentDAG(i, o, c, metrics, report);
  }

  async visualizeWorkFlow(i: VisualizeWorkFlowInput, o: VisualizeWorkFlowOutput, c: OrchestrationVisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.visualizeWorkFlow(i, o, c, metrics, report);
  }

  async soAgentNodeDetail(i: GetAgentNodeDetailInput, o: GetAgentNodeDetailOutput, c: OrchestrationVisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soAgentNodeDetail(i, o, c, metrics, report);
  }

  async configOrchestrationVisualization(i: ConfigOrchestrationVisualizationInput, o: ConfigOrchestrationVisualizationOutput, c: OrchestrationVisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationVisualization(i, o, c, metrics, report);
  }
}
