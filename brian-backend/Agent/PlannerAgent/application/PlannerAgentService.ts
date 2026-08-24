import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  InfoType,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
  type DataObject,
} from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext,
  MatchLLMInput, MatchLLMOutput, LLMCoreContext,
} from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE,
  type PlannerAgentConfigRecord, type AgentPlanRecord,
  PlannerAgentContext,
  PlanInput, PlanOutput,
  PlanHierarchicalInput, PlanHierarchicalOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
  type PlanTaskNode, type PlanTaskEdge, type PlanTaskDAG,
} from '../domain/types';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { parseJsonObject, formatContextCategories } from '../../shared/signature';

type TaskDag = PlanTaskDAG;

/** 递归拆解最大深度（在 LLM 单次层级拆解基础上额外递归，防止无限拆解） */
const MAX_DECOMPOSE_DEPTH = 2;

/** 单次拆解的完整上下文（LLM 绑定、阈值、上限等），供 plan / planHierarchical 复用 */
interface PlanDecomposeContext {
  dag: TaskDag;
  threshold: number;
  maxSub: number;
  llmId: string;
  soulId: string;
  promptId: string;
  contextExtra: string;
}

function mapPlan(row: Record<string, unknown>): AgentPlanRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    plan_id: String(row.plan_id),
    work_id: String(row.work_id),
    interact_id: String(row.interact_id),
    task_dag: String(row.task_dag),
    parent_plan_id: String(row.parent_plan_id ?? ''),
  };
}

