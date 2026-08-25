import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { WriterAgentAccess, EvolutorAgentAccess } from '@brian-agent/agent';
import { UserProfileSchemaInitializer } from '../infrastructure/UserProfileSchemaInitializer';
import { UserProfileService } from '../application/UserProfileService';
import {
  UserProfileContext,
  ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  DeleteProfileDirectionInput, DeleteProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput,
  GetProfileHistoryInput, GetProfileHistoryOutput,
  GetProfileByVersionInput, GetProfileByVersionOutput,
  ResetUserProfileInput, ResetUserProfileOutput,
  ConfigUserProfileInput, ConfigUserProfileOutput,
} from '../domain/types';

export class UserProfileAccess {
  private readonly service: UserProfileService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    infoCore: InfoCoreAccess,
    llmCore: LLMCoreAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new UserProfileSchemaInitializer(relationDb).init();
    const raw = new UserProfileService(
      relationDb, writerAgent, evolutorAgent, infoCore, llmCore, llmAccess, promptsAccess, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  /** 启动自动生成画像调度 */
  async startAutoGeneration(): Promise<void> {
    await this.initPromise;
    await (this.service as unknown as { startAutoGeneration(): void }).startAutoGeneration();
  }

  /** 停止自动生成画像调度 */
  async stopAutoGeneration(): Promise<void> {
    await this.initPromise;
    (this.service as unknown as { stopAutoGeneration(): void }).stopAutoGeneration();
  }

  async configProfileDirection(
    i: ConfigProfileDirectionInput, c: UserProfileContext, o: ConfigProfileDirectionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configProfileDirection(i, c, o);
  }

  async deleteProfileDirection(
    i: DeleteProfileDirectionInput, c: UserProfileContext, o: DeleteProfileDirectionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.deleteProfileDirection(i, c, o);
  }

  async getProfileDirection(
    i: GetProfileDirectionInput, c: UserProfileContext, o: GetProfileDirectionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getProfileDirection(i, c, o);
  }

  async getUserProfile(
    i: GetUserProfileInput, c: UserProfileContext, o: GetUserProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getUserProfile(i, c, o);
  }

  async generateProfile(
    i: GenerateProfileInput, c: UserProfileContext, o: GenerateProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.generateProfile(i, c, o);
  }

  async saveUserPreference(
    i: SaveUserPreferenceInput, c: UserProfileContext, o: SaveUserPreferenceOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.saveUserPreference(i, c, o);
  }

  async getProfileHistory(
    i: GetProfileHistoryInput, c: UserProfileContext, o: GetProfileHistoryOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getProfileHistory(i, c, o);
  }

  async getProfileByVersion(
    i: GetProfileByVersionInput, c: UserProfileContext, o: GetProfileByVersionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getProfileByVersion(i, c, o);
  }

  async resetUserProfile(
    i: ResetUserProfileInput, c: UserProfileContext, o: ResetUserProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.resetUserProfile(i, c, o);
  }

  async configUserProfile(
    i: ConfigUserProfileInput, c: UserProfileContext, o: ConfigUserProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configUserProfile(i, c, o);
  }
}
