import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { WriterAgentSchemaInitializer } from '../infrastructure/WriterAgentSchemaInitializer';
import { WriterAgentService } from '../application/WriterAgentService';
import {
  WriterAgentContext,
  WriteInput, WriteOutput,
  SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput,
  ConfigWriterAgentInput, ConfigWriterAgentOutput,
} from '../domain/types';

export class WriterAgentAccess {
  private readonly service: WriterAgentService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    soulAccess?: SoulAccess,
    llmCore?: LLMCoreAccess,
    logger?: Logger,
  ) {
    this.initPromise = new WriterAgentSchemaInitializer(relationDb).init();
    const raw = new WriterAgentService(
      relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, soulAccess, llmCore,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async execWrite(i: WriteInput, o: WriteOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execWrite(i, o, c, metrics, report);
  }

  async saveUserProfile(i: SaveUserProfileInput, o: SaveUserProfileOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.saveUserProfile(i, o, c, metrics, report);
  }

  async soUserProfile(i: GetUserProfileInput, o: GetUserProfileOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soUserProfile(i, o, c, metrics, report);
  }

  async configWriterAgent(i: ConfigWriterAgentInput, o: ConfigWriterAgentOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configWriterAgent(i, o, c, metrics, report);
  }
}