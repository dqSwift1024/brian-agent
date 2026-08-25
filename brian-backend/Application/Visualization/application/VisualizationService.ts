import type {
  RelationDBAccess,
  LLMAccess,
  SoulAccess,
  SkillAccess,
  MCPAccess,
  PromptsAccess,
  GraphDBAccess,
  Logger,
} from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  InfoType,
  GetLLMInput,
  GetLLMOutput,
  LLMContext,
  GetSoulInput,
  GetSoulOutput,
  SoulContext,
  GetSkillInput,
  GetSkillOutput,
  SkillContext,
  GetMcpInput,
  GetMcpOutput,
  McpContext,
  GetPromptInput,
  GetPromptOutput,
  PromptContext,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { InfoCoreContext, LastNInfoInput, LastNInfoOutput, GraphInfoInput, GraphInfoOutput, SoCitationEdgesInput, SoCitationEdgesOutput } from '@brian-agent/core';
import type {
  AgentExecutionAccess,
  AgentLibraryAccess,
  AgentContextAccess,
  EvolutorAgentAccess,
  PlannerAgentAccess,
} from '@brian-agent/agent';
import {
  AgentExecutionContext,
  GetTraceInput,
  GetTraceOutput,
  AgentLibraryContext,
  GetAgentInput,
  GetAgentOutput,
  AgentContextContext,
  GetContextDetailInput,
  GetContextDetailOutput,
  EvolutorAgentContext,
  GetEvaluationInput,
  GetEvaluationOutput,
  PlannerAgentContext,
  GetPlanInput,
  GetPlanOutput,
} from '@brian-agent/agent';
import type { OrchestrationVisualizationAccess } from '@brian-agent/orchestration';
import {
  OrchestrationVisualizationContext,
  VisualizeAgentDAGInput,
  VisualizeAgentDAGOutput,
  VisualizeWorkFlowInput,
  VisualizeWorkFlowOutput,
} from '@brian-agent/orchestration';
import {
  VisualizationContext,
  GetVisualizedMessagesInput,
  GetVisualizedMessagesOutput,
  GetVisualizedMessageGraphInput,
  GetVisualizedMessageGraphOutput,
  GetVisualizedAgentDAGInput,
  GetVisualizedAgentDAGOutput,
  GetVisualizedWorkFlowInput,
  GetVisualizedWorkFlowOutput,
  GetAgentTraceInput,
  GetAgentTraceOutput,
  GetVisualizedMessageDAGInput,
  GetVisualizedMessageDAGOutput,
  GetResourceInput,
  GetResourceOutput,
  ConfigVisualizationInput,
  ConfigVisualizationOutput,
  VISUALIZATION_CONFIG_TABLE,
  INFO_RAW_TABLE,
  DEFAULT_MAX_NODES_PER_GRAPH,
  DEFAULT_MESSAGE_SUMMARY_LENGTH,
  DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
} from '../domain/types';

interface VisualizationConfigRow {
  id: string;
  max_nodes_per_graph: number;
  default_message_summary_length: number;
  resolve_content_by_default: number;
}

interface CitationData {
  citingInfoIds: string[];
  citedInfoIds: string[];
  citingCount: number;
  citedCount: number;
}

