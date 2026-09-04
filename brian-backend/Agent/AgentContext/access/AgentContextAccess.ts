import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { AgentContextSchemaInitializer } from '../infrastructure/AgentContextSchemaInitializer';
import { AgentContextService } from '../application/AgentContextService';
import type {
  AgentContextContext,
  GetContextDetailInput, GetContextDetailOutput,
  ConfigAgentContextInput, ConfigAgentContextOutput,
} from '../domain/types';

export class AgentContextAccess {
  private readonly service: AgentContextService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    logger?: Logger,
  ) {
    this.initPromise = new AgentContextSchemaInitializer(relationDb).init();
    const raw = new AgentContextService(relationDb, infoCore);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async soContextDetail(i: GetContextDetailInput, o: GetContextDetailOutput, c: AgentContextContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soContextDetail(i, o, c, metrics, report);
  }

  async configAgentContext(i: ConfigAgentContextInput, o: ConfigAgentContextOutput, c: AgentContextContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentContext(i, o, c, metrics, report);
  }
}
