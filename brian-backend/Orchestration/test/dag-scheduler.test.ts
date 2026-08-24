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
});