export class VisualizationService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly orchestrationVisualization: OrchestrationVisualizationAccess,
    private readonly agentExecution: AgentExecutionAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentContext: AgentContextAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly plannerAgent: PlannerAgentAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmAccess: LLMAccess,
    private readonly soulAccess: SoulAccess,
    private readonly skillAccess: SkillAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly logger?: Logger,
  ) {}

  async getVisualizedMessages(
    input: GetVisualizedMessagesInput,
    _ctx: VisualizationContext,
    output: GetVisualizedMessagesOutput,
  ): Promise<boolean> {
    const lastN = input.lastN ?? 50;
    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;
    const includeCitingInfo = input.include_citing_info ?? true;
    const includeContextSource = input.include_context_source ?? false;

    const lastNOut = new LastNInfoOutput();
    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      lastN,
    });

    try {
      await this.infoCore.lastNInfo(lastNInput, new InfoCoreContext(), lastNOut);
    } catch (err) {
      this.logWarn('lastNInfo failed', err);
      return true;
    }

    const allMessages = lastNOut.list.map((row) => ({
      id: String(row.id ?? ''),
      created: Number(row.created ?? 0),
      updated: Number(row.updated ?? 0),
      session_id: String(row.session_id ?? ''),
      work_id: String(row.work_id ?? ''),
      interact_id: String(row.interact_id ?? ''),
      info_id: String(row.info_id ?? ''),
      info_type: String(row.info_type ?? ''),
      info_creator_id: String(row.info_creator_id ?? ''),
      info_creator_role: String(row.info_creator_role ?? ''),
      info: String(row.info ?? ''),
      info_length: Number(row.info_length ?? 0),
      pin: Number(row.pin ?? 0),
      handle_result_type: String(row.handle_result_type ?? ''),
    }));

    const total = allMessages.length;
    const startIdx = (pageCurrent - 1) * pageSize;
    const pagedMessages = allMessages.slice(startIdx, startIdx + pageSize);

    const infoIds = pagedMessages.map((m) => m.info_id).filter(Boolean);
    const citationMap = await this.buildCitationMap(infoIds, includeCitingInfo);

    const enhancedMessages: Array<Record<string, unknown>> = [];

    for (const msg of pagedMessages) {
      const enhanced: Record<string, unknown> = { ...msg };
      const infoId = msg.info_id;

      if (includeCitingInfo && infoId) {
        const citeData = citationMap.get(infoId);
        if (citeData) {
          enhanced.citing_info_ids = citeData.citingInfoIds;
          enhanced.cited_info_ids = citeData.citedInfoIds;
          enhanced.citing_count = citeData.citingCount;
          enhanced.cited_count = citeData.citedCount;
        } else {
          enhanced.citing_info_ids = [];
          enhanced.cited_info_ids = [];
          enhanced.citing_count = 0;
          enhanced.cited_count = 0;
        }
      }

      if (includeContextSource && infoId && msg.info_creator_role === 'AGENT') {
        enhanced.context_source_info = await this.resolveContextSourceInfo(infoId);
      }

      if (infoId) {
        const parents = await this.buildParentInfoIds(infoId);
        enhanced.parent_info_ids = parents;
      }

      enhancedMessages.push(enhanced);
    }

    output.messages = enhancedMessages;
    output.total = total;
    return true;
  }

  async getVisualizedMessageGraph(
    input: GetVisualizedMessageGraphInput,
    _ctx: VisualizationContext,
    output: GetVisualizedMessageGraphOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const maxNodes = input.max_nodes ?? config.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH;

    const graphOut = new GraphInfoOutput();
    try {
      await this.infoCore.graphInfo(
        Object.assign(new GraphInfoInput(), { session_id: input.session_id }),
        new InfoCoreContext(),
        graphOut,
      );
    } catch (err) {
      this.logWarn('graphInfo failed', err);
      output.session_id = input.session_id;
      output.graph = { nodes: [], edges: [] };
      output.metadata = { error: 'graphInfo failed' };
      return true;
    }

    const rawGraph = graphOut.graph;
    const rawNodes = (rawGraph.nodes ?? []) as Array<{ id: string; label: string; info_id: string; info_type?: string; info_creator_role?: string; handle_result_type?: string }>;
    const rawEdges = (rawGraph.edges ?? []) as Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string; edge_type?: string }>;

    // 截断节点（graphInfo 已统一以 info_id 作为节点 id，与边 from/to 同命名空间）
    const limitedNodes = rawNodes.slice(0, maxNodes);
    const limitedNodeIds = new Set(limitedNodes.map((n) => n.id));

    const infoIds = limitedNodes.map((n) => n.info_id).filter(Boolean);
    const summaryMap = await this.buildSummaryMap(infoIds);
    const globalCitationMap = await this.buildCitationMap([...new Set(infoIds)], true);
    const summaryLength = config.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH;

    const enhancedNodes = limitedNodes.map((node) => {
      const infoId = node.info_id;
      const summary = summaryMap.get(infoId);
      const citeData = globalCitationMap.get(infoId);
      return {
        id: node.id,
        label: node.label ?? '',
        info_id: infoId ?? '',
        info_type: node.info_type ?? '',
        info_creator_role: node.info_creator_role ?? '',
        handle_result_type: node.handle_result_type ?? '',
        info_summary: this.truncate(summary ?? node.label ?? infoId ?? '', summaryLength),
        citing_count: citeData?.citingCount ?? 0,
        cited_count: citeData?.citedCount ?? 0,
      };
    });

    // 过滤边：只保留两端节点均未被截断的边
    const enhancedEdges = rawEdges
      .filter((edge) => limitedNodeIds.has(edge.from) && limitedNodeIds.has(edge.to))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        citing_info_id: edge.citing_info_id ?? '',
        cited_info_id: edge.cited_info_id ?? '',
        edge_type: edge.edge_type ?? 'CITATION',
      }));

    const totalNodes = rawNodes.length;
    const totalEdges = rawEdges.length;

    output.session_id = input.session_id;
    output.graph = {
      nodes: enhancedNodes,
      edges: enhancedEdges,
    };
    output.metadata = {
      total_nodes: totalNodes,
      total_edges: totalEdges,
      displayed_nodes: enhancedNodes.length,
      displayed_edges: enhancedEdges.length,
      max_nodes_limit: maxNodes,
      truncated: totalNodes > maxNodes,
    };
    return true;
  }

  async getVisualizedAgentDAG(
    input: GetVisualizedAgentDAGInput,
    _ctx: VisualizationContext,
    output: GetVisualizedAgentDAGOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const resolveContent = input.resolve_content ?? (config.resolve_content_by_default === 1);

    const dagOut = new VisualizeAgentDAGOutput();
    try {
      await this.orchestrationVisualization.visualizeAgentDAG(
        Object.assign(new VisualizeAgentDAGInput(), { work_id: input.work_id }),
        new OrchestrationVisualizationContext(),
        dagOut,
      );
    } catch (err) {
      this.logWarn('visualizeAgentDAG failed', err);
      output.dag = { error: 'visualizeAgentDAG failed', work_id: input.work_id };
      return true;
    }

    const dagStructure = dagOut.agent_dag_structure;
    if (!resolveContent) {
      output.dag = dagStructure as Record<string, unknown>;
      return true;
    }

    const enriched = this.deepClone(dagStructure) as Record<string, unknown>;
    await this.enrichAgentDAG(enriched, config);

    output.dag = enriched;
    return true;
  }

  async getVisualizedWorkFlow(
    input: GetVisualizedWorkFlowInput,
    _ctx: VisualizationContext,
    output: GetVisualizedWorkFlowOutput,
  ): Promise<boolean> {
    const wfOut = new VisualizeWorkFlowOutput();
    try {
      await this.orchestrationVisualization.visualizeWorkFlow(
        Object.assign(new VisualizeWorkFlowInput(), { work_id: input.work_id }),
        new OrchestrationVisualizationContext(),
        wfOut,
      );
    } catch (err) {
      this.logWarn('visualizeWorkFlow failed', err);
      output.timeline = { error: 'visualizeWorkFlow failed', work_id: input.work_id };
      return true;
    }

    const rawTimeline = wfOut.workflow_timeline as Record<string, unknown>;
    const enriched = this.deepClone(rawTimeline) as Record<string, unknown>;
    const phases = (enriched.phases ?? enriched.timeline ?? []) as Array<Record<string, unknown>>;

    for (const phase of phases) {
      const phaseName = String(phase.phase ?? phase.name ?? '').toUpperCase();

      try {
        if (phaseName === 'PLANNING' || phaseName === 'PLAN') {
          await this.enrichPlanningPhase(phase);
        } else if (phaseName === 'BUILD_AGENT_DAG' || phaseName === 'BUILD') {
          await this.enrichBuildPhase(phase);
        } else if (phaseName === 'EXECUTING' || phaseName === 'EXECUTE') {
          await this.enrichExecutingPhase(phase);
        } else if (phaseName === 'WRITING' || phaseName === 'WRITE') {
          await this.enrichWritingPhase(phase);
        } else if (phaseName === 'EVALUATING' || phaseName === 'EVALUATE') {
          await this.enrichEvaluatingPhase(phase);
        }
      } catch (err) {
        this.logWarn(`enrich ${phaseName} phase failed`, err);
      }
    }

    output.timeline = enriched;
    return true;
  }

  async getAgentTrace(
    input: GetAgentTraceInput,
    _ctx: VisualizationContext,
    output: GetAgentTraceOutput,
  ): Promise<boolean> {
    const traceId = input.trace_id ?? '';
    const traceOut = new GetTraceOutput();

    if (traceId) {
      try {
        await this.agentExecution.getTrace(
          Object.assign(new GetTraceInput(), { trace_id: traceId }),
          new AgentExecutionContext(),
          traceOut,
        );
      } catch (err) {
        this.logWarn('getTrace by trace_id failed', err);
        output.trace = { error: 'getTrace failed', trace_id: traceId, agent_id: input.agent_id };
        return true;
      }
    }

    if (!traceOut.trace && input.agent_id) {
      try {
        await this.agentExecution.getTrace(
          Object.assign(new GetTraceInput(), { trace_id: input.agent_id }),
          Object.assign(new AgentExecutionContext(), { trace_id: input.agent_id }),
          traceOut,
        );
      } catch (err) {
        this.logWarn('getTrace by agent_id failed', err);
      }
    }

    if (!traceOut.trace) {
      output.trace = { error: 'no trace found', agent_id: input.agent_id, trace_id: traceId };
      return true;
    }

    const rawTrace = traceOut.trace;
    const steps: Array<Record<string, unknown>> = [];

    for (const iteration of (rawTrace.iterations ?? []) as unknown as Array<Record<string, unknown>>) {
      const iterIdx = iteration.iteration_index ?? 0;

      if (iteration.think) {
        steps.push({
          phase: 'THINK',
          iteration: iterIdx,
          content: (iteration.think as Record<string, unknown>)?.reasoning ?? '',
          token_usage: (iteration.think as Record<string, unknown>)?.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }

      if (iteration.act) {
        const actData = iteration.act as Record<string, unknown>;
        const toolCalls = Array.isArray(actData.tool_calls) ? actData.tool_calls as Array<Record<string, unknown>> : [];
        const resolvedCalls = await this.resolveToolCalls(toolCalls);

        steps.push({
          phase: 'ACT',
          iteration: iterIdx,
          tool_calls: resolvedCalls,
          result: actData.result ?? '',
          token_usage: actData.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }

      if (iteration.reflect) {
        steps.push({
          phase: 'REFLECT',
          iteration: iterIdx,
          reflection: (iteration.reflect as Record<string, unknown>)?.reflection ?? '',
          should_continue: (iteration.reflect as Record<string, unknown>)?.should_continue ?? false,
          token_usage: (iteration.reflect as Record<string, unknown>)?.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }
    }

    output.trace = {
      trace_id: rawTrace.trace_id,
      agent_id: rawTrace.agent_id,
      start_time: rawTrace.start_time,
      end_time: rawTrace.end_time,
      total_elapsed_ms: rawTrace.total_elapsed_ms,
      total_token_usage: rawTrace.total_token_usage,
      iteration_count: (rawTrace.iterations as unknown[])?.length ?? 0,
      steps,
      final_answer: this.extractFinalAnswer(rawTrace),
    };
    return true;
  }

  async getVisualizedMessageDAG(
    input: GetVisualizedMessageDAGInput,
    _ctx: VisualizationContext,
    output: GetVisualizedMessageDAGOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const maxNodes = input.max_nodes ?? config.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH;
    const includeQA = input.include_question_answer_edges ?? true;
    const includeCitation = input.include_citation_edges ?? true;

    let rawRows: Array<Record<string, unknown>> = [];
    try {
      rawRows = await this.relationDb.select(INFO_RAW_TABLE, {
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ],
        order_by: [{ field: 'created', direction: 'DESC' as const }],
        fields: ['id', 'created', 'session_id', 'work_id', 'interact_id', 'info_id', 'info_type', 'info_creator_id', 'info_creator_role', 'info', 'info_length', 'pin', 'trace_id', 'handle_result_type'],
      });
    } catch (err) {
      this.logWarn('query info_raw failed', err);
      output.session_id = input.session_id;
      output.graph = { nodes: [], edges: [] };
      output.metadata = { error: 'query info_raw failed' };
      return true;
    }

    if (input.work_id) {
      rawRows = rawRows.filter((r) => String(r.work_id ?? '') === input.work_id);
    }

    const summaryLength = config.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH;

    const nodes: Array<Record<string, unknown>> = [];
    const nodeSet = new Set<string>();
    const nodeRows: Array<Record<string, unknown>> = [];

    for (const row of rawRows) {
      const infoId = String(row.info_id ?? '');
      if (!infoId || nodeSet.has(infoId)) continue;
      nodeSet.add(infoId);
      nodeRows.push(row);
      if (nodeRows.length >= maxNodes) break;
    }

    const infoIds = nodeRows.map((r) => String(r.info_id ?? '')).filter(Boolean);
    const summaryMap = await this.buildSummaryMap(infoIds);

    for (const row of nodeRows) {
      const infoId = String(row.info_id ?? '');
      const storedSummary = summaryMap.get(infoId);

      nodes.push({
        id: infoId,
        label: infoId.slice(0, 16),
        info_id: infoId,
        work_id: String(row.work_id ?? ''),
        interact_id: String(row.interact_id ?? ''),
        info_type: String(row.info_type ?? ''),
        info_creator_role: String(row.info_creator_role ?? ''),
        trace_id: String(row.trace_id ?? ''),
        handle_result_type: String(row.handle_result_type ?? ''),
        // ===== 原始代码（保留作为参考） =====
        // info_summary: this.truncate(String(row.info ?? ''), summaryLength),
        // ===== 修改后的代码：使用 info_summary 表的完整摘要 =====
        info_summary: storedSummary ?? '',
        info: String(row.info ?? ''),
        info_length: Number(row.info_length ?? 0),
        created: Number(row.created ?? 0),
        pin: Number(row.pin ?? 0) === 1,
      });
    }

    // 补充引用/被引用关系（计数与 info_id 列表）
    {
      const infoIds = nodes.map((n) => String(n.info_id ?? '')).filter(Boolean);
      const citationMap = await this.buildCitationMap(infoIds, true);
      for (const node of nodes) {
        const citeData = citationMap.get(String(node.info_id ?? ''));
        node.citing_count = citeData?.citingCount ?? 0;
        node.cited_count = citeData?.citedCount ?? 0;
        node.citing_info_ids = citeData?.citingInfoIds ?? [];
        node.cited_info_ids = citeData?.citedInfoIds ?? [];
      }
    }

    const edges: Array<Record<string, unknown>> = [];
    const directionalEdgeSet = new Set<string>();

    if (includeQA) {
      const workGroups = new Map<string, Array<Record<string, unknown>>>();
      for (const row of rawRows) {
        const workId = String(row.work_id ?? '');
        if (!workId) continue;
        if (!workGroups.has(workId)) workGroups.set(workId, []);
        workGroups.get(workId)!.push(row);
      }

      for (const [, group] of workGroups) {
        group.sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0));
        const requests: Array<Record<string, unknown>> = [];
        const responses: Array<Record<string, unknown>> = [];

        for (const row of group) {
          const type = String(row.info_type ?? '').toUpperCase();
          if (type === InfoType.REQUEST) {
            requests.push(row);
          } else {
            responses.push(row);
          }
        }

        for (const req of requests) {
          for (const resp of responses) {
            const reqId = String(req.info_id ?? '');
            const respId = String(resp.info_id ?? '');
            if (!reqId || !respId || reqId === respId) continue;
            const dirKey = `${reqId}->${respId}`;
            if (directionalEdgeSet.has(dirKey)) continue;
            directionalEdgeSet.add(dirKey);
            edges.push({
              id: `qa_${dirKey}`,
              from: reqId,
              to: respId,
              edge_type: 'QUESTION_ANSWER',
              work_id: String(req.work_id ?? ''),
            });
          }
        }
      }
    }

    if (includeCitation) {
      const allInfoIds = nodes.map((n) => String(n.info_id));
      const allInfoIdSet = new Set(allInfoIds);
      try {
        const citeOut = new SoCitationEdgesOutput();
        await this.infoCore.soCitationEdges(new SoCitationEdgesInput(), new InfoCoreContext(), citeOut);
        for (const e of citeOut.edges) {
          if (!allInfoIdSet.has(e.citing_info_id)) continue;
          const fromId = e.cited_info_id;
          const toId = e.citing_info_id;
          if (!fromId || !toId || fromId === toId) continue;
          const dirKey = `${fromId}->${toId}`;
          if (directionalEdgeSet.has(dirKey)) continue; // 两个消息框之间同一方向不重复连线
          directionalEdgeSet.add(dirKey);
          edges.push({
            id: `cite_${fromId}_${toId}`,
            from: fromId,
            to: toId,
            edge_type: 'CITATION',
          });
        }
      } catch (err) {
        this.logWarn('query GraphDB citations failed', err);
      }
    }

    // ===== 追问关系（ChatMap）=====
    // 未通过复选框选择上下文（即该 REQUEST 没有任何引用边把它作为引用方）的用户提问，
    // 视为对上一轮回答的追问：建立「上一回答 → 本次提问」的 CITATION 边，
    // 使 ChatMap 中第二次提问连线指向（引用）第一次回答。
    if (includeCitation) {
      // 已被某条 CITATION 边作为引用方（to = citing_info_id）的节点集合
      const citingTargetIds = new Set<string>();
      for (const e of edges) {
        if (e.edge_type === 'CITATION') citingTargetIds.add(String(e.to));
      }
      // 按时间升序排列 REQUEST / RESPONSE 节点
      const ordered = nodes
        .filter((n) => {
          const t = String(n.info_type ?? '').toUpperCase();
          return t === InfoType.REQUEST || t === InfoType.RESPONSE;
        })
        .sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0));

      let lastResponseId: string | null = null;
      for (const n of ordered) {
        const infoId = String(n.info_id ?? '');
        const type = String(n.info_type ?? '').toUpperCase();
        if (type === InfoType.RESPONSE) {
          lastResponseId = infoId;
        } else if (type === InfoType.REQUEST) {
          // 提问未被引用（未复选上下文）且存在上一回答时，补一条追问边
          if (lastResponseId && !citingTargetIds.has(infoId)) {
            const dirKey = `${lastResponseId}->${infoId}`;
            if (!directionalEdgeSet.has(dirKey) && lastResponseId !== infoId) {
              directionalEdgeSet.add(dirKey);
              edges.push({
                id: `followup_${dirKey}`,
                from: lastResponseId,
                to: infoId,
                edge_type: 'CITATION',
              });
            }
          }
        }
      }
    }

    output.session_id = input.session_id;
    output.graph = { nodes, edges };
    output.metadata = {
      total_nodes: rawRows.length,
      displayed_nodes: nodes.length,
      total_edges: edges.length,
      max_nodes_limit: maxNodes,
      truncated: rawRows.length > maxNodes,
      include_question_answer: includeQA,
      include_citation: includeCitation,
    };
    return true;
  }

  async getResource(
    input: GetResourceInput,
    _ctx: VisualizationContext,
    output: GetResourceOutput,
  ): Promise<boolean> {
    const { resource_type, resource_id } = input;

    try {
      switch (resource_type.toLowerCase()) {
        case 'agent': {
          const out = new GetAgentOutput();
          await this.agentLibrary.getAgent(
            Object.assign(new GetAgentInput(), { agent_id: resource_id }),
            new AgentLibraryContext(),
            out,
          );
          output.resource = out.agents.length > 0 ? (out.agents[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'llm': {
          const out = new GetLLMOutput();
          await this.llmAccess.getLLM(
            Object.assign(new GetLLMInput(), { id: resource_id }),
            new LLMContext(),
            out,
          );
          output.resource = (out.llm ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'soul': {
          const out = new GetSoulOutput();
          await this.soulAccess.getSoul(
            Object.assign(new GetSoulInput(), { id: resource_id }),
            new SoulContext(),
            out,
          );
          output.resource = (out.soul ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'skill': {
          const out = new GetSkillOutput();
          await this.skillAccess.getSkill(
            Object.assign(new GetSkillInput(), { id: resource_id }),
            new SkillContext(),
            out,
          );
          output.resource = (out.skill ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'mcp': {
          const out = new GetMcpOutput();
          await this.mcpAccess.getMcp(
            Object.assign(new GetMcpInput(), { id: resource_id }),
            new McpContext(),
            out,
          );
          output.resource = (out.mcp ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'prompt': {
          const out = new GetPromptOutput();
          await this.promptsAccess.getPrompt(
            Object.assign(new GetPromptInput(), { id: resource_id }),
            new PromptContext(),
            out,
          );
          output.resource = (out.prompt ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'trace': {
          const out = new GetTraceOutput();
          await this.agentExecution.getTrace(
            Object.assign(new GetTraceInput(), { trace_id: resource_id }),
            new AgentExecutionContext(),
            out,
          );
          output.resource = (out.trace ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'info': {
          const out = new LastNInfoOutput();
          await this.infoCore.lastNInfo(
            Object.assign(new LastNInfoInput(), { info_id: resource_id, lastN: 1 }),
            new InfoCoreContext(),
            out,
          );
          output.resource = out.list.length > 0 ? (out.list[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'eval': {
          const out = new GetEvaluationOutput();
          await this.evolutorAgent.getEvaluation(
            Object.assign(new GetEvaluationInput(), { conditions: [{ field: 'eval_id', operator: Operator.EQ, value: resource_id }] }),
            new EvolutorAgentContext(),
            out,
          );
          output.resource = out.evaluations.length > 0 ? (out.evaluations[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'plan': {
          const out = new GetPlanOutput();
          await this.plannerAgent.getPlan(
            Object.assign(new GetPlanInput(), { plan_id: resource_id }),
            new PlannerAgentContext(),
            out,
          );
          output.resource = out.plans.length > 0 ? (out.plans[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'context': {
          const out = new GetContextDetailOutput();
          await this.agentContext.getContextDetail(
            Object.assign(new GetContextDetailInput(), { work_id: resource_id }),
            new AgentContextContext(),
            out,
          );
          output.resource = out as unknown as Record<string, unknown>;
          break;
        }
        default: {
          output.resource = { error: `unknown resource_type: ${resource_type}` };
        }
      }
    } catch (err) {
      this.logWarn(`getResource ${resource_type}/${resource_id} failed`, err);
      output.resource = { error: `getResource failed: ${resource_type}/${resource_id}` };
    }

    return true;
  }

  async configVisualization(
    input: ConfigVisualizationInput,
    _ctx: VisualizationContext,
    output: ConfigVisualizationOutput,
  ): Promise<boolean> {
    let config = await this.getConfigFull();

    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(VISUALIZATION_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'max_nodes_per_graph', value: DEFAULT_MAX_NODES_PER_GRAPH },
        { field: 'default_message_summary_length', value: DEFAULT_MESSAGE_SUMMARY_LENGTH },
        { field: 'resolve_content_by_default', value: DEFAULT_RESOLVE_CONTENT_BY_DEFAULT },
      ]);
      config = await this.getConfigFull();
    }

    if (!config) {
      output.config = { error: 'config init failed' };
      return true;
    }

    const data: Array<{ field: string; value: unknown }> = [];
    if (input.max_nodes_per_graph !== undefined) {
      data.push({ field: 'max_nodes_per_graph', value: input.max_nodes_per_graph });
    }
    if (input.default_message_summary_length !== undefined) {
      data.push({ field: 'default_message_summary_length', value: input.default_message_summary_length });
    }
    if (input.resolve_content_by_default !== undefined) {
      data.push({ field: 'resolve_content_by_default', value: input.resolve_content_by_default ? 1 : 0 });
    }

    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(VISUALIZATION_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: config.id },
      ]);
    }

    const latest = await this.getConfigFull();
    output.config = {
      max_nodes_per_graph: latest?.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH,
      default_message_summary_length: latest?.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH,
      resolve_content_by_default: latest?.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
    };
    return true;
  }

  private async getConfig(): Promise<VisualizationConfigRow> {
    const full = await this.getConfigFull();
    return {
      id: full?.id ?? '',
      max_nodes_per_graph: full?.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH,
      default_message_summary_length: full?.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH,
      resolve_content_by_default: full?.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
    };
  }

  private async getConfigFull(): Promise<VisualizationConfigRow | null> {
    const rows = await this.relationDb.select(VISUALIZATION_CONFIG_TABLE, {});
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: String(row.id ?? ''),
      max_nodes_per_graph: Number(row.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH),
      default_message_summary_length: Number(row.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH),
      resolve_content_by_default: Number(row.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT),
    };
  }

  private async buildCitationMap(infoIds: string[], includeCiting: boolean): Promise<Map<string, CitationData>> {
    const map = new Map<string, CitationData>();
    if (!includeCiting || infoIds.length === 0) return map;

    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(new SoCitationEdgesInput(), new InfoCoreContext(), citeOut);
      const citedRows = citeOut.edges;

      for (const id of infoIds) {
        const citingInfoIds: string[] = [];
        const citedInfoIds: string[] = [];
        let citingCount = 0;

        for (const row of citedRows) {
          if (row.citing_info_id === id) {
            citedInfoIds.push(row.cited_info_id);
          }
          if (row.cited_info_id === id) {
            citingInfoIds.push(row.citing_info_id);
            citingCount++;
          }
        }

        map.set(id, {
          citingInfoIds,
          citedInfoIds: [...new Set(citedInfoIds)],
          citingCount,
          citedCount: new Set(citedInfoIds).size,
        });
      }
    } catch (err) {
      this.logWarn('buildCitationMap failed', err);
    }

    return map;
  }

  private async buildSummaryMap(infoIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (infoIds.length === 0) return map;

    try {
      for (const infoId of infoIds) {
        const rows = await this.relationDb.select('info_summary', {
          conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
          fields: ['info_id', 'summary'],
        });
        for (const row of rows) {
          map.set(String(row.info_id ?? ''), String(row.summary ?? ''));
        }
      }
    } catch (err) {
      this.logWarn('buildSummaryMap failed', err);
    }

    return map;
  }

  private async buildParentInfoIds(infoId: string): Promise<string[]> {
    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(Object.assign(new SoCitationEdgesInput(), { citing_info_id: infoId }), new InfoCoreContext(), citeOut);
      return [...new Set(citeOut.edges.map((e) => e.cited_info_id).filter(Boolean))];
    } catch {
      return [];
    }
  }

  private async resolveContextSourceInfo(infoId: string): Promise<Record<string, unknown>> {
    try {
      const rows = await this.relationDb.select('info_context_config', {
        fields: ['id', 'base_timeline_count', 'base_tag_relative_count', 'base_similarity_count', 'base_keyword_count', 'base_random_count', 'total'],
      });
      return { config: rows[0] ?? {}, info_id: infoId };
    } catch {
      return { info_id: infoId };
    }
  }

  private async enrichAgentDAG(dag: Record<string, unknown>, config: VisualizationConfigRow): Promise<void> {
    const graph = (dag.graph ?? {}) as Record<string, unknown>;
    const nodes = (graph.nodes ?? dag.nodes ?? dag.agents ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      await this.enrichAgentDAGNode(node, config);
    }
  }

  private async enrichAgentDAGNode(node: Record<string, unknown>, _config: VisualizationConfigRow): Promise<void> {
    const componentRefs = (node.component_refs ?? {}) as Record<string, unknown>;
    const resultRefs = (node.result_refs ?? {}) as Record<string, unknown>;
    const agentId = String(node.agent_id ?? '');

    if (agentId) {
      if (!node.agent_name) node.agent_name = String(componentRefs.agent_name ?? '');
      if (!node.agent_type) node.agent_type = String(componentRefs.agent_type ?? '');
    }

    const llmId = String(componentRefs.llm_id ?? '');
    if (llmId) {
      try {
        const out = new GetLLMOutput();
        await this.llmAccess.getLLM(
          Object.assign(new GetLLMInput(), { id: llmId }),
          new LLMContext(),
          out,
        );
        if (out.llm) {
          node.llm_detail = out.llm as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }

    const soulId = String(componentRefs.soul_id ?? '');
    if (soulId) {
      try {
        const out = new GetSoulOutput();
        await this.soulAccess.getSoul(
          Object.assign(new GetSoulInput(), { id: soulId }),
          new SoulContext(),
          out,
        );
        if (out.soul) {
          node.soul_detail = out.soul as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }

    const skillIds = (componentRefs.skill_ids ?? []) as string[];
    if (skillIds.length > 0) {
      node.skill_details = [];
      for (const id of skillIds) {
        try { (node.skill_details as Record<string, unknown>[]).push(await this.resolveSkill(id)); } catch { /* ignore */ }
      }
    }

    const mcpIds = (componentRefs.mcp_ids ?? []) as string[];
    if (mcpIds.length > 0) {
      node.mcp_details = [];
      for (const id of mcpIds) {
        try { (node.mcp_details as Record<string, unknown>[]).push(await this.resolveMcp(id)); } catch { /* ignore */ }
      }
    }

    const promptTemplateIds = (componentRefs.prompt_template_ids ?? {}) as Record<string, unknown>;
    if (promptTemplateIds && typeof promptTemplateIds === 'object') {
      const promptDetails: Record<string, unknown> = {};
      for (const [k, id] of Object.entries(promptTemplateIds)) {
        if (typeof id === 'string' && id) {
          try { promptDetails[k] = await this.resolvePrompt(id); } catch { promptDetails[k] = { id }; }
        }
      }
      if (Object.keys(promptDetails).length > 0) node.prompt_details = promptDetails;
    }

    const evalId = String(resultRefs.eval_id ?? '');
    if (evalId) {
      try {
        const out = new GetEvaluationOutput();
        await this.evolutorAgent.getEvaluation(
          Object.assign(new GetEvaluationInput(), {
            conditions: [{ field: 'eval_id', operator: Operator.EQ, value: evalId }],
          }),
          new EvolutorAgentContext(),
          out,
        );
        if (out.evaluations.length > 0) {
          node.eval_detail = out.evaluations[0] as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }
  }

  private async enrichComponentRefs(refs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const enriched: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(refs)) {
      if (typeof value === 'string') {
        enriched[key] = await this.resolveSingleRef(key, value);
      } else if (Array.isArray(value)) {
        const resolved: unknown[] = [];
        for (const item of value) {
          if (typeof item === 'string') {
            resolved.push(await this.resolveSingleRef(key, item));
          } else {
            resolved.push(item);
          }
        }
        enriched[key] = resolved;
      } else {
        enriched[key] = value;
      }
    }

    return enriched;
  }

  private async resolveSingleRef(key: string, id: string): Promise<unknown> {
    const k = key.toLowerCase();
    try {
      if (k.includes('agent')) {
        const out = new GetAgentOutput();
        await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), out);
        return out.agents[0] ?? { agent_id: id };
      }
      if (k.includes('llm')) return await this.resolveLLM(id);
      if (k.includes('soul')) return await this.resolveSoul(id);
      if (k.includes('skill')) return await this.resolveSkill(id);
      if (k.includes('mcp')) return await this.resolveMcp(id);
      if (k.includes('prompt')) return await this.resolvePrompt(id);
      if (k.includes('info') || k.includes('context')) {
        const out = new LastNInfoOutput();
        await this.infoCore.lastNInfo(Object.assign(new LastNInfoInput(), { info_id: id, lastN: 1 }), new InfoCoreContext(), out);
        return out.list[0] ?? { info_id: id };
      }
    } catch {
    }
    return { id };
  }

  private async resolveLLM(id: string): Promise<Record<string, unknown>> {
    const out = new GetLLMOutput();
    await this.llmAccess.getLLM(Object.assign(new GetLLMInput(), { id }), new LLMContext(), out);
    return (out.llm ?? { id }) as unknown as Record<string, unknown>;
  }

  private async resolveSoul(id: string): Promise<Record<string, unknown>> {
    const out = new GetSoulOutput();
    await this.soulAccess.getSoul(Object.assign(new GetSoulInput(), { id }), new SoulContext(), out);
    return (out.soul ?? { id }) as unknown as Record<string, unknown>;
  }

  private async resolveSkill(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetSkillOutput();
      await this.skillAccess.getSkill(Object.assign(new GetSkillInput(), { id }), new SkillContext(), out);
      return (out.skill ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async resolveMcp(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetMcpOutput();
      await this.mcpAccess.getMcp(Object.assign(new GetMcpInput(), { id }), new McpContext(), out);
      return (out.mcp ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async resolvePrompt(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetPromptOutput();
      await this.promptsAccess.getPrompt(Object.assign(new GetPromptInput(), { id }), new PromptContext(), out);
      return (out.prompt ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async enrichIdArrayField(
    node: Record<string, unknown>,
    fieldName: string,
    resolver: (id: string) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    const ids = node[fieldName];
    if (!Array.isArray(ids) || ids.length === 0) return;

    const resolved: Record<string, unknown>[] = [];
    for (const id of ids) {
      if (typeof id === 'string') {
        resolved.push(await resolver(id));
      }
    }
    node[`${fieldName}_resolved`] = resolved;
  }

  private async enrichPlanningPhase(phase: Record<string, unknown>): Promise<void> {
    const planId = String(phase.plan_id ?? '');
    if (!planId) return;

    try {
      const out = new GetPlanOutput();
      await this.plannerAgent.getPlan(
        Object.assign(new GetPlanInput(), { plan_id: planId }),
        new PlannerAgentContext(),
        out,
      );
      if (out.plans.length > 0) {
        phase.plan_detail = out.plans[0] as unknown as Record<string, unknown>;
      }
    } catch {
    }
  }

  private async enrichBuildPhase(phase: Record<string, unknown>): Promise<void> {
    const agentIds = Array.isArray(phase.agent_ids) ? phase.agent_ids as string[] : [];
    if (agentIds.length === 0) return;

    const resolved: Record<string, unknown>[] = [];
    for (const id of agentIds) {
      try {
        const out = new GetAgentOutput();
        await this.agentLibrary.getAgent(
          Object.assign(new GetAgentInput(), { agent_id: id }),
          new AgentLibraryContext(),
          out,
        );
        resolved.push(out.agents[0] ? (out.agents[0] as unknown as Record<string, unknown>) : { agent_id: id });
      } catch {
        resolved.push({ agent_id: id });
      }
    }
    phase.agent_details = resolved;
  }

  private async enrichExecutingPhase(phase: Record<string, unknown>): Promise<void> {
    const execIds = Array.isArray(phase.agent_execution_ids) ? phase.agent_execution_ids as string[] : [];
    if (execIds.length === 0) return;

    const summaries: Record<string, unknown>[] = [];
    for (const id of execIds) {
      try {
        const out = new GetTraceOutput();
        await this.agentExecution.getTrace(
          Object.assign(new GetTraceInput(), { trace_id: id }),
          new AgentExecutionContext(),
          out,
        );
        if (out.trace) {
          summaries.push({
            trace_id: out.trace.trace_id,
            agent_id: out.trace.agent_id,
            iterations: out.trace.iterations?.length ?? 0,
            total_elapsed_ms: out.trace.total_elapsed_ms,
          });
        } else {
          summaries.push({ trace_id: id });
        }
      } catch {
        summaries.push({ trace_id: id });
      }
    }
    phase.execution_summaries = summaries;
  }

  private async enrichWritingPhase(phase: Record<string, unknown>): Promise<void> {
    const writerAgentId = String(phase.writer_agent_id ?? '');
    if (!writerAgentId) return;

    try {
      const out = new GetAgentOutput();
      await this.agentLibrary.getAgent(
        Object.assign(new GetAgentInput(), { agent_id: writerAgentId }),
        new AgentLibraryContext(),
        out,
      );
      if (out.agents.length > 0) {
        phase.writer_detail = out.agents[0] as unknown as Record<string, unknown>;
      }
    } catch {
    }
  }

  private async enrichEvaluatingPhase(phase: Record<string, unknown>): Promise<void> {
    const evalIds = Array.isArray(phase.eval_ids) ? phase.eval_ids as string[] : [];
    if (evalIds.length === 0) return;

    try {
      const out = new GetEvaluationOutput();
      await this.evolutorAgent.getEvaluation(
        Object.assign(new GetEvaluationInput(), {
          conditions: [],
        }),
        new EvolutorAgentContext(),
        out,
      );
      const matched = out.evaluations.filter((e) => evalIds.includes(e.eval_id));
      phase.eval_details = matched as unknown as Record<string, unknown>[];
    } catch {
    }
  }

  private async resolveToolCalls(toolCalls: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
    const resolved: Array<Record<string, unknown>> = [];

    for (const call of toolCalls) {
      const toolType = String(call.tool_type ?? call.type ?? '').toUpperCase();
      const toolId = String(call.tool_id ?? call.id ?? '');

      const resolvedCall: Record<string, unknown> = { ...call };

      try {
        if (toolType === 'SKILL' && toolId) {
          resolvedCall.tool_name = await this.resolveToolName('skill', toolId);
        } else if (toolType === 'MCP' && toolId) {
          resolvedCall.tool_name = await this.resolveToolName('mcp', toolId);
        }
      } catch {
      }

      resolved.push(resolvedCall);
    }

    return resolved;
  }

  private async resolveToolName(toolType: string, id: string): Promise<string> {
    try {
      if (toolType === 'skill') {
        const out = new GetSkillOutput();
        await this.skillAccess.getSkill(
          Object.assign(new GetSkillInput(), { id }),
          new SkillContext(),
          out,
        );
        const skill = out.skill as Record<string, unknown> | null;
        return String(skill?.skill_name ?? skill?.name ?? id);
      }
      if (toolType === 'mcp') {
        const out = new GetMcpOutput();
        await this.mcpAccess.getMcp(
          Object.assign(new GetMcpInput(), { id }),
          new McpContext(),
          out,
        );
        const mcp = out.mcp as Record<string, unknown> | null;
        return String(mcp?.mcp_name ?? mcp?.name ?? id);
      }
    } catch {
    }
    return id;
  }

  private extractFinalAnswer(rawTrace: Record<string, unknown>): string {
    const iterations = rawTrace.iterations as Array<Record<string, unknown>> | undefined;
    if (!iterations || iterations.length === 0) return '';

    for (let i = iterations.length - 1; i >= 0; i--) {
      const iter = iterations[i];
      if (iter.answer) {
        return String((iter.answer as Record<string, unknown>)?.answer ?? '');
      }
    }
    return '';
  }

  private truncate(text: string, maxLen: number): string {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  private logWarn(msg: string, err: unknown): void {
    if (this.logger) {
      this.logger.debug(`[VisualizationService] ${msg}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
