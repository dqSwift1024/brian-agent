/**
 * @fileoverview ToolProvider HTTP 接入层。
 *
 * 作为对外 HTTP 请求的统一入口。
 * 业务模块通过本类发起 HTTP 请求，不需要关心底层代理/超时逻辑。
 *
 * 构造函数接受可选的 ConfigService，用于从 tool_config 表读取 http_timeout_ms 配置。
 * 若未传入 ConfigService，使用默认超时 60s。
 *
 * 用法示例：
 * ```typescript
 * import { HttpAccess, ConfigService } from '@brian-agent/base';
 * const http = new HttpAccess(configService);
 * const res = await http.request({ url: 'https://api.example.com', method: 'GET' });
 * ```
 */

import { HttpService } from '../application/HttpService';
import type { ConfigService } from '../../shared/config/ConfigService';
import type { HttpRequest, HttpResponse } from '../domain/HttpTypes';

export class HttpAccess {
  private readonly service: HttpService;

  /**
   * @param config 可选的 ConfigService（指向 tool_config 表），用于读取 http_timeout_ms 配置
   */
  constructor(config?: ConfigService) {
    this.service = new HttpService(config);
  }

  /**
   * 发送 HTTP 请求。
   *
   * @param req 封装好的请求参数（url / method / headers / body / timeoutMs / signal）
   * @returns 统一格式的响应
   */
  async request(req: HttpRequest): Promise<HttpResponse> {
    return this.service.request(req);
  }
}