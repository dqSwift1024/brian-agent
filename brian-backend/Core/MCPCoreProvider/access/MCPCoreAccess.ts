import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  MCPAccess,
  LLMAccess,
  PromptsAccess,
} from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { MCPCoreSchemaInitializer } from '../infrastructure/MCPCoreSchemaInitializer';
import { MCPCoreService } from '../application/MCPCoreService';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
} from '../domain/types';

export class MCPCoreAccess {
  private readonly service: MCPCoreService;

  constructor(
    relationDb: RelationDBAccess,
    mcpAccess: MCPAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    new MCPCoreSchemaInitializer(relationDb).init();
    const rawService = new MCPCoreService(
      relationDb,
      mcpAccess,
      llmAccess,
      promptsAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchMCP(input, output, context, metrics, report);
  }

  async optMCP(input: OptMcpInput, output: OptMcpOutput, context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.optMCP(input, output, context, metrics, report);
  }

  async configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configMCPCore(input, output, context, metrics, report);
  }
}
