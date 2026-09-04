import { Metrics, Report } from '@brian-agent/base';
import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, Operator,
  InfoType,
  type Logger, type Condition, type StreamAccess,
} from '@brian-agent/base';
import type { AgentBuilderAccess, AgentExecutionAccess, AgentLibraryAccess } from '@brian-agent/agent';
import {
  BuildAgentInput, BuildAgentOutput,
  AgentBuilderContext,
  ExecAgentInput, ExecAgentOutput,
  AgentExecutionContext,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext,
} from '@brian-agent/agent';
import type { InfoCoreAccess } from '@brian-agent/core';
import { SaveInfoInput, SaveInfoOutput, InfoCoreContext } from '@brian-agent/core';
import {
  OrchestrationExecutionContext,
  OrchestrationExecutionConfig,
  BuildAgentDAGInput,
  BuildAgentDAGOutput,
  ExecSingleAgentInput,
  ExecSingleAgentOutput,
  ExecDAGInput,
  ExecDAGOutput,
  ExecDAGAsyncInput,
  ExecDAGAsyncOutput,
  GetDAGProgressInput,
  GetDAGProgressOutput,
  CancelExecutionInput,
  CancelExecutionOutput,
  GetOrchestrationExecQueueStatusInput,
  GetOrchestrationExecQueueStatusOutput,
  ConfigOrchestrationExecutionInput,
  ConfigOrchestrationExecutionOutput,
  RecordSystemAgentExecutionInput,
  RecordSystemAgentExecutionOutput,
  AgentDAG,
  AgentNode,
  AgentEdge,
  AgentNodeDetail,
  TaskNode,
  ORCHESTRATION_TASK_AGENT_TABLE,
  ORCHESTRATION_AGENT_DAG_TABLE,
  ORCHESTRATION_AGENT_DAG_RECORD_TABLE,
  ORCHESTRATION_AGENT_EXECUTION_TABLE,
  ORCHESTRATION_CONFIG_TABLE,
} from '../domain/types';
import { DagScheduler, DagNodeFailureError, type DagNodeExecutor } from './DagScheduler';

