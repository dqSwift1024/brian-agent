import type { RelationDBAccess, StreamAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type {
  AgentBuilderAccess, WriterAgentAccess,
  PlannerAgentAccess, EvolutorAgentAccess,
  SummaryAgentAccess,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import { JSONNodeSchemaInitializer } from '../infrastructure/JSONNodeSchemaInitializer';
import { JSONNodeService } from '../application/JSONNodeService';
import {
  JSONNodeContext,
  ExecJSONNodeInput, ExecJSONNodeOutput,
  GetJSONNodeTraceInput, GetJSONNodeTraceOutput,
  RegisterNodeTypeInput, RegisterNodeTypeOutput,
  ValidateJSONNodeInput, ValidateJSONNodeOutput,
  ConfigJSONNodeInput, ConfigJSONNodeOutput,
} from '../domain/types';

export class JSONNodeAccess {
  private readonly service: JSONNodeService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    writerAgent: WriterAgentAccess,
    plannerAgent: PlannerAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    llmAccess?: any,
    promptsAccess?: any,
    mqAccess?: any,
    mqCore?: any,
    logger?: Logger,
    streamAccess?: StreamAccess,
    summaryAgent?: SummaryAgentAccess,
  ) {
    this.initPromise = new JSONNodeSchemaInitializer(relationDb).init();
    const raw = new JSONNodeService(
      relationDb, infoCore, agentBuilder, writerAgent,
      plannerAgent, evolutorAgent, orchestrationExecution,
      llmAccess, promptsAccess, mqAccess, mqCore, logger, streamAccess, summaryAgent,
    );
    raw.registerBuiltinHandlers();
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  getService(): JSONNodeService {
    return this.service;
  }

  async execJSONNode(
    i: ExecJSONNodeInput, c: JSONNodeContext, o: ExecJSONNodeOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execJSONNode(i, c, o);
  }

  async getJSONNodeTrace(
    i: GetJSONNodeTraceInput, c: JSONNodeContext, o: GetJSONNodeTraceOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getJSONNodeTrace(i, c, o);
  }

  registerNodeType(
    i: RegisterNodeTypeInput, c: JSONNodeContext, o: RegisterNodeTypeOutput,
  ): boolean {
    return this.service.registerNodeType(i, c, o);
  }

  validate(
    i: ValidateJSONNodeInput, c: JSONNodeContext, o: ValidateJSONNodeOutput,
  ): boolean {
    return this.service.validate(i, c, o);
  }

  async configJSONNode(
    i: ConfigJSONNodeInput, c: JSONNodeContext, o: ConfigJSONNodeOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configJSONNode(i, c, o);
  }

  /** 确保 orchestration.eval 队列存在常驻消费 Worker（启动期调用）。 */
  async ensureEvalWorker(): Promise<void> {
    await this.initPromise;
    await this.service.ensureEvalWorker();
  }
}
