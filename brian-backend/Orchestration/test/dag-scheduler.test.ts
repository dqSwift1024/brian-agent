/**
 * @fileoverview DagScheduler 节点级超时回归测试。
 *
 * 重点覆盖：单节点挂起时 nodeTimeoutMs 必须快速失败（抛 DagNodeFailureError），
 * 绝不能无限等待；<=0 时保持不限制的原有行为。
 */

import { describe, it, expect } from 'vitest';
import { DagScheduler, DagNodeFailureError, type DagNodeExecutor } from '../OrchestrationExecution/application/DagScheduler';
import type { AgentNode, AgentEdge } from '../OrchestrationExecution/domain/types';

function makeNode(agentId: string, taskId: string): AgentNode {
  return {
    agent_id: agentId,
    task_id: taskId,
    task_content: `task ${taskId}`,
    status: 'PENDING',
    node_kind: 'LEAF',
  };
}

const okExecutor: DagNodeExecutor = async () => ({
  answer: 'ok', trace_id: 'tr', iterations: 1, elapsed_ms: 0,
});

describe('DagScheduler 节点超时', () => {
  it('单节点挂起时应按 nodeTimeoutMs 快速失败', async () => {
    const scheduler = new DagScheduler();
    const nodes = [makeNode('a1', 't1')];
    const edges: AgentEdge[] = [];
    const hanging: DagNodeExecutor = () => new Promise(() => { /* 永不返回 */ });

    await expect(
      scheduler.run(nodes, edges, hanging, { concurrency: 1, timeoutMs: 0, nodeTimeoutMs: 100 }),
    ).rejects.toThrow(DagNodeFailureError);
  });

  it('nodeTimeoutMs=0 时不限制，正常完成', async () => {
    const scheduler = new DagScheduler();
    const out = await scheduler.run(
      [makeNode('a1', 't1')], [], okExecutor,
      { concurrency: 1, timeoutMs: 0, nodeTimeoutMs: 0 },
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].answer).toBe('ok');
  });

  it('节点在超时前完成则正常返回', async () => {
    const scheduler = new DagScheduler();
    const slowOk: DagNodeExecutor = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { answer: 'ok', trace_id: 'tr', iterations: 1, elapsed_ms: 50 };
    };
    const out = await scheduler.run(
      [makeNode('a1', 't1')], [], slowOk,
      { concurrency: 1, timeoutMs: 0, nodeTimeoutMs: 500 },
    );
    expect(out.results).toHaveLength(1);
  });

  it('并发节点中一个失败、另一个挂起时应立即快速失败（不等挂起节点）', async () => {
    const scheduler = new DagScheduler();
    const nodes = [makeNode('a1', 't1'), makeNode('a2', 't2')];
    const edges: AgentEdge[] = [];
    const executor: DagNodeExecutor = async (node) => {
      if (node.task_id === 't1') {
        throw new DagNodeFailureError('a1', 't1', 'boom', 1, []);
      }
      // t2 永不返回，模拟执行中的并发节点卡死
      return new Promise(() => { /* 永不返回 */ });
    };
    const startedAt = Date.now();
    await expect(
      scheduler.run(nodes, edges, executor, { concurrency: 2, timeoutMs: 0, nodeTimeoutMs: 10000 }),
    ).rejects.toThrow(DagNodeFailureError);
    // 快速失败：应在远小于 nodeTimeoutMs 的时间内收敛，而非等待挂起节点超时
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
