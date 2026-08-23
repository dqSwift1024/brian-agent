import type { RelationDBAccess, PromptsAccess, LLMAccess, Logger, StreamAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { WriterAgentAccess, IntentAgentAccess } from '@brian-agent/agent';
import type { OrchestrationStrategyAccess } from '../../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import { OrchestrationEntrySchemaInitializer } from '../infrastructure/OrchestrationEntrySchemaInitializer';
import { OrchestrationEntryService } from '../application/OrchestrationEntryService';
import {
  OrchestrationEntryContext,
  ReceiveWorkInput, ReceiveWorkOutput,
  SelectOrchestrationStrategyInput, SelectOrchestrationStrategyOutput,
  ReceiveWorkAsyncInput, ReceiveWorkAsyncOutput,
  BuildWorkContextInput, BuildWorkContextOutput,
  GetWorkStatusInput, GetWorkStatusOutput,
  CancelWorkInput, CancelWorkOutput,
  ConfirmIntentInput, ConfirmIntentOutput,
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput,
} from '../domain/types';

export class OrchestrationEntryAccess {
  private readonly service: OrchestrationEntryService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    writerAgent: WriterAgentAccess,
    orchestrationStrategy: OrchestrationStrategyAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    llmAccess?: LLMAccess,
    promptsAccess?: PromptsAccess,
    mqAccess?: any,
    mqCore?: any,
    logger?: Logger,
    intentAgent?: IntentAgentAccess,
    streamAccess?: StreamAccess,
  ) {
    this.initPromise = new OrchestrationEntrySchemaInitializer(relationDb).init();
    const raw = new OrchestrationEntryService(
      relationDb, infoCore, writerAgent, orchestrationStrategy, orchestrationExecution,
      llmAccess, promptsAccess, mqAccess, mqCore, logger, intentAgent, streamAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async receiveWork(
    i: ReceiveWorkInput, c: OrchestrationEntryContext, o: ReceiveWorkOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.receiveWork(i, c, o);
  }

  async selectOrchestrationStrategy(
    i: SelectOrchestrationStrategyInput, c: OrchestrationEntryContext, o: SelectOrchestrationStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.selectOrchestrationStrategy(i, c, o);
  }

  async receiveWorkAsync(
    i: ReceiveWorkAsyncInput, c: OrchestrationEntryContext, o: ReceiveWorkAsyncOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.receiveWorkAsync(i, c, o);
  }

  async buildWorkContext(
    i: BuildWorkContextInput, c: OrchestrationEntryContext, o: BuildWorkContextOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildWorkContext(i, c, o);
  }

  async getWorkStatus(
    i: GetWorkStatusInput, c: OrchestrationEntryContext, o: GetWorkStatusOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getWorkStatus(i, c, o);
  }

  async cancelWork(
    i: CancelWorkInput, c: OrchestrationEntryContext, o: CancelWorkOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.cancelWork(i, c, o);
  }

  async confirmIntent(
    i: ConfirmIntentInput, c: OrchestrationEntryContext, o: ConfirmIntentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.confirmIntent(i, c, o);
  }

  async configOrchestrationEntry(
    i: ConfigOrchestrationEntryInput, c: OrchestrationEntryContext, o: ConfigOrchestrationEntryOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationEntry(i, c, o);
  }
}
