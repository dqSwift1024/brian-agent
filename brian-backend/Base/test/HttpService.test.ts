/**
 * @fileoverview HttpService 超时/取消回归测试。
 *
 * 重点覆盖：代理路径下请求超时/被取消时必须 reject，绝不能既不 resolve 也不 reject
 * （历史 bug：proxyFetch 超时只 destroy 不 reject，导致调用方永久挂起）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpAccess, ExecRequestInput, ExecRequestOutput, HttpContext } from '../ToolProvider';

const PROXY_KEYS = [
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy',
];

function clearProxyEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of PROXY_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return saved;
}

function restoreProxyEnv(saved: Record<string, string | undefined>): void {
  for (const k of PROXY_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

/** 启动一个接受连接但永不响应的「挂起」服务器，用于模拟超时场景。 */
async function startHangingServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(() => { /* 故意不响应 */ });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('HttpService 超时/取消回归', () => {
  const savedEnv = clearProxyEnv();
  afterEach(() => restoreProxyEnv(savedEnv));

  it('代理请求超时应 reject 而非永久挂起', async () => {
    const hanging = await startHangingServer();
    process.env.HTTP_PROXY = `http://127.0.0.1:${hanging.port}`;
    const httpSvc = new HttpAccess();
    const started = Date.now();
    try {
      await expect(
        httpSvc.execRequest(Object.assign(new ExecRequestInput(), { url: 'http://example.com/test', method: 'GET', timeout_ms: 200 }), new ExecRequestOutput(), new HttpContext()),
      ).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await hanging.close();
    }
  });

  it('代理请求被 abort 时应 reject', async () => {
    const hanging = await startHangingServer();
    process.env.HTTP_PROXY = `http://127.0.0.1:${hanging.port}`;
    const httpSvc = new HttpAccess();
    const controller = new AbortController();
    const pending = httpSvc.execRequest(
      Object.assign(new ExecRequestInput(), { url: 'http://example.com/test', method: 'GET', timeout_ms: 5000, signal: controller.signal }),
      new ExecRequestOutput(),
      new HttpContext(),
    );
    controller.abort();
    try {
      await expect(pending).rejects.toThrow();
    } finally {
      await hanging.close();
    }
  });

  it('直连（本地）超时应 reject', async () => {
    const hanging = await startHangingServer();
    const httpSvc = new HttpAccess();
    const started = Date.now();
    try {
      await expect(
        httpSvc.execRequest(Object.assign(new ExecRequestInput(), { url: `http://127.0.0.1:${hanging.port}/test`, method: 'GET', timeout_ms: 200 }), new ExecRequestOutput(), new HttpContext()),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await hanging.close();
    }
  });
});
