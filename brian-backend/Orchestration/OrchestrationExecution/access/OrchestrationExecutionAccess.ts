import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger, StreamAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { AgentBuilderAccess, AgentExecutionAccess, AgentLibraryAccess } from '@brian-agent/agent';
import type { InfoCoreAccess } from '@brian-agent/core';
import { OrchestrationExecutionSchemaInitializer } from '../infrastructure/OrchestrationExecutionSchemaInitializer';
import { OrchestrationExecutionService } from '../application/OrchestrationExecutionService';
import {
  OrchestrationExecutionContext,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  ExecDAGInput, ExecDAGOutput,
  ExecDAGAsyncInput, ExecDAGAsyncOutput,
  GetDAGProgressInput, GetDAGProgressOutput,
  CancelExecutionInput, CancelExecutionOutput,
  GetOrchestrationExecQueueStatusInput, GetOrchestrationExecQueueStatusOutput,
  ConfigOrchestrationExecutionInput, ConfigOrchestrationExecutionOutput,
  RecordSystemAgentExecutionInput, RecordSystemAgentExecutionOutput,
} from '../domain/types';

export class OrchestrationExecutionAccess {
  private readonly service: OrchestrationExecutionService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentBuilder: AgentBuilderAccess,
    agentExecution: AgentExecutionAccess,
    agentLibrary: AgentLibraryAccess,
    infoCore: InfoCoreAccess,
    mqAccess?: any,
    mqCore?: any,
    logger?: Logger,
    streamAccess?: StreamAccess,
  ) {
    this.initPromise = new OrchestrationExecutionSchemaInitializer(relationDb).init();
    const raw = new OrchestrationExecutionService(
      relationDb, agentBuilder, agentExecution, agentLibrary, infoCore,
      mqAccess, mqCore, logger, streamAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async buildAgentDAG(i: BuildAgentDAGInput, o: BuildAgentDAGOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildAgentDAG(i, o, c, metrics, report);
  }

  async execSingleAgent(i: ExecSingleAgentInput, o: ExecSingleAgentOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execSingleAgent(i, o, c, metrics, report);
  }

  async execDAG(i: ExecDAGInput, o: ExecDAGOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execDAG(i, o, c, metrics, report);
  }

  async recordSystemAgentExecution(i: RecordSystemAgentExecutionInput, o: RecordSystemAgentExecutionOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.recordSystemAgentExecution(i, o, c, metrics, report);
  }

  async execDAGAsync(i: ExecDAGAsyncInput, o: ExecDAGAsyncOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execDAGAsync(i, o, c, metrics, report);
  }

  async soDAGProgress(i: GetDAGProgressInput, o: GetDAGProgressOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soDAGProgress(i, o, c, metrics, report);
  }

  async cancelExecution(i: CancelExecutionInput, o: CancelExecutionOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.cancelExecution(i, o, c, metrics, report);
  }

  async soExecQueueStatus(i: GetOrchestrationExecQueueStatusInput, o: GetOrchestrationExecQueueStatusOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soExecQueueStatus(i, o, c, metrics, report);
  }

  async configOrchestrationExecution(i: ConfigOrchestrationExecutionInput, o: ConfigOrchestrationExecutionOutput, c: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationExecution(i, o, c, metrics, report);
  }
}
