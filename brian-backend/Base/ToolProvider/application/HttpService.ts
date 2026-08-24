/**
 * @fileoverview ToolProvider HTTP 服务层。
 *
 * 统一对外 HTTP 请求的处理逻辑，包括：
 * 1. 代理支持（通过 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY 环境变量）
 * 2. 超时控制（timer + AbortController 双保险）
 * 3. 本地地址直连（localhost / 127.0.0.1 / ::1 / 0.0.0.0）
 * 4. 统一 Response 包装
 * 5. 可配置默认超时（通过 ConfigService 从 tool_config 表读取 http_timeout_ms）
 *
 * 业务模块通过 HttpAccess 调用本服务，不需要关心底层代理/超时细节。
 */

import http from 'node:http';
import https from 'node:https';
import type { HttpRequest, HttpResponse } from '../domain/HttpTypes';
import type { ConfigService } from '../../shared/config/ConfigService';

/** 默认超时 60 秒 */
const DEFAULT_TIMEOUT_MS = 60000;

/** Promise 一次性收敛回调：err 非空走 reject，否则以 value 走 resolve。 */
type ProxySettle = (err: Error | null, value?: HttpResponse) => void;

export class HttpService {
  private readonly config?: ConfigService;

  /**
   * @param config 可选的 ConfigService（指向 tool_config 表），用于读取 http_timeout_ms 配置
   */
  constructor(config?: ConfigService) {
    this.config = config;
  }

  /**
   * 获取当前默认超时时间（毫秒）。
   *
   * 优先级：请求级 timeoutMs > 配置中心 http_timeout_ms > 硬编码 60s
   */
  async getDefaultTimeout(): Promise<number> {
    if (this.config) {
      try {
        const configured = await this.config.getInt('http_timeout_ms', DEFAULT_TIMEOUT_MS);
        if (configured > 0) return configured;
      } catch {
        return DEFAULT_TIMEOUT_MS;
      }
    }
    return DEFAULT_TIMEOUT_MS;
  }

  /**
   * 发送 HTTP 请求。
   *
   * 业务模块封装好 HttpRequest（url / method / headers / body / timeoutMs / signal）
   * 后调用本方法，其余逻辑由本方法统一处理。
   */
  async request(req: HttpRequest): Promise<HttpResponse> {
    const timeoutMs = req.timeoutMs ?? await this.getDefaultTimeout();

    const proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      parsedUrl = new URL(req.url, 'http://localhost');
    }

    const isLocalhost =
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname === '0.0.0.0';

    if (!proxy || isLocalhost) {
      return this.directFetch(req, timeoutMs);
    }