export class PlannerAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly llmCore?: LLMCoreAccess,
  ) {}

  async plan(input: PlanInput, ctx: PlannerAgentContext, output: PlanOutput): Promise<boolean> {
    const planCtx = await this.decomposeOnce(input, ctx);
    output.plan_id = await this.persistPlan(planCtx.dag, input.work_id, input.interact_id, ctx, '');
    output.task_dag = planCtx.dag;
    return true;
  }

  /**
   * 层级规划：LLM 单次产出层级 DAG 后，对仍复杂（complexity >= threshold）的叶子任务
   * 递归调用 LLM 继续拆解，直到所有叶子任务为「小任务」或达到最大深度。
   */
  async planHierarchical(
    input: PlanHierarchicalInput,
    ctx: PlannerAgentContext,
    output: PlanHierarchicalOutput,
  ): Promise<boolean> {
    const planCtx = await this.decomposeOnce(input, ctx);
    const maxDepth = input.max_depth ?? MAX_DECOMPOSE_DEPTH;
    const dag = await this.expandComplexLeaves(planCtx.dag, planCtx, maxDepth);
    this.validateDag(dag, planCtx.maxSub * 4);
    output.plan_id = await this.persistPlan(dag, input.work_id, input.interact_id, ctx, '');
    output.task_dag = dag;
    return true;
  }

  /** 解析 PlannerAgent、配置、上下文与 LLM 绑定，并执行一次拆解。 */
  private async decomposeOnce(input: PlanInput, ctx: PlannerAgentContext): Promise<PlanDecomposeContext> {
    const agent = await this.resolvePlannerAgent(ctx, input);
    const config = await this.getConfig();
    const threshold = config?.complexity_decompose_threshold ?? 50;
    const maxSub = config?.max_subtask_count ?? 10;
    const contextExtra = await this.buildPlanContext(ctx, input);
    const llmId = await this.resolvePlanLlmId(agent, config);
    const params = { llmId, soulId: agent?.soul_id || '', promptId: config?.plan_prompt_template_id || '', maxSub, threshold };
    const dag = await this.decomposeTask(input.task_content, contextExtra, params);
    return { dag, threshold, maxSub, llmId: params.llmId, soulId: params.soulId, promptId: params.promptId, contextExtra };
  }

  /** 构建 PlannerAgent（存在则复用）并返回其完整配置。 */
  private async resolvePlannerAgent(ctx: PlannerAgentContext, input: PlanInput) {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'PLANNER' }), builderCtx, buildOut);
    if (!buildOut.agent_id) throw new ValidationError('buildPlannerAgent failed');

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      Object.assign(new AgentLibraryContext(), builderCtx),
      getOut,
    );
    const agent = getOut.agents[0];
    if (!agent) throw new NotFoundError('PlannerAgent', buildOut.agent_id);
    return agent;
  }

  /** 构建规划上下文（结构化分类包裹），失败时返回空串。 */
  private async buildPlanContext(ctx: PlannerAgentContext, input: PlanInput): Promise<string> {
    if (!ctx.session_id) return '';
    try {
      const ctxOut = new ContextInfoOutput();
      await this.infoCore.context(
        Object.assign(new ContextInfoInput(), {
          session_id: ctx.session_id,
          work_id: ctx.work_id || '',
          selected_msg_ids: ctx.selected_msg_ids,
          info: input.task_content,
          persist_snapshot: false,
        }),
        new InfoCoreContext(),
        ctxOut,
      );
      return formatContextCategories(ctxOut);
    } catch {
      return '';
    }
  }

  /** 解析 Planner 绑定的 LLM：配置优先，其次经 Core.matchLLM 解析。 */
  private async resolvePlanLlmId(agent: { agent_id?: string }, config: PlannerAgentConfigRecord | null): Promise<string> {
    if (config?.llm_id) return config.llm_id;
    if (agent?.agent_id && this.llmCore) return await this.resolveLlm(agent.agent_id);
    return '';
  }

  /** 执行一次拆解；LLM 失败时降级为单节点 DAG。 */
  private async decomposeTask(
    task: string,
    contextExtra: string,
    params: { llmId: string; soulId: string; promptId: string; maxSub: number },
  ): Promise<TaskDag> {
    const dag = await this.llmPlan(params.llmId, params.soulId, params.promptId, task, contextExtra, params.maxSub);
    if (dag) return dag;
    return this.singleNodeDag(task, this.estimateComplexity(task));
  }

  /** 落库规划并写 InfoCore 记录，返回 plan_id。 */
  private async persistPlan(
    dag: TaskDag,
    workId: string,
    interactId: string,
    ctx: PlannerAgentContext,
    parentPlanId: string,
  ): Promise<string> {
    const planId = IdGenerator.generate();
    await this.insertPlan(planId, workId, interactId, dag, parentPlanId);
    await this.savePlanInfo(ctx, workId, interactId, planId, dag);
    return planId;
  }

  /** 递归拆解：对仍复杂的叶子任务继续调用 LLM 拆解，父任务汇总子任务结果。 */
  private async expandComplexLeaves(dag: TaskDag, planCtx: PlanDecomposeContext, depth: number): Promise<TaskDag> {
    if (depth <= 0) return dag;
    const childMap = this.buildChildMap(dag.nodes);
    const nodes: PlanTaskNode[] = [];
    const edges: PlanTaskEdge[] = [...dag.edges];
    for (const node of dag.nodes) {
      if (this.hasChildren(node.task_id, childMap) || node.task_complexity < planCtx.threshold) {
        nodes.push(node);
      } else {
        await this.decomposeLeaf(node, planCtx, depth, nodes, edges);
      }
    }
    return { nodes, edges };
  }

  /** 拆解单个复杂叶子：当前节点转为父任务，其子任务挂载为新的叶子节点。 */
  private async decomposeLeaf(
    node: PlanTaskNode,
    planCtx: PlanDecomposeContext,
    depth: number,
    nodes: PlanTaskNode[],
    edges: PlanTaskEdge[],
  ): Promise<void> {
    const subDag = await this.llmPlan(planCtx.llmId, planCtx.soulId, planCtx.promptId, node.task_content, planCtx.contextExtra, planCtx.maxSub);
    if (!subDag || subDag.nodes.length <= 1) {
      nodes.push(node);
      return;
    }
    const root = this.findRoot(subDag.nodes);
    const children = this.findChildren(subDag.nodes, root?.task_id);
    const renamed = children.map((c) => ({ ...c, task_id: IdGenerator.generate(), parent_task_id: node.task_id }));
    nodes.push({ ...node, task_content: root?.task_content ?? node.task_content, dependencies: renamed.map((c) => c.task_id) });
    for (const child of renamed) {
      edges.push({ from_task_id: child.task_id, to_task_id: node.task_id });
      await this.decomposeLeaf(child, planCtx, depth - 1, nodes, edges);
    }
  }

  private buildChildMap(nodes: PlanTaskNode[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const n of nodes) {
      if (!n.parent_task_id) continue;
      const list = map.get(n.parent_task_id) ?? [];
      list.push(n.task_id);
      map.set(n.parent_task_id, list);
    }
    return map;
  }

  private hasChildren(taskId: string, childMap: Map<string, string[]>): boolean {
    return (childMap.get(taskId)?.length ?? 0) > 0;
  }

  private findRoot(nodes: PlanTaskNode[]): PlanTaskNode | undefined {
    return nodes.find((n) => !n.parent_task_id);
  }

  private findChildren(nodes: PlanTaskNode[], rootId?: string): PlanTaskNode[] {
    if (rootId) {
      const direct = nodes.filter((n) => n.parent_task_id === rootId);
      if (direct.length > 0) return direct;
    }
    return nodes.filter((n) => n.parent_task_id);
  }

  /**
   * 最大允许的 REPLAN parent 链深度（硬上限，防止无限递归重规划）。
   *
   * 说明：
   * - 每次 replan 会把新 plan 的 parent_plan_id 指向旧 plan，形成链式链表；
   * - handleDAGFailure 在达到 max_plan_retries（默认 2 次）时本就会终止，
   *   但为了防止上层代码误用（重复调用 replan 而不推进 plan_retry_count），
   *   此处再增加一层全局限流保护，<= 4 层时始终允许，超过即拒绝。
   * - 该值为代码常量，不影响现有配置和测试。
   */
  private static readonly MAX_TOTAL_REPLAN_DEPTH = 4;

  async replan(input: ReplanInput, ctx: PlannerAgentContext, output: ReplanOutput): Promise<boolean> {
    const row = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
      { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
    ]);
    if (!row) throw new NotFoundError('Plan', input.plan_id);
    const old = mapPlan(row);

    // ===== 新增：parent_plan_id 链深度检查，防止无限递归 =====
    let depth = 0;
    let cursor: string | null = old.parent_plan_id || null;
    while (cursor) {
      depth++;
      if (depth > PlannerAgentService.MAX_TOTAL_REPLAN_DEPTH) {
        throw new ValidationError(
          `REPLAN 递归深度超过上限 (${PlannerAgentService.MAX_TOTAL_REPLAN_DEPTH})，已强制终止以防止无限循环。请检查 Planner 输出是否产生了相同的失败任务。`,
        );
      }
      const parentRow = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
        { field: 'plan_id', operator: Operator.EQ, value: cursor },
      ]);
      cursor = parentRow?.parent_plan_id ? String(parentRow.parent_plan_id) : null;
    }
    // ===== 深度检查结束 =====

    const oldDag = JSON.parse(old.task_dag) as TaskDag;
    const completed = new Set(input.completed_task_ids ?? []);

    let remainingNodes = oldDag.nodes.filter((n) => !completed.has(n.task_id));
    // 失败任务重写内容
    remainingNodes = remainingNodes.map((n) => {
      if (n.task_id === input.failed_task_id) {
        return {
          ...n,
          task_content: `${n.task_content}\n[RETRY after failure: ${input.failure_reason}]`,
        };
      }
      return n;
    });
    const remainingIds = new Set(remainingNodes.map((n) => n.task_id));
    const edges = oldDag.edges.filter(
      (e) => remainingIds.has(e.from_task_id) && remainingIds.has(e.to_task_id),
    );
    const newDag: TaskDag = { nodes: remainingNodes, edges };
    this.validateDag(newDag, 100);

    const newPlanId = IdGenerator.generate();
    await this.insertPlan(newPlanId, old.work_id, old.interact_id, newDag, input.plan_id);
    await this.savePlanInfo(ctx, old.work_id, old.interact_id, newPlanId, newDag);

    output.new_plan_id = newPlanId;
    output.task_dag = newDag;
    return true;
  }

  async getPlan(input: GetPlanInput, _ctx: PlannerAgentContext, output: GetPlanOutput): Promise<boolean> {
    if (input.plan_id) {
      const row = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
        { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
      ]);
      output.plans = row ? [mapPlan(row)] : [];
      return true;
    }
    if (input.work_id) {
      const rows = await this.relationDb.select(AGENT_PLAN_TABLE, {
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      });
      output.plans = rows.map(mapPlan);
      return true;
    }
    output.plans = [];
    return true;
  }

  async configPlannerAgent(
    input: ConfigPlannerAgentInput,
    _ctx: PlannerAgentContext,
    output: ConfigPlannerAgentOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(PLANNER_AGENT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'complexity_decompose_threshold', value: 50 },
        { field: 'plan_prompt_template_id', value: '' },
        { field: 'max_subtask_count', value: 10 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.complexity_decompose_threshold !== undefined) {
      if (input.complexity_decompose_threshold < 0 || input.complexity_decompose_threshold > 100) {
        throw new ValidationError('complexity_decompose_threshold 必须在 0-100');
      }
      data.push({ field: 'complexity_decompose_threshold', value: input.complexity_decompose_threshold });
    }
    if (input.plan_prompt_template_id !== undefined) {
      if (input.plan_prompt_template_id) await this.assertPrompt(input.plan_prompt_template_id);
      data.push({ field: 'plan_prompt_template_id', value: input.plan_prompt_template_id });
    }
    if (input.max_subtask_count !== undefined) {
      if (!Number.isInteger(input.max_subtask_count) || input.max_subtask_count <= 0) {
        throw new ValidationError('max_subtask_count 必须为正整数');
      }
      data.push({ field: 'max_subtask_count', value: input.max_subtask_count });
    }
    if (input.llm_id !== undefined) {
      data.push({ field: 'llm_id', value: input.llm_id || null });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        PLANNER_AGENT_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private async llmPlan(
    llmId: string,
    soulId: string,
    promptId: string,
    task: string,
    contextExtra: string,
    maxSub: number,
  ): Promise<TaskDag | null> {
    try {
      const system = '';
      const prompt = await this.renderPrompt(
        promptId,
        PROMPT_IDS.planner,
        {
          task_content: task,
          context_data: contextExtra,
          max_subtask_count: maxSub,
          soul: soulId,
        },
      );

      const llmOut = new ExecLLMOutput();
      const ok = await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          ...(system ? { system } : {}),
        }),
        new LLMContext(),
        llmOut,
      );
      if (!ok || !llmOut.result) return null;

      const parsed = parseJsonObject(llmOut.result);
      if (!parsed) return null;
      const nodes = (parsed.nodes as TaskDag['nodes']) ?? [];
      const edges = (parsed.edges as TaskDag['edges']) ?? [];
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      // 补全 task_id / parent_task_id / dependencies，保证后续层级与执行依赖计算稳定
      for (const n of nodes) {
        if (!n.task_id) n.task_id = IdGenerator.generate();
        if (!n.dependencies) n.dependencies = [];
        if (n.parent_task_id === undefined || n.parent_task_id === null) n.parent_task_id = '';
      }
      return { nodes, edges };
    } catch {
      return null;
    }
  }

  private singleNodeDag(task: string, complexity: number): TaskDag {
    const taskId = IdGenerator.generate();
    return {
      nodes: [{
        task_id: taskId,
        task_content: task,
        task_complexity: complexity,
        task_domain: '',
        priority: 1,
        dependencies: [],
      }],
      edges: [],
    };
  }

  private validateDag(dag: TaskDag, maxSub: number): void {
    if (!dag.nodes?.length) throw new ValidationError('task_dag.nodes 不能为空');
    if (dag.nodes.length > maxSub) throw new ValidationError(`子任务数超过 max_subtask_count=${maxSub}`);
    const ids = dag.nodes.map((n) => n.task_id);
    if (new Set(ids).size !== ids.length) throw new ValidationError('task_id 必须唯一');
    const idSet = new Set(ids);
    for (const e of dag.edges ?? []) {
      if (!idSet.has(e.from_task_id) || !idSet.has(e.to_task_id)) {
        throw new ValidationError('edge 引用了不存在的 task_id');
      }
    }
    // 简单环检测
    const adj = new Map<string, string[]>();
    for (const id of ids) adj.set(id, []);
    for (const e of dag.edges ?? []) adj.get(e.from_task_id)!.push(e.to_task_id);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (u: string): boolean => {
      if (visiting.has(u)) return true;
      if (visited.has(u)) return false;
      visiting.add(u);
      for (const v of adj.get(u) ?? []) {
        if (dfs(v)) return true;
      }
      visiting.delete(u);
      visited.add(u);
      return false;
    };
    for (const id of ids) {
      if (dfs(id)) throw new ValidationError('task_dag 存在环');
    }
  }

  private async insertPlan(
    planId: string,
    workId: string,
    interactId: string,
    dag: TaskDag,
    parentPlanId: string,
  ): Promise<void> {
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_PLAN_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'plan_id', value: planId },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: interactId },
      { field: 'task_dag', value: JSON.stringify({ ...dag, total_task_count: dag.nodes.length }) },
      { field: 'parent_plan_id', value: parentPlanId },
    ]);
  }

  private async savePlanInfo(
    ctx: PlannerAgentContext,
    workId: string,
    interactId: string,
    planId: string,
    dag: TaskDag,
  ): Promise<void> {
    if (!ctx.session_id) return;
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: ctx.session_id,
          work_id: workId,
          interact_id: interactId,
          info_type: InfoType.ACT,
          info_creator_role: 'AGENT',
          info_creator_id: planId,
          info: JSON.stringify(dag),
        }),
        new InfoCoreContext(),
        new SaveInfoOutput(),
      );
    } catch { /* best-effort */ }
  }

  private async assertPrompt(id: string): Promise<void> {
    const out = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), {
        conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      }),
      new PromptContext(),
      out,
    );
    if (!out.list?.length) throw new ValidationError(`prompt_template_id 不存在: ${id}`);
  }

  /**
   * 渲染 Prompt：配置模板 → 内置模板 → 内存兜底。
   */
  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const id = templateId || builtinId;
    try {
      const promptOut = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), { id, variables }),
        new PromptContext(),
        promptOut,
      );
      if (promptOut.prompt) return promptOut.prompt;
    } catch { /* use fallback prompt */ }
    const tpl = getBuiltinTemplate(builtinId);
    return tpl ? renderTemplate(tpl, variables) : '';
  }

  /**
   * 通过 Core.matchLLM 解析 PlannerAgent 绑定的 LLM（agent_llm）。
   */
  private async resolveLlm(agentId: string): Promise<string> {
    try {
      const llmOut = new MatchLLMOutput();
      await this.llmCore?.matchLLM(
        Object.assign(new MatchLLMInput(), { agent_id: agentId }),
        new LLMCoreContext(),
        llmOut,
      );
      return llmOut.llm_id || '';
    } catch {
      return '';
    }
  }

  private async getConfig(): Promise<PlannerAgentConfigRecord | null> {
    const row = await this.relationDb.selectOne(PLANNER_AGENT_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      complexity_decompose_threshold: Number(row.complexity_decompose_threshold ?? 50),
      plan_prompt_template_id: String(row.plan_prompt_template_id ?? ''),
      max_subtask_count: Number(row.max_subtask_count ?? 10),
      llm_id: (row.llm_id as string) || null,
    };
  }

  private estimateComplexity(task: string): number {
    const len = task.length;
    if (len < 50) return 20;
    if (len < 200) return 45;
    return 70;
  }
}
