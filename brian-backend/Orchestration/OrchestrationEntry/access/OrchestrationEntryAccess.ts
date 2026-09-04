import { Metrics, Report } from '@brian-agent/base';
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
  SubmitClarificationInput, SubmitClarificationOutput,
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

  async receiveWork(i: ReceiveWorkInput, o: ReceiveWorkOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.receiveWork(i, o, c, metrics, report);
  }

  async selectOrchestrationStrategy(i: SelectOrchestrationStrategyInput, o: SelectOrchestrationStrategyOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.selectOrchestrationStrategy(i, o, c, metrics, report);
  }

  async receiveWorkAsync(i: ReceiveWorkAsyncInput, o: ReceiveWorkAsyncOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.receiveWorkAsync(i, o, c, metrics, report);
  }

  async buildWorkContext(i: BuildWorkContextInput, o: BuildWorkContextOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildWorkContext(i, o, c, metrics, report);
  }

  async soWorkStatus(i: GetWorkStatusInput, o: GetWorkStatusOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soWorkStatus(i, o, c, metrics, report);
  }

  async cancelWork(i: CancelWorkInput, o: CancelWorkOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.cancelWork(i, o, c, metrics, report);
  }

  async confirmIntent(i: ConfirmIntentInput, o: ConfirmIntentOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.confirmIntent(i, o, c, metrics, report);
  }

  async submitClarification(i: SubmitClarificationInput, o: SubmitClarificationOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.submitClarification(i, o, c, metrics, report);
  }

  async configOrchestrationEntry(i: ConfigOrchestrationEntryInput, o: ConfigOrchestrationEntryOutput, c: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationEntry(i, o, c, metrics, report);
  }
}
