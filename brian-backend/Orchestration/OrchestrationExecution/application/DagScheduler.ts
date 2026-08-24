import { HandleResultType, type Logger } from '@brian-agent/base';
import type { AgentNode, AgentEdge, AgentResult } from '../domain/types';

/**
 * 单节点执行结果（由调用方注入的执行器返回）。
 */
export interface DagNodeResult {
  answer: string;
  trace_id: string;
  iterations: number;
  elapsed_ms: number;
}

/**
 * 节点执行失败时抛出，触发 DAG 快速失败（fail-fast）。
 *
 * 保留 `agent_id` / `task_id` / `reason` / `completed_results` 字段，
 * 与 OrchestrationStrategy 层 `handleDAGFailure` 对抛错对象的读取契约兼容；
 * 同时继承 Error，保证 `instanceof Error` 与堆栈信息可用。
 */
export class DagNodeFailureError extends Error {
  readonly failed = true;

  constructor(
    readonly agent_id: string,
    readonly task_id: string,
    readonly reason: string,
    readonly failed_count: number,
    readonly completed_results: AgentResult[],
  ) {
    super(reason);
    this.name = 'DagNodeFailureError';
  }
}

/**
 * 调度器配置。
 */
export interface DagSchedulerConfig {
  /** 最大并发执行数（>=1）。 */
  concurrency: number;
  /** DAG 总超时时间（ms）。<=0 表示不限制。 */
  timeoutMs: number;
  /** 每完成一个节点后回调（completed = 累计完成数），用于进度落库 / 流式推送。 */
  onCompleted?: (completed: number, total: number) => Promise<void> | void;
  /** 超时后回调，接收所有尚未执行（也非失败）的节点，用于标记 CANCELLED。 */
  onCancelled?: (nodes: AgentNode[]) => Promise<void> | void;
  logger?: Logger;
}

/** 节点执行器：负责真正调用 Work Agent，返回其输出；失败时抛出 DagNodeFailureError。 */
export type DagNodeExecutor = (
  node: AgentNode,
  upstreamSummaries: string[],
) => Promise<DagNodeResult>;

export interface DagSchedulerOutput {
  /** 按完成顺序排列的执行结果（含 task_id，供上游层映射 completed_task_ids）。 */
  results: AgentResult[];
  failedCount: number;
  totalElapsedMs: number;
  timeoutReached: boolean;
}

/** 拓扑解析结果：以 task 级 key 建图。 */
interface DagTopology {
  adjList: Map<string, string[]>;
  incomingMap: Map<string, string[]>;
  indegree: Map<string, number>;
  nodeByKey: Map<string, AgentNode>;
}

/**
 * 任务级 DAG 调度器（参考 LangChain/LangGraph 的 Pregel 执行模型）。
 *
 * 设计要点：
 * 1. **拓扑键统一为 task 级**：节点以 task_id（缺失时回退 agent_id）作为唯一 key，
 *    边优先使用 from_task_id/to_task_id，缺失时按 agent_id → task_id 唯一映射回退。
 *    从根本上规避「多个 task 复用同一 Agent 时，agent 级边展开成环」的死锁问题。
 * 2. **Kahn 拓扑排序 + 有界并发 worker pool**：入度归零即入队，worker 数量受 concurrency
 *    限制，节点完成后实时释放下游，实现「尽快执行」而非严格分波（super-step）。
 * 3. **确定性**：就绪队列按 (priority, task_id) 稳定排序，保证相同输入下执行顺序可复现。
 * 4. **快速失败**：节点执行抛 DagNodeFailureError 时停止派发新节点，收敛已在进行中的节点后抛出。
 * 5. **高可用兜底**：若存在环导致就绪队列耗尽但仍有未执行节点，按确定性顺序打破环继续执行，
 *    绝不因数据异常而永久挂起。
 * 6. **超时控制**：总耗时超过 timeoutMs 时停止派发，剩余节点经 onCancelled 标记取消。
 *
 * 本类为纯逻辑，不触碰 DB / LLM，便于单元测试与复用。
 */
export class DagScheduler {
  /** 提取节点 key：task 级优先，缺失时回退 agent 级（兼容手工构造的 legacy DAG）。 */
  private nodeKey(node: AgentNode): string {
    return (node.task_id ?? '') || (node.agent_id ?? '');
  }

