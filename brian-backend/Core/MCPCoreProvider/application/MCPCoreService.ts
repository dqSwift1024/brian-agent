import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  MCPAccess,
  LLMAccess,
  PromptsAccess,
  Condition,
  DataObject,
} from '@brian-agent/base';
import {
  Operator,
  IdGenerator,
  JsonParser,
  ValidationError,
  McpContext,
  SoMcpInput,
  SoMcpOutput,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
  PromptContext,
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  McpInstallRecord,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
} from '@brian-agent/base';
import {
  simpleSimilarity,
  shouldReuseByRegenRate,
  checkMatchCache,
  clearMatchCache,
  persistMatchBinding,
} from '../../shared';
import {
  McpCoreContext,
  McpCoreConfigRecord,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_TABLE,
  AGENT_MCP_USAGE_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  /**
   * 为 Agent 匹配 MCP（三层统一匹配/选择逻辑，第3层除外：MCP 没有匹配不可用 MCP）。
   */
  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, _context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const regenRate = config.regen_rate;
    const similarityThreshold = config.similarity_threshold ?? 0.7;

    const availableMcps = await this.getAvailableMcps();

    // ===== 第 1 层：simpleSimilarity 匹配历史/已有绑定与关联特征 =====
    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_MCP_TABLE, input.agent_id,
      regenRate, 'random', 'mcp_id',
    );
    if (cacheResult.hit && cacheResult.entries && cacheResult.entries.length > 0) {
      const boundIds = cacheResult.entries.map((e) => e.entity_id);
      output.mcp_ids = boundIds;
      output.mcp_details = availableMcps.length > 0 ? await this.getMcpDetails(boundIds) : [];
      return true;
    }

    // ===== 第 2 层：LLM 打分推荐 =====
    let rankedIds: string[] = [];
    if (availableMcps.length > 0) {
      rankedIds = await this.rankMcpsWithLLM(
        availableMcps,
        input,
        config.prompt_template_id,
      );
    }

    // ===== 第 3 层：MCP 除外，没有匹配到可用的在线 MCP 则置空不可用 =====
    await clearMatchCache(this.relationDb, AGENT_MCP_TABLE, input.agent_id);
    for (const mcpId of rankedIds) {
      await persistMatchBinding(this.relationDb, AGENT_MCP_TABLE, input.agent_id, mcpId, 'mcp_id');
    }

    output.mcp_ids = rankedIds;
    output.mcp_details = rankedIds
      .map((id) => availableMcps.find((r) => r.id === id))
      .filter((r): r is McpInstallRecord => r != null);
    return true;
  }

  async optMCP(input: OptMcpInput, output: OptMcpOutput, _context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(AGENT_MCP_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'mcp_id', operator: Operator.EQ, value: input.mcp_id },
    ]);

    if (!existing) {
      await persistMatchBinding(this.relationDb, AGENT_MCP_TABLE, input.agent_id, input.mcp_id, 'mcp_id');
    }

    const binding = await this.relationDb.selectOne(AGENT_MCP_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'mcp_id', operator: Operator.EQ, value: input.mcp_id },
    ]);
    const agentMcpId = String(binding!.id);

    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_MCP_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'agent_mcp_id', value: agentMcpId },
      { field: 'timestamp', value: now },
    ]);

    output.id = agentMcpId;
    return true;
  }

  async configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, _context: McpCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const existing = await this.getConfig();
    const now = IdGenerator.now();

    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined) {
      const updateData: Array<{ field: string; value: unknown }> = [];
      if (input.regen_rate !== undefined) {
        if (input.regen_rate < 0 || input.regen_rate > 100) {
          throw new ValidationError('regen_rate 必须在 0-100 之间');
        }
        updateData.push({ field: 'regen_rate', value: input.regen_rate });
      }
      if (input.similarity_threshold !== undefined) {
        if (input.similarity_threshold < 0 || input.similarity_threshold > 1) {
          throw new ValidationError('similarity_threshold 必须在 0.0-1.0 之间');
        }
        updateData.push({ field: 'similarity_threshold', value: input.similarity_threshold });
      }
      if (input.prompt_template_id !== undefined) {
        if (input.prompt_template_id) {
          const getPromptOutput = new GetPromptOutput();
          await this.promptsAccess.soPromptById(
            { id: input.prompt_template_id } as GetPromptInput,
            getPromptOutput, new PromptContext(),
          );
          if (!getPromptOutput.prompt) {
            throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
          }
        }
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || '' });
      }
      updateData.push({ field: 'updated', value: now });

      if (existing.id) {
        await this.relationDb.update(
          MCP_CORE_CONFIG_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      } else {
        await this.relationDb.insert(MCP_CORE_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          ...updateData,
        ]);
      }
    }

    output.config = await this.getConfig();
    return true;
  }

  private async getConfig(): Promise<McpCoreConfigRecord> {
    const rows = await this.relationDb.select(MCP_CORE_CONFIG_TABLE);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: String(r.id),
        created: Number(r.created),
        updated: Number(r.updated),
        regen_rate: Number(r.regen_rate),
        similarity_threshold: Number(r.similarity_threshold ?? 0.7),
        prompt_template_id: String(r.prompt_template_id ?? ''),
      };
    }
    return {
      id: '',
      created: 0,
      updated: 0,
      regen_rate: DEFAULT_REGENERATE_RATE,
      similarity_threshold: 0.7,
      prompt_template_id: '',
    };
  }

  private async getAvailableMcps(): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    // 仅按启用状态过滤；运行状态由 soMcp 返回的实时进程状态再过滤
    soInput.conditions = [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ];
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, soOutput, new McpContext());
    return soOutput.list.filter((r) => String(r.status) === 'running');
  }

  private async getMcpDetails(ids: string[]): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    if (ids.length > 0) {
      soInput.conditions = [
        { field: 'id', operator: Operator.IN, value: ids },
      ];
    }
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, soOutput, new McpContext());
    return soOutput.list;
  }

  private async rankMcpsWithLLM(
    mcps: McpInstallRecord[],
    input: MatchMcpInput,
    promptTemplateId: string,
  ): Promise<string[]> {
    const mcpDescriptions = mcps.map(
      (m, i) =>
        `"${m.id}": ${m.mcp_title}${m.mcp_brief ? ` - ${m.mcp_brief}` : ''}`,
    );

    let prompt: string;
    const variables = {
      agent_id: input.agent_id,
      context_id: input.context_id,
      interact_id: input.interact_id,
      available_mcps: mcpDescriptions.join('\n'),
    };
    const id = promptTemplateId || PROMPT_IDS.mcpMatch;
    try {
      const execPromptInput = new ExecPromptInput();
      execPromptInput.id = id;
      execPromptInput.variables = variables;
      const execPromptOutput = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        execPromptInput,
        execPromptOutput, new PromptContext(),
      );
      prompt = execPromptOutput.prompt;
      if (!prompt) {
        const tpl = getBuiltinTemplate(PROMPT_IDS.mcpMatch);
        prompt = tpl ? renderTemplate(tpl, variables) : '';
      }
    } catch {
      const tpl = getBuiltinTemplate(PROMPT_IDS.mcpMatch);
      prompt = tpl ? renderTemplate(tpl, variables) : '';
    }

    const execInput = new ExecLLMInput();
    execInput.id = '';
    execInput.prompt = prompt;
    const execOutput = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      execInput,
      execOutput, new LLMContext(),
    );

    return this.parseLLMRanking(execOutput.result, mcps);
  }

  private parseLLMRanking(
    result: string,
    mcps: McpInstallRecord[],
  ): string[] {
    const parsed = JsonParser.parseArray(result);
    if (parsed) {
      const rankedIds = parsed
        .filter((v): v is string => typeof v === 'string')
        .filter((id) => mcps.some((m) => m.id === id));
      return rankedIds;
    }
    return mcps.map((m) => m.id);
  }
}
