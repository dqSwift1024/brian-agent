/**
 * @fileoverview ToolProvider HTTP 接入层。
 *
 * 对外 HTTP 请求的统一入口。业务模块通过本类发起 HTTP 请求，
 * 不需要关心底层代理/超时逻辑。
 * 签名规范：`Boolean method(Input, Output, Context, Metrics, Report)`。
 *
 * 构造函数接受可选的 ConfigService，用于从 tool_config 表读取 http_timeout_ms 配置；
 * 未传入时使用默认超时 60s。
 */

import { HttpService } from '../application/HttpService';
import type { ConfigService } from '../../shared/config/ConfigService';
import type { HttpRequest, HttpContext, ExecRequestInput, ExecRequestOutput } from '../domain/HttpTypes';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

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
   */
  async execRequest(input: ExecRequestInput, output: ExecRequestOutput, _context: HttpContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const req: HttpRequest = {
      url: input.url,
      method: input.method,
      headers: input.headers,
      body: input.body,
      timeoutMs: input.timeout_ms,
      signal: input.signal,
    };
    output.response = await this.service.request(req);
    return true;
  }
}