  /** 解析边的两个端点 key。 */
  private resolveEdge(
    edge: AgentEdge,
    agentToTask: Map<string, string>,
    logger?: Logger,
  ): { fromKey: string; toKey: string } | null {
    let fromKey = edge.from_task_id ?? '';
    let toKey = edge.to_task_id ?? '';

    if (!fromKey) fromKey = this.resolveAgentTask(edge.from_agent_id, agentToTask, logger, edge);
    if (!toKey) toKey = this.resolveAgentTask(edge.to_agent_id, agentToTask, logger, edge);

    if (!fromKey || !toKey) return null;
    if (fromKey === toKey) return null; // 自环边（task 级）直接忽略
    return { fromKey, toKey };
  }

  /**
   * 当边未携带 task 级信息时，按 agent_id 唯一映射回退。
   * 若一个 agent 复用多个 task 则无法精确还原 task 级拓扑，返回空字符串并告警（仅 legacy 数据会走到这里）。
   */
  private resolveAgentTask(
    agentId: string,
    agentToTask: Map<string, string>,
    logger?: Logger,
    edge?: AgentEdge,
  ): string {
    if (!agentId) return '';
    const taskId = agentToTask.get(agentId);
    if (!taskId) {
      logger?.debug('DagScheduler: 边引用未知 agent_id，已忽略', {
        from_agent_id: edge?.from_agent_id,
        to_agent_id: edge?.to_agent_id,
      });
    }
    return taskId ?? '';
  }

  private buildTopology(nodes: AgentNode[], edges: AgentEdge[], logger?: Logger): DagTopology {
    const adjList = new Map<string, string[]>();
    const incomingMap = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    const nodeByKey = new Map<string, AgentNode>();
    // 第一遍：统计每个 agent 覆盖的 task 数，用于精确构建 agent→task 唯一回退映射
    const agentTaskCount = new Map<string, number>();
    for (const node of nodes) {
      if (node.agent_id) {
        agentTaskCount.set(node.agent_id, (agentTaskCount.get(node.agent_id) ?? 0) + 1);
      }
    }
    const agentToTask = new Map<string, string>();

    for (const node of nodes) {
      const key = this.nodeKey(node);
      if (!key) continue;
      nodeByKey.set(key, node);
      adjList.set(key, []);
      incomingMap.set(key, []);
      indegree.set(key, 0);
      // 仅当 agent 唯一映射到单个 task 时才写入回退映射，避免复用场景下的歧义
      if (node.agent_id && agentTaskCount.get(node.agent_id) === 1) {
        agentToTask.set(node.agent_id, node.task_id ?? node.agent_id);
      }
    }

    for (const edge of edges) {
      const resolved = this.resolveEdge(edge, agentToTask, logger);
      if (!resolved) continue;
      const { fromKey, toKey } = resolved;

      const neighbors = adjList.get(fromKey);
      if (neighbors && !neighbors.includes(toKey)) {
        neighbors.push(toKey);
        indegree.set(toKey, (indegree.get(toKey) ?? 0) + 1);
      }
      const parents = incomingMap.get(toKey);
      if (parents && !parents.includes(fromKey)) {
        parents.push(fromKey);
      }
    }

    return { adjList, incomingMap, indegree, nodeByKey };
  }

  /** 确定性排序：priority 升序，同优先级按 task_id 字典序。 */
  private byPriority(a: AgentNode, b: AgentNode): number {
    const pa = a.task_priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.task_priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return this.nodeKey(a).localeCompare(this.nodeKey(b));
  }

  /** 收集某节点的直接上游输出摘要（串行模式下用于上下文注入）。 */
  private collectUpstream(node: AgentNode, topo: DagTopology, outputs: Map<string, string>): string[] {
    const parents = topo.incomingMap.get(this.nodeKey(node)) ?? [];
    const summaries: string[] = [];
    for (const pKey of parents) {
      const out = outputs.get(pKey);
      if (out) summaries.push(out.slice(0, 500));
    }
    return summaries;
  }