export class OrchestrationExecutionService {
  private config = new OrchestrationExecutionConfig();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentExecution: AgentExecutionAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqAccess?: any,
    private readonly mqCore?: any,
    private readonly logger?: Logger,
    private readonly streamAccess?: StreamAccess,
  ) {}

  getConfig(): OrchestrationExecutionConfig {
    return this.config;
  }

  private configLoaded = false;

  /**
   * 从 orchestration_config 表加载 max_concurrent / dag_timeout_ms 等运行时配置。
   *
   * 配置中心（orchestration_config 表）是并发度的唯一事实来源，加载后缓存，
   * 避免每次 buildAgentDAG / execDAG 都重复查库。
   */
  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) return;
    try {
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(
        Object.assign(new SelectOneDBInput(), {
          query_param: { table: ORCHESTRATION_CONFIG_TABLE },
        }),
        selOutput,
        new DBContext(),
      );
      const current = (selOutput.row ?? {}) as Record<string, unknown>;
      if (current.max_concurrent !== undefined && current.max_concurrent !== null) {
        this.config.max_concurrent = Number(current.max_concurrent);
      }
      if (current.dag_timeout_ms !== undefined && current.dag_timeout_ms !== null) {
        this.config.dag_timeout_ms = Number(current.dag_timeout_ms);
      }
      if (current.agent_timeout_ms !== undefined && current.agent_timeout_ms !== null) {
        this.config.agent_timeout_ms = Number(current.agent_timeout_ms);
      }
      this.configLoaded = true;
    } catch {
      /* 表未就绪或查询失败时使用默认配置 */
    }
  }

  // -------------------------------------------------------------------------
  // buildAgentDAG
  // -------------------------------------------------------------------------

  async buildAgentDAG(input: BuildAgentDAGInput, output: BuildAgentDAGOutput, context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    await this.ensureConfigLoaded();
    const { plan_id, task_dag, interact_id, force_new } = input;

    if (!task_dag.nodes || task_dag.nodes.length === 0) {
      output.agent_dag = { plan_id, total_agent_count: 0, agent_nodes: [], agent_edges: [] };
      return true;
    }

    const taskIdSet = new Set(task_dag.nodes.map((n) => n.task_id));
    const edges = task_dag.edges ?? [];
    for (const edge of edges) {
      if (!taskIdSet.has(edge.from_task_id)) {
        throw new ValidationError(`Edge from_task_id "${edge.from_task_id}" not found in nodes`);
      }
      if (!taskIdSet.has(edge.to_task_id)) {
        throw new ValidationError(`Edge to_task_id "${edge.to_task_id}" not found in nodes`);
      }
    }

    const agentNodes: AgentNode[] = new Array<AgentNode>(task_dag.nodes.length);
    const taskAgentMap: Record<string, string> = {};
    const sessionId = context.session_id ?? '';
    const workId = context.work_id ?? '';
    const childMap = this.buildTaskChildMap(task_dag.nodes);

    const buildOne = async (taskNode: TaskNode, index: number): Promise<void> => {
      const taskAgentRecordId = await this.insertTaskAgentRecord(plan_id, taskNode);
      const { agentId, status } = await this.buildLeafAgent(taskNode, interact_id, sessionId, workId, force_new);
      if (agentId) {
        await this.updateTaskAgentRecord(taskAgentRecordId, agentId);
        taskAgentMap[taskNode.task_id] = agentId;
      }
      agentNodes[index] = this.buildAgentNode(taskNode, agentId, status, childMap);
    };

    // ===== 修改后：按配置中心的 max_concurrent 并发构建 Work Agent =====
    // 原实现串行构建，9 个 Agent 逐个触发 LLM 匹配导致总耗时近 2 分钟；
    // 现改为受 max_concurrent 限制的并发池，显著缩短多 Agent 构建时间。
    const concurrency = Math.max(1, this.config.max_concurrent);
    let cursor = 0;
    const workerCount = Math.min(concurrency, task_dag.nodes.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push((async () => {
        while (cursor < task_dag.nodes.length) {
          const idx = cursor++;
          await buildOne(task_dag.nodes[idx], idx);
        }
      })());
    }
    await Promise.all(workers);

    // ===== 修改后实现：task 级边与 agent 级边分离 =====
    // 执行拓扑以 task 级边（from_task_id/to_task_id）为权威来源，规避多 task 复用同一 Agent
    // 时 agent 级边展开成环的死锁问题；agent 级边仅用于可视化，按 plan 去重后落库。
    const existingEdgeRows = this.relationDb.queryRaw<{ from_agent_id: string; to_agent_id: string }>(
      `SELECT from_agent_id, to_agent_id FROM ${ORCHESTRATION_AGENT_DAG_TABLE} WHERE plan_id = ?`,
      [plan_id],
    );
    const existingAgentEdgeSet = new Set<string>(
      existingEdgeRows.map((r) => `${r.from_agent_id}->${r.to_agent_id}`),
    );
    const taskEdgeSet = new Set<string>();

    const agentEdges: AgentEdge[] = [];
    for (const edge of edges) {
      const fromAgentId = taskAgentMap[edge.from_task_id] ?? '';
      const toAgentId = taskAgentMap[edge.to_task_id] ?? '';

      // 1) 执行层：task 级边（权威），去重并忽略自环 task
      const taskEdgeKey = `${edge.from_task_id}->${edge.to_task_id}`;
      if (edge.from_task_id !== edge.to_task_id && !taskEdgeSet.has(taskEdgeKey)) {
        taskEdgeSet.add(taskEdgeKey);
        agentEdges.push({
          from_task_id: edge.from_task_id,
          to_task_id: edge.to_task_id,
          from_agent_id: fromAgentId,
          to_agent_id: toAgentId,
          data_dependency: `task_${edge.from_task_id} → task_${edge.to_task_id}`,
        });
      }

      // 2) 可视化层：agent 级边落库（跳过无映射 / 自环 / 重复）
      if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) continue;
      const agentEdgeKey = `${fromAgentId}->${toAgentId}`;
      if (existingAgentEdgeSet.has(agentEdgeKey)) continue;
      existingAgentEdgeSet.add(agentEdgeKey);

      const edgeId = IdGenerator.generate();
      const edgeNow = IdGenerator.now();
      const insInput = Object.assign(new InsertDBInput(), {
        table: ORCHESTRATION_AGENT_DAG_TABLE,
        data: [
          { field: 'id', value: edgeId },
          { field: 'created', value: edgeNow },
          { field: 'updated', value: edgeNow },
          { field: 'plan_id', value: plan_id },
          { field: 'from_agent_id', value: fromAgentId },
          { field: 'to_agent_id', value: toAgentId },
        ] as DataObject[],
      });
      await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());
    }

    const agentDag: AgentDAG = {
      plan_id,
      total_agent_count: agentNodes.length,
      agent_nodes: agentNodes,
      agent_edges: agentEdges,
    };

    const dagRecordId = IdGenerator.generate();
    const dagNow = IdGenerator.now();
    const insDagInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_AGENT_DAG_RECORD_TABLE,
      data: [
        { field: 'id', value: dagRecordId },
        { field: 'created', value: dagNow },
        { field: 'updated', value: dagNow },
        { field: 'plan_id', value: plan_id },
        { field: 'total_agent_count', value: agentNodes.length },
        { field: 'agent_dag_json', value: JSON.stringify(agentDag) },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insDagInput, Object.assign(new InsertDBOutput(), {}), new DBContext());

    output.agent_dag = agentDag;
    output.task_agent_map = taskAgentMap;
    return true;
  }

  /** 依据 parent_task_id 构建 task → 子任务数量映射，用于判定叶子 / 父任务。 */
  private buildTaskChildMap(nodes: TaskNode[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const n of nodes) {
      if (!n.parent_task_id) continue;
      map.set(n.parent_task_id, (map.get(n.parent_task_id) ?? 0) + 1);
    }
    return map;
  }

  private isParentTask(taskId: string, childMap: Map<string, number>): boolean {
    return (childMap.get(taskId) ?? 0) > 0;
  }

  private async insertTaskAgentRecord(planId: string, taskNode: TaskNode): Promise<string> {
    const taskAgentRecordId = IdGenerator.generate();
    const now = IdGenerator.now();
    const insInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_TASK_AGENT_TABLE,
      data: [
        { field: 'id', value: taskAgentRecordId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'plan_id', value: planId },
        { field: 'task_id', value: taskNode.task_id },
        { field: 'agent_id', value: '' },
        { field: 'task_complexity', value: taskNode.task_complexity ?? null },
        { field: 'task_domain', value: taskNode.task_domain ?? null },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());
    return taskAgentRecordId;
  }

  /** 为叶子任务构建 / 复用 WorkAgent。 */
  private async buildLeafAgent(
    taskNode: TaskNode,
    interactId: string,
    sessionId: string,
    workId: string,
    forceNew?: boolean,
  ): Promise<{ agentId: string; status: string }> {
    try {
      const buildInput = Object.assign(new BuildAgentInput(), {
        interact_id: interactId,
        task_content: taskNode.task_content,
        task_complexity: taskNode.task_complexity,
        task_domain: taskNode.task_domain,
        force_new: forceNew,
      });
      const buildOutput = new BuildAgentOutput();
      const builderCtx = Object.assign(new AgentBuilderContext(), {
        session_id: sessionId,
        work_id: workId,
        interact_id: interactId,
      });
      const ok = await this.agentBuilder.buildAgent(buildInput, buildOutput, builderCtx);
      if (!ok || !buildOutput.agent_id) return { agentId: '', status: 'BUILD_FAILED' };
      return { agentId: buildOutput.agent_id, status: 'PENDING' };
    } catch (err: unknown) {
      this.logger?.error?.('buildAgentDAG: agent build failed', {
        task_id: taskNode.task_id,
        error: err instanceof Error ? err.message : String(err),
      });
      return { agentId: '', status: 'BUILD_FAILED' };
    }
  }

  private async updateTaskAgentRecord(recordId: string, agentId: string): Promise<void> {
    const updInput = Object.assign(new UpdateDBInput(), {
      table: ORCHESTRATION_TASK_AGENT_TABLE,
      data: [
        { field: 'agent_id', value: agentId },
        { field: 'updated', value: IdGenerator.now() },
      ] as DataObject[],
      conditions: [{ field: 'id', operator: Operator.EQ, value: recordId }] as Condition[],
    });
    await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
  }

  private buildAgentNode(taskNode: TaskNode, agentId: string, status: string, childMap: Map<string, number>): AgentNode {
    const nodeKind = this.isParentTask(taskNode.task_id, childMap) ? 'PARENT' : 'LEAF';
    return {
      agent_id: agentId,
      task_id: taskNode.task_id,
      parent_task_id: taskNode.parent_task_id,
      task_content: taskNode.task_content,
      task_complexity: taskNode.task_complexity,
      task_domain: taskNode.task_domain,
      task_priority: taskNode.priority,
      status,
      node_kind: nodeKind,
    };
  }

  /**
   * 执行记录大字段入库截断。
   * task_content 会随上游摘要拼接滚雪球（存量平均 104KB、最大 750KB），超长内容入 SQLite
   * 放大行体积与查询成本；answer 为 LLM 完整输出，同样设上限兜底。
   */
  private static trimExecText(value: unknown, limit: number): unknown {
    if (typeof value !== 'string' || value.length <= limit) return value;
    return value.slice(0, limit) + `\n…[已截断，原始 ${value.length} 字符]`;
  }

  /** 组合任务执行内容：父任务结合子任务结果汇总，叶子任务携带上游工作摘要。 */
  private buildExecTaskContent(node: AgentNode, upstreamSummaries: string[]): string {
    if (upstreamSummaries.length === 0) return node.task_content;
    // 上游摘要逐条截断：父任务聚合全部子任务结果，不截断会随 DAG 层级滚雪球，
    // 同时挤爆 LLM 上下文窗口（拼接结果同时作为执行输入）
    const summaries = upstreamSummaries.map(
      (s) => OrchestrationExecutionService.trimExecText(s, 4 * 1024) as string,
    );
    const merged = node.node_kind === 'PARENT'
      ? `子任务已完成的结果：\n${summaries.join('\n')}\n---\n请结合上述子任务结果，汇总产出父任务结果：${node.task_content}`
      : `上游Agent完成的工作摘要：\n${summaries.join('\n')}\n---\n当前任务：${node.task_content}`;
    return OrchestrationExecutionService.trimExecText(merged, 32 * 1024) as string;
  }

  // -------------------------------------------------------------------------
  // execSingleAgent
  // -------------------------------------------------------------------------

  async execSingleAgent(input: ExecSingleAgentInput, output: ExecSingleAgentOutput, context: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const { work_id, interact_id, agent_id, task_content, plan_id, task_id } = input;

    if (!task_content) {
      return false;
    }

    const execRecordId = IdGenerator.generate();
    const now = IdGenerator.now();

    // work_context 不再拼入 task_content：上下文来源关系已由 InfoCoreProvider.context() 落盘
    // info_context_source 表，历史上下文查看改经 soContextByWork(work_id) 查询，task_content 仅存纯任务内容。
    const enhancedContent = task_content;

    const insInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
      data: [
        { field: 'id', value: execRecordId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'work_id', value: work_id },
        { field: 'agent_id', value: agent_id },
        { field: 'plan_id', value: plan_id ?? '' },
        { field: 'task_id', value: task_id ?? '' },
        { field: 'execution_type', value: 'SINGLE' },
        { field: 'task_content', value: OrchestrationExecutionService.trimExecText(enhancedContent, 32 * 1024) },
        { field: 'status', value: 'RUNNING' },
        { field: 'answer', value: '' },
        { field: 'trace_id', value: '' },
        { field: 'iterations', value: 0 },
        { field: 'elapsed_ms', value: 0 },
        { field: 'error_info', value: '' },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());

    const startedAt = Date.now();

    try {
      const execInput = Object.assign(new ExecAgentInput(), {
        agent_id,
        work_id,
        interact_id,
        task_content: enhancedContent,
        trace_id: input.trace_id,
        task_id,
      });
      const execOutput = new ExecAgentOutput();
      const agentCtx = Object.assign(new AgentExecutionContext(), {
        session_id: context.session_id,
        work_id,
        interact_id,
        trace_id: input.trace_id,
      });
      const execSuccess = await this.agentExecution.execAgent(execInput, execOutput, agentCtx, metrics, report);
      if (!execSuccess) {
        const elapsed = Date.now() - startedAt;
        const errorMsg = (execOutput as unknown as Record<string, unknown>).error as string ?? 'execAgent returned false';
        const updFailInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
          data: [
            { field: 'status', value: 'FAILED' },
            { field: 'elapsed_ms', value: elapsed },
            { field: 'error_info', value: errorMsg },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'id', operator: Operator.EQ, value: execRecordId },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updFailInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
        if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && context.session_id) {
          await this.streamAccess.pushEvent(context.session_id, 'agent_error', 'TRACE', {
            agent_id,
            error_message: errorMsg,
            elapsed_ms: elapsed,
            input: enhancedContent,
          }, { work_id, interact_id, agent_id, node_id: 'ANSWER', task_id });
        }
        output.error = errorMsg;
        return false;
      }

      const elapsed = Date.now() - startedAt;

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        data: [
          { field: 'status', value: 'COMPLETED' },
          { field: 'answer', value: OrchestrationExecutionService.trimExecText(execOutput.answer, 64 * 1024) },
          { field: 'trace_id', value: execOutput.trace_id },
          { field: 'iterations', value: execOutput.iterations },
          { field: 'elapsed_ms', value: elapsed },
          { field: 'updated', value: IdGenerator.now() },
        ] as DataObject[],
        conditions: [
          { field: 'id', operator: Operator.EQ, value: execRecordId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());

      const usageInput = Object.assign(new RecordAgentUsageInput(), {
        agent_id,
        work_id,
        interact_id,
        usage_context: task_content.slice(0, 256),
      });
      await this.agentLibrary.recordAgentUsage(usageInput, new RecordAgentUsageOutput(), new AgentLibraryContext());

      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: context.session_id ?? '',
        work_id,
        interact_id,
        info_type: InfoType.ACT,
        info_creator_role: 'AGENT',
        info_creator_id: agent_id,
        info: `${task_content} → ${execOutput.answer}`,
      });
      await this.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      // Agent 执行完成事件：前端据此将对应 AgentDAG 节点 / 工作 Agent 标记为执行成功（绿色）
      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && context.session_id) {
        // ===== 修改后的代码：提取输入与输出 Token 细项并在 agent_output 事件中透传 =====
        let totalTokens = 0;
        let inputTokens = 0;
        let outputTokens = 0;
        try {
          if (execOutput.trace_id) {
            const traceRows = this.relationDb.queryRaw<{ total_token_usage: number; iterations_json?: string }>(
              `SELECT "total_token_usage", "iterations_json" FROM "agent_execution_trace" WHERE "trace_id" = ? LIMIT 1`,
              [execOutput.trace_id],
            );
            if (traceRows.length > 0) {
              totalTokens = Number(traceRows[0].total_token_usage ?? 0);
              if (traceRows[0].iterations_json) {
                try {
                  const iters = JSON.parse(String(traceRows[0].iterations_json));
                  if (Array.isArray(iters)) {
                    for (const iter of iters) {
                      if (iter.think) {
                        inputTokens += Number(iter.think.input_tokens ?? 0);
                        outputTokens += Number(iter.think.output_tokens ?? 0);
                      }
                      if (iter.reflect) {
                        inputTokens += Number(iter.reflect.input_tokens ?? 0);
                        outputTokens += Number(iter.reflect.output_tokens ?? 0);
                      }
                      if (iter.answer) {
                        inputTokens += Number(iter.answer.input_tokens ?? 0);
                        outputTokens += Number(iter.answer.output_tokens ?? 0);
                      }
                    }
                  }
                } catch { /* best-effort */ }
              }
            }
          }
        } catch { /* best-effort */ }

        if (inputTokens === 0 && outputTokens === 0 && totalTokens > 0) {
          inputTokens = Math.round(totalTokens * 0.7);
          outputTokens = Math.max(0, totalTokens - inputTokens);
        }

        await this.streamAccess.pushEvent(context.session_id, 'agent_output', 'TRACE', {
          agent_id,
          answer: execOutput.answer,
          iterations: execOutput.iterations,
          elapsed_ms: elapsed,
          token_usage: totalTokens,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          input: enhancedContent,
          output: execOutput.answer,
        }, {
          work_id,
          interact_id,
          agent_id,
          node_id: 'ANSWER',
          task_id,
        });
      }

      output.answer = execOutput.answer;
      output.trace_id = execOutput.trace_id;
      output.iterations = execOutput.iterations;
      output.elapsed_ms = elapsed;
      return true;
    } catch (err: unknown) {
      const elapsed = Date.now() - startedAt;
      const errorMsg = err instanceof Error ? err.message : String(err);

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        data: [
          { field: 'status', value: 'FAILED' },
          { field: 'elapsed_ms', value: elapsed },
          { field: 'error_info', value: errorMsg },
          { field: 'updated', value: IdGenerator.now() },
        ] as DataObject[],
        conditions: [
          { field: 'id', operator: Operator.EQ, value: execRecordId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());

      this.logger?.error?.('execSingleAgent: execution failed', {
        agent_id,
        work_id,
        error: errorMsg,
      });

      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && context.session_id) {
        await this.streamAccess.pushEvent(context.session_id, 'agent_error', 'TRACE', {
          agent_id,
          error_message: errorMsg,
          elapsed_ms: elapsed,
          input: enhancedContent,
        }, { work_id, interact_id, agent_id, node_id: 'ANSWER', task_id });
      }

      return false;
    }
  }

  // -------------------------------------------------------------------------
  // recordSystemAgentExecution
  // -------------------------------------------------------------------------

  // 系统 Agent（Writer / Evolutor 等）不经过 execAgent 的 ReACT 循环，无法复用
  // execSingleAgent 的 RUNNING→COMPLETED 生命周期；此处仅记录其完成态执行结果，
  // 写入与 execSingleAgent 相同的 orchestration_agent_execution 表，供
  // buildThinkingBlocksAndDag 统一采集展示，保证与其他 Agent 采集方式一致。
  async recordSystemAgentExecution(input: RecordSystemAgentExecutionInput, _output: RecordSystemAgentExecutionOutput, _context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const now = IdGenerator.now();
    const insInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
      data: [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'work_id', value: input.work_id },
        { field: 'agent_id', value: input.agent_id },
        { field: 'plan_id', value: '' },
        { field: 'task_id', value: '' },
        { field: 'execution_type', value: 'SYSTEM' },
        { field: 'task_content', value: OrchestrationExecutionService.trimExecText(input.task_content, 32 * 1024) },
        { field: 'status', value: 'COMPLETED' },
        { field: 'answer', value: OrchestrationExecutionService.trimExecText(input.answer, 64 * 1024) },
        { field: 'trace_id', value: input.trace_id ?? '' },
        { field: 'iterations', value: 0 },
        { field: 'elapsed_ms', value: input.elapsed_ms ?? 0 },
        { field: 'error_info', value: '' },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());
    return true;
  }

  // -------------------------------------------------------------------------
  // execDAG
  // -------------------------------------------------------------------------

  // ===== 修改后的 execDAG 方法（重构：基于 DagScheduler 的任务级拓扑调度） =====
  async execDAG(input: ExecDAGInput, output: ExecDAGOutput, context: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const { work_id, agent_dag, work_context, max_concurrent, dag_timeout_ms } = input;
    const concurrency = max_concurrent ?? this.config.max_concurrent;
    const timeoutMs = dag_timeout_ms ?? this.config.dag_timeout_ms;

    const nodes = agent_dag.agent_nodes;
    const edges = agent_dag.agent_edges;

    // 节点执行器：注入上游（子任务）输出摘要，随后调用 execSingleAgent 执行 Work Agent。
    // 父任务（PARENT）结合子任务结果汇总产出父任务结果；叶子任务（LEAF）执行具体工作。
    // 失败时抛 DagNodeFailureError，由 DagScheduler 统一收敛为权威失败信息并快速失败。
    const executor: DagNodeExecutor = async (node, upstreamSummaries) => {
      const taskContent = this.buildExecTaskContent(node, upstreamSummaries);

      const singleInput = Object.assign(new ExecSingleAgentInput(), {
        work_id,
        interact_id: context.interact_id ?? '',
        agent_id: node.agent_id,
        task_content: taskContent,
        plan_id: agent_dag.plan_id,
        task_id: node.task_id,
        work_context,
        trace_id: input.trace_id,
      });
      const singleOutput = new ExecSingleAgentOutput();
      const ok = await this.execSingleAgent(singleInput, singleOutput, context, metrics, report);
      if (!ok) {
        throw new DagNodeFailureError(
          node.agent_id,
          node.task_id,
          (singleOutput as unknown as { error?: string }).error ?? 'execSingleAgent 返回失败',
          0,
          [],
        );
      }
      return {
        answer: singleOutput.answer,
        trace_id: singleOutput.trace_id,
        iterations: singleOutput.iterations,
        elapsed_ms: singleOutput.elapsed_ms,
      };
    };

    const scheduler = new DagScheduler();
    const runOutput = await scheduler.run(nodes, edges, executor, {
      concurrency,
      timeoutMs,
      nodeTimeoutMs: this.config.agent_timeout_ms,
      logger: this.logger,
      onCompleted: async (completed: number) => {
        if (!work_id) return;
        try {
          await this.relationDb.updateDB(
            Object.assign(new UpdateDBInput(), {
              table: 'orchestration_work',
              data: [
                { field: 'completed_task_count', value: completed },
                { field: 'updated', value: IdGenerator.now() },
              ] as DataObject[],
              conditions: [
                { field: 'work_id', operator: Operator.EQ, value: work_id },
              ] as Condition[],
            }),
            Object.assign(new UpdateDBOutput(), {}),
            new DBContext(),
          );
        } catch {
          // ignore
        }
      },
      onCancelled: async (cancelledNodes: AgentNode[]) => {
        for (const node of cancelledNodes) {
          if (!node.agent_id) continue;
          try {
            await this.relationDb.updateDB(
              Object.assign(new UpdateDBInput(), {
                table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
                data: [
                  { field: 'status', value: 'CANCELLED' },
                  { field: 'error_info', value: 'DAG timeout exceeded' },
                  { field: 'updated', value: IdGenerator.now() },
                ] as DataObject[],
                conditions: [
                  { field: 'work_id', operator: Operator.EQ, value: work_id },
                  { field: 'agent_id', operator: Operator.EQ, value: node.agent_id },
                ] as Condition[],
              }),
              Object.assign(new UpdateDBOutput(), {}),
              new DBContext(),
            );
          } catch {
            // ignore
          }
        }
      },
    });

    output.agent_results = runOutput.results;
    output.total_elapsed_ms = runOutput.totalElapsedMs;
    output.failed_count = runOutput.failedCount;
    return true;
  }

  // -------------------------------------------------------------------------
  // execDAGAsync
  // -------------------------------------------------------------------------

  async execDAGAsync(input: ExecDAGAsyncInput, output: ExecDAGAsyncOutput, context: OrchestrationExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const jobId = IdGenerator.generate();
    output.job_id = jobId;

    if (this.mqAccess) {
      try {
        const sendInput = Object.assign({}, {
          data: {
            queue: 'orchestration.dag_execution',
            payload: {
              job_id: jobId,
              work_id: input.work_id,
              agent_dag: input.agent_dag,
              work_context: input.work_context,
              max_concurrent: input.max_concurrent,
              callback_queue: input.callback_queue,
            },
          },
        });
        await this.mqAccess.sendMQ(sendInput, {}, {});

        if (this.mqCore) {
          // 查重：orchestration.dag_execution 常驻 worker 已存在则跳过。
          // 此前误调不存在的 getWorker，TypeError 直接跳到外层 catch，
          // 导致 worker 从未建立、每次都走 setImmediate 同步 fallback、队列消息滞留。
          const soWorkerOutput = Object.assign({}, { workers: [] as unknown[] });
          await this.mqCore.soWorker({ queue: 'orchestration.dag_execution' }, {}, soWorkerOutput);
          if ((soWorkerOutput.workers as unknown[]).length === 0) {
            const startWorkerInput = Object.assign({}, {
              queue: 'orchestration.dag_execution',
              handler: async (msg: Record<string, unknown>) => {
                try {
                  const payload = msg.payload as Record<string, unknown>;
                  const dagInput = Object.assign(new ExecDAGInput(), {
                    work_id: payload.work_id as string,
                    agent_dag: payload.agent_dag,
                    work_context: payload.work_context as string | undefined,
                    max_concurrent: payload.max_concurrent as number | undefined,
                  });
                  const dagOutput = new ExecDAGOutput();
                  await this.execDAG(dagInput, dagOutput, context, metrics, report);

                  if (payload.callback_queue && this.mqAccess) {
                    const cbInput = Object.assign({}, {
                      data: { queue: payload.callback_queue as string, payload: dagOutput },
                    });
                    await this.mqAccess.sendMQ(cbInput, {}, {});
                  }
                  return true;
                } catch (err: unknown) {
                  this.logger?.error?.('execDAGAsync: worker handler failed', {
                    job_id: jobId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return false;
                }
              },
            });
            await this.mqCore.startWorker(startWorkerInput, {}, {});
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('execDAGAsync: MQ enqueue failed, falling back to setImmediate', {
          error: err instanceof Error ? err.message : String(err),
        });
        setImmediate(async () => {
          try {
            const dagInput = Object.assign(new ExecDAGInput(), {
              work_id: input.work_id,
              agent_dag: input.agent_dag,
              work_context: input.work_context,
              max_concurrent: input.max_concurrent,
            });
            const dagOutput = new ExecDAGOutput();
            await this.execDAG(dagInput, dagOutput, context, metrics, report);
            this.logger?.debug?.('execDAGAsync: DAG execution completed', {
              job_id: jobId, work_id: input.work_id, failed_count: dagOutput.failed_count,
            });
          } catch (err2: unknown) {
            this.logger?.error?.('execDAGAsync: DAG execution failed', {
              job_id: jobId, work_id: input.work_id,
              error: err2 instanceof Error ? err2.message : String(err2),
            });
          }
        });
      }
    } else {
      setImmediate(async () => {
        try {
          const dagInput = Object.assign(new ExecDAGInput(), {
            work_id: input.work_id,
            agent_dag: input.agent_dag,
            work_context: input.work_context,
            max_concurrent: input.max_concurrent,
          });
          const dagOutput = new ExecDAGOutput();
          await this.execDAG(dagInput, dagOutput, context, metrics, report);
          this.logger?.debug?.('execDAGAsync: DAG execution completed', {
            job_id: jobId, work_id: input.work_id, failed_count: dagOutput.failed_count,
          });
        } catch (err: unknown) {
          this.logger?.error?.('execDAGAsync: DAG execution failed', {
            job_id: jobId, work_id: input.work_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // soDAGProgress
  // -------------------------------------------------------------------------

  async soDAGProgress(input: GetDAGProgressInput, output: GetDAGProgressOutput, _context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selExecInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selExecOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selExecInput, selExecOutput, new DBContext());

    const records = selExecOutput.rows;
    const totalTasks = records.length;

    let completedTasks = 0;
    let runningTasks = 0;
    let failedTasks = 0;
    let pendingTasks = 0;

    const nodeDetails: AgentNodeDetail[] = [];

    for (const rec of records) {
      const status = (rec.status as string) ?? 'PENDING';
      switch (status) {
        case 'COMPLETED':
          completedTasks++;
          break;
        case 'RUNNING':
          runningTasks++;
          break;
        case 'FAILED':
        case 'EXEC_FAILED':
        case 'BUILD_FAILED':
          failedTasks++;
          break;
        case 'CANCELLED':
          break;
        default:
          pendingTasks++;
          break;
      }

      nodeDetails.push({
        agent_id: (rec.agent_id as string) ?? '',
        task_content: ((rec.task_content as string) ?? '').slice(0, 100),
        status,
        answer: status === 'COMPLETED' ? ((rec.answer as string) ?? '') : '',
        trace_id: (rec.trace_id as string) ?? '',
        elapsed_ms: (rec.elapsed_ms as number) ?? 0,
      });
    }

    const totalElapsed = records.reduce((sum, r) => sum + ((r.elapsed_ms as number) ?? 0), 0);

    output.progress = {
      work_id: input.work_id,
      plan_id: input.plan_id ?? '',
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      running_tasks: runningTasks,
      failed_tasks: failedTasks,
      pending_tasks: pendingTasks,
      node_details: nodeDetails,
      total_elapsed_ms: totalElapsed,
    };

    return true;
  }

  // -------------------------------------------------------------------------
  // cancelExecution
  // -------------------------------------------------------------------------

  async cancelExecution(input: CancelExecutionInput, output: CancelExecutionOutput, _context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.mqCore) {
      try {
        const stopInput = Object.assign({}, { identifier: input.work_id });
        await this.mqCore.stopWorker(stopInput, {}, {});
      } catch (err: unknown) {
        this.logger?.error?.('cancelExecution: stopWorker failed', {
          work_id: input.work_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());

    const records = selOutput.rows;
    let cancelledCount = 0;

    for (const rec of records) {
      const status = rec.status as string;
      if (status === 'PENDING' || status === 'RUNNING') {
        const updInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
          data: [
            { field: 'status', value: 'CANCELLED' },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'id', operator: Operator.EQ, value: rec.id },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
        cancelledCount++;
      }
    }

    output.cancelled_count = cancelledCount;
    return true;
  }

  // -------------------------------------------------------------------------
  // soExecQueueStatus
  // -------------------------------------------------------------------------

  async soExecQueueStatus(_input: GetOrchestrationExecQueueStatusInput, output: GetOrchestrationExecQueueStatusOutput, _context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    try {
      const execSelInput = Object.assign(new SelectDBInput(), {
        query_param: { table: ORCHESTRATION_AGENT_EXECUTION_TABLE },
      });
      const execSelOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(execSelInput, execSelOutput, new DBContext());

      let pending = 0;
      let processing = 0;
      let completed = 0;
      let failed = 0;

      for (const row of execSelOutput.rows) {
        const status = (row.status as string) ?? '';
        switch (status) {
          case 'PENDING': pending++; break;
          case 'RUNNING': processing++; break;
          case 'COMPLETED': completed++; break;
          case 'FAILED': case 'EXEC_FAILED': case 'BUILD_FAILED': failed++; break;
        }
      }

      output.queue_stats = { pending, processing, completed, failed };
    } catch {
      output.queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    try {
      const stratSelInput = Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'orchestration_strategy_execution',
          conditions: [
            { field: 'execution_status', operator: Operator.EQ, value: 'RUNNING' },
          ] as Condition[],
        },
      });
      const stratSelOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(stratSelInput, stratSelOutput, new DBContext());
      output.workers = stratSelOutput.rows.map((row) => ({
        work_id: (row.work_id as string) ?? '',
        execution_id: (row.execution_id as string) ?? '',
        strategy_id: (row.strategy_id as string) ?? '',
        plan_id: (row.plan_id as string) ?? '',
        retry_count: (row.plan_retry_count as number) ?? 0,
      }));
    } catch {
      output.workers = [];
    }

    output.mq_queue_status = null;
    if (this.mqCore) {
      try {
        const soWorkerOutput = Object.assign({}, { workers: [] as unknown[] });
        await this.mqCore.soWorker({ queue: 'orchestration.dag_execution' }, {}, soWorkerOutput);
        const workers = soWorkerOutput.workers as unknown[];
        output.mq_queue_status = {
          queue: 'orchestration.dag_execution',
          worker_active: workers.length > 0,
          worker_info: workers[0] ?? null,
        };
      } catch (err: unknown) {
        this.logger?.error?.('soExecQueueStatus: MQ queue query failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // configOrchestrationExecution
  // -------------------------------------------------------------------------

  async configOrchestrationExecution(input: ConfigOrchestrationExecutionInput, output: ConfigOrchestrationExecutionOutput, _context: OrchestrationExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.max_concurrent !== undefined && input.max_concurrent <= 0) {
      throw new ValidationError('max_concurrent must be positive');
    }
    if (input.dag_timeout_ms !== undefined && input.dag_timeout_ms < 0) {
      throw new ValidationError('dag_timeout_ms must be non-negative');
    }
    if (input.agent_timeout_ms !== undefined && input.agent_timeout_ms < 0) {
      throw new ValidationError('agent_timeout_ms must be non-negative');
    }

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: ORCHESTRATION_CONFIG_TABLE },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    const current = (selOutput.row ?? {}) as Record<string, unknown>;

    this.config.max_concurrent = (current.max_concurrent as number) ?? this.config.max_concurrent;
    this.config.dag_timeout_ms = (current.dag_timeout_ms as number) ?? this.config.dag_timeout_ms;
    this.config.agent_timeout_ms = (current.agent_timeout_ms as number) ?? this.config.agent_timeout_ms;

    const data: DataObject[] = [];

    if (input.max_concurrent !== undefined) {
      this.config.max_concurrent = input.max_concurrent;
      data.push({ field: 'max_concurrent', value: input.max_concurrent });
    }
    if (input.dag_timeout_ms !== undefined) {
      this.config.dag_timeout_ms = input.dag_timeout_ms;
      data.push({ field: 'dag_timeout_ms', value: input.dag_timeout_ms });
    }
    if (input.agent_timeout_ms !== undefined) {
      this.config.agent_timeout_ms = input.agent_timeout_ms;
      data.push({ field: 'agent_timeout_ms', value: input.agent_timeout_ms });
    }

    if (data.length > 0) {
      const id = (current.id as string) || IdGenerator.generate();
      data.push({ field: 'id', value: id });
      data.push({ field: 'created', value: (current.created as number) || IdGenerator.now() });
      data.push({ field: 'updated', value: IdGenerator.now() });

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_CONFIG_TABLE,
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
    }

    output.config = { ...this.config };
    return true;
  }
}