    return this.proxyFetch(req, parsedUrl, proxy, timeoutMs);
  }

  /**
   * 直连请求（无代理或本地地址）。
   * 使用 Node.js 全局 fetch + AbortController 超时控制。
   */
  private async directFetch(req: HttpRequest, timeoutMs: number): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const signal = req.signal
      ? this.combineSignals(req.signal, controller.signal)
      : controller.signal;

    try {
      const res = await fetch(req.url, {
        method: req.method || 'GET',
        headers: req.headers,
        body: req.body,
        signal,
      });
      const bodyText = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: this.headersToRecord(res.headers),
        bodyText,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 代理请求（外部地址 + 代理环境变量）。
   *
   * 使用 https-proxy-agent / http-proxy-agent 库；agent 库不可用时降级为直连。
   * 关键保证：任何终止路径（超时 / abort / 连接错误 / 响应完成）都会调用 settle 收敛 Promise，
   * 避免「超时后既不 resolve 也不 reject」导致调用方永久挂起。
   */
  private proxyFetch(
    req: HttpRequest,
    parsedUrl: URL,
    proxy: string,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    return new Promise<HttpResponse>((resolve, reject) => {
      const settle = this.createProxySettle(resolve, reject);
      const agent = this.resolveProxyAgent(parsedUrl, proxy);
      const options = this.buildProxyOptions(parsedUrl, req, agent, timeoutMs);
      const clientReq = this.openProxyRequest(parsedUrl, options);
      const cleanup = this.armProxyTimeout(clientReq, req, timeoutMs, settle);
      this.attachProxyResponse(clientReq, cleanup, settle);
      this.sendProxyBody(clientReq, req);
    });
  }

  /** 构造一次性 settle 回调，保证 Promise 只被收敛一次。 */
  private createProxySettle(
    resolve: (v: HttpResponse) => void,
    reject: (e: Error) => void,
  ): ProxySettle {
    let settled = false;
    return (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value as HttpResponse);
    };
  }

  /** 解析 https/http 代理 agent；库不可用时返回 undefined（降级为直连）。 */
  private resolveProxyAgent(parsedUrl: URL, proxy: string): unknown {
    try {
      if (parsedUrl.protocol === 'https:') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { HttpsProxyAgent } = require('https-proxy-agent');
        return new HttpsProxyAgent(proxy);
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HttpProxyAgent } = require('http-proxy-agent');
      return new HttpProxyAgent(proxy);
    } catch {
      return undefined;
    }
  }

  /** 组装代理请求选项（含 socket 空闲超时与代理 agent）。 */
  private buildProxyOptions(
    parsedUrl: URL,
    req: HttpRequest,
    agent: unknown,
    timeoutMs: number,
  ): https.RequestOptions {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      if (v !== undefined) headers[k] = String(v);
    }
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: req.method || 'GET',
      headers,
      timeout: timeoutMs,
    };
    if (agent) options.agent = agent as https.RequestOptions['agent'];
    return options;
  }

  /** 建立底层 socket 请求（响应经 'response' 事件异步绑定）。 */
  private openProxyRequest(parsedUrl: URL, options: https.RequestOptions): http.ClientRequest {
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    return lib.request(options);
  }

  /** 挂载绝对超时定时器、socket 空闲超时与外部 abort 信号，返回清理函数。 */
  private armProxyTimeout(
    clientReq: http.ClientRequest,
    req: HttpRequest,
    timeoutMs: number,
    settle: ProxySettle,
  ): () => void {
    const timer = setTimeout(() => clientReq.destroy(this.timeoutError(timeoutMs)), timeoutMs);
    const cleanup = (): void => clearTimeout(timer);
    clientReq.on('timeout', () => clientReq.destroy(this.timeoutError(timeoutMs)));
    clientReq.on('error', (err) => {
      cleanup();
      settle(err instanceof Error ? err : new Error(String(err)));
    });
    req.signal?.addEventListener('abort', () => clientReq.destroy(new Error('Request aborted')));
    return cleanup;
  }

  /** 收集响应体并在 'end' 时收敛 Promise。 */
  private attachProxyResponse(
    clientReq: http.ClientRequest,
    cleanup: () => void,
    settle: ProxySettle,
  ): void {
    clientReq.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('error', (err) => {
        cleanup();
        settle(err instanceof Error ? err : new Error(String(err)));
      });
      res.on('end', () => {
        cleanup();
        settle(null, this.buildProxyHttpResponse(res, chunks));
      });
    });
  }

  /** 将原始响应包装为标准 HttpResponse。 */
  private buildProxyHttpResponse(res: http.IncomingMessage, chunks: Buffer[]): HttpResponse {
    const status = res.statusCode || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: res.statusMessage || '',
      headers: this.lowercaseHeaders(res.headers),
      bodyText: Buffer.concat(chunks).toString('utf-8'),
    };
  }

  /** 发送请求体并结束请求。 */
  private sendProxyBody(clientReq: http.ClientRequest, req: HttpRequest): void {
    if (req.body) {
      clientReq.write(typeof req.body === 'string' ? req.body : req.body.toString());
    }
    clientReq.end();
  }

  /** 构造超时错误。 */
  private timeoutError(timeoutMs: number): Error {
    return new Error(`Request timeout after ${timeoutMs}ms`);
  }

  private headersToRecord(h: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    h.forEach((v, k) => { result[k] = v; });
    return result;
  }

  private lowercaseHeaders(h: Record<string, string | string[] | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      if (v !== undefined) {
        result[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
      }
    }
    return result;
  }

  private combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    if (a.aborted || b.aborted) {
      return AbortSignal.abort();
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }
}