  async run(
    nodes: AgentNode[],
    edges: AgentEdge[],
    executor: DagNodeExecutor,
    config: DagSchedulerConfig,
  ): Promise<DagSchedulerOutput> {
    const concurrency = Math.max(1, config.concurrency);
    const timeoutMs = config.timeoutMs;
    const total = nodes.length;
    const startedAt = Date.now();

    const topo = this.buildTopology(nodes, edges, config.logger);
    const { adjList, incomingMap, indegree, nodeByKey } = topo;

    const outputs = new Map<string, string>();
    const results: AgentResult[] = [];
    let failedCount = 0;
    let completed = 0;
    let timedOut = false;
    let failure: DagNodeFailureError | null = null;

    const ready: AgentNode[] = [];
    const queued = new Set<string>();
    for (const node of nodes) {
      const key = this.nodeKey(node);
      if (!key) continue;
      if ((indegree.get(key) ?? 0) === 0 && !queued.has(key)) {
        queued.add(key);
        ready.push(node);
      }
    }
    ready.sort((a, b) => this.byPriority(a, b));

    const runNode = async (node: AgentNode): Promise<void> => {
      const key = this.nodeKey(node);

      // 超时控制：不再派发新节点
      if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) {
        timedOut = true;
        return;
      }

      // 串行模式下，将上游输出摘要注入下游任务内容
      const upstreamSummaries = concurrency === 1 ? this.collectUpstream(node, topo, outputs) : [];

      let result: DagNodeResult;
      try {
        result = await executor(node, upstreamSummaries);
      } catch (err: unknown) {
        failedCount++;
        if (!failure) {
          // 统一由调度器构造权威失败信息：failed_count 与 completed_results 以调度器内部状态为准
          if (err instanceof DagNodeFailureError) {
            failure = new DagNodeFailureError(
              err.agent_id || node.agent_id,
              err.task_id || node.task_id,
              err.reason,
              failedCount,
              results.slice(),
            );
          } else {
            failure = new DagNodeFailureError(
              node.agent_id,
              node.task_id,
              err instanceof Error ? err.message : String(err),
              failedCount,
              results.slice(),
            );
          }
        }
        return;
      }

      outputs.set(key, result.answer);
      results.push({
        agent_id: node.agent_id,
        task_id: node.task_id,
        answer: result.answer,
        trace_id: result.trace_id,
        iterations: result.iterations,
        elapsed_ms: result.elapsed_ms,
        status: 'COMPLETED',
        handle_result_type: HandleResultType.CORRECT,
      });
      completed++;
      await config.onCompleted?.(completed, total);

      // 释放下游依赖
      for (const downKey of adjList.get(key) ?? []) {
        const deg = (indegree.get(downKey) ?? 1) - 1;
        indegree.set(downKey, deg);
        if (deg === 0) {
          const downNode = nodeByKey.get(downKey);
          if (downNode && !queued.has(downKey)) {
            queued.add(downKey);
            ready.push(downNode);
          }
        }
      }
    };

    const runner = async (): Promise<void> => {
      // 快速失败：一旦有失败，不再派发新节点
      while (!failure && !timedOut) {
        const node = ready.shift();
        if (!node) return;
        await runNode(node);
      }
    };

    const runnerCount = Math.max(1, Math.min(concurrency, total));
    await Promise.all(Array.from({ length: runnerCount }, () => runner()));

    // 环兜底：就绪队列耗尽但仍有节点未执行（拓扑存在环），按确定性顺序打破环继续执行。
    while (!failure && !timedOut && completed + failedCount < total) {
      const remaining = nodes.filter((n) => {
        const key = this.nodeKey(n);
        return key && !outputs.has(key) && !queued.has(key);
      });
      if (remaining.length === 0) break;
      config.logger?.debug('DagScheduler: 检测到任务级环依赖，按确定性顺序打破环继续执行', {
        remaining: remaining.length,
      });
      for (const node of remaining) {
        queued.add(this.nodeKey(node));
        ready.push(node);
      }
      ready.sort((a, b) => this.byPriority(a, b));
      // 逐节点串行执行打破环，避免再次并发陷入依赖死锁
      const breaker = async (): Promise<void> => {
        while (!failure && !timedOut) {
          const node = ready.shift();
          if (!node) return;
          await runNode(node);
        }
      };
      await Promise.all(Array.from({ length: runnerCount }, () => breaker()));
    }

    // 超时：剩余未执行节点标记取消
    if (timedOut) {
      const cancelled = nodes.filter((n) => {
        const key = this.nodeKey(n);
        return key && !outputs.has(key);
      });
      await config.onCancelled?.(cancelled);
    }

    if (failure) throw failure;

    return {
      results,
      failedCount,
      totalElapsedMs: Date.now() - startedAt,
      timeoutReached: timedOut,
    };
  }
}
