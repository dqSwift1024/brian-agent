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
   * 使用 https-proxy-agent / http-proxy-agent 库。
   * 若 agent 库不可用则降级为直连。
   */
  private proxyFetch(
    req: HttpRequest,
    parsedUrl: URL,
    proxy: string,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      let agent: any = undefined;
      try {
        if (isHttps) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { HttpsProxyAgent } = require('https-proxy-agent');
          agent = new HttpsProxyAgent(proxy);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { HttpProxyAgent } = require('http-proxy-agent');
          agent = new HttpProxyAgent(proxy);
        }
      } catch {
        // 缺少 agent 库时降级为直接直连
      }

      const headers: Record<string, string> = {};
      if (req.headers) {
        for (const [k, v] of Object.entries(req.headers)) {
          if (v !== undefined) headers[k] = String(v);
        }
      }

      const reqOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method || 'GET',
        headers,
        timeout: timeoutMs,
      };
      if (agent) {
        reqOptions.agent = agent;
      }

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          clientReq.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const clientReq = lib.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timer);
          const bodyBuffer = Buffer.concat(chunks);
          const bodyText = bodyBuffer.toString('utf-8');
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode || 200,
            statusText: res.statusMessage || '',
            headers: this.lowercaseHeaders(res.headers),
            bodyText,
          });
        });
      });

      clientReq.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      clientReq.on('timeout', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          clientReq.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      });

      if (req.signal) {
        req.signal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            clientReq.destroy(new Error('Request aborted'));
          }
        });
      }

      if (req.body) {
        clientReq.write(typeof req.body === 'string' ? req.body : req.body.toString());
      }
      clientReq.end();
    });
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