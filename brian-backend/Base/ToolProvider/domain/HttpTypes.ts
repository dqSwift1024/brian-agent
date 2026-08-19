/**
 * @fileoverview ToolProvider HTTP 请求/响应类型定义。
 *
 * 将对外 HTTP 请求统一收敛到 ToolProvider 模块中。
 * 业务模块封装请求体（body/headers），将封装后的消息提交给 HttpService，
 * HTTP 代理 / 超时 / 错误处理等逻辑由 HttpService 集中处理。
 */

/** HTTP 请求参数 */
export interface HttpRequest {
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（字符串或 Buffer） */
  body?: string | Buffer;
  /** 超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
  /** AbortSignal 用于外部取消 */
  signal?: AbortSignal;
}

/** HTTP 响应 */
export interface HttpResponse {
  /** 是否成功（状态码 2xx） */
  ok: boolean;
  /** HTTP 状态码 */
  status: number;
  /** 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 响应体文本 */
  bodyText: string;
}