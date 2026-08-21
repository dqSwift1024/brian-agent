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

  async getContextDetail(
    i: GetContextDetailInput,
    c: AgentContextContext,
    o: GetContextDetailOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getContextDetail(i, c, o);
  }

  async configAgentContext(
    i: ConfigAgentContextInput,
    c: AgentContextContext,
    o: ConfigAgentContextOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentContext(i, c, o);
  }
}
