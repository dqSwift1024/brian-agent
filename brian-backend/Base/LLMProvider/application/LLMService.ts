/**
 * @fileoverview LLMProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw / queryRaw）操作关系数据库，
 * 依赖 ConfigService 管理 llm_config 配置表。
 *
 * 实现所有用例：addLLMProvider / updateLLMProvider / delLLMProvider / soLLMProvider /
 * testLLMProvider / listLLM / addLLM / delLLM / updateLLM / soLLM / execLLM /
 * visualizedLLM / enableLLM。
 *
 * LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API。
 * 对外 API 调用采用 OpenAI 兼容协议（/v1/models、/v1/chat/completions），
 * 通过 Node.js 全局 fetch 实现。
 */

import http from 'node:http';
import https from 'node:https';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator, Logic, Direction } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import {
  LLMContext,
  LLMProviderData,
  LLMData,
  LLMProviderRecord,
  LLMCacheRecord,
  LLMAvailableRecord,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
  LLM_PROVIDER_TABLE,
  LLM_CACHE_TABLE,
  LLM_AVAILABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CONFIG_TABLE,
} from '../domain/types';
import { LLMStrategyFactory } from './strategies';

/** testLLMProvider 默认连接超时时间（毫秒） */
const TEST_TIMEOUT_MS = 10000;

/** listLLM 默认请求超时时间（毫秒） */
const LIST_TIMEOUT_MS = 30000;

/** 模型列表缓存有效期（毫秒），默认 1 小时 */
const MODELS_CACHE_TTL_MS = 3600000;

/** execLLM 默认请求超时时间（毫秒） */
const EXEC_TIMEOUT_MS = 120000;

/** OpenAI 兼容 API 路径：模型列表 */
const MODELS_PATH = 'v1/models';

/** OpenAI 兼容 API 路径：对话补全 */
const CHAT_PATH = 'v1/chat/completions';

/** OpenAI 兼容 API 路径：向量化（embedding） */
const EMBED_PATH = 'v1/embeddings';

/**
 * LLMProvider 应用服务。
 *
 * LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API。
 * LLM 数据与配置项均存储于关系数据库（由 RelationDBProvider 管理）。
 */
export class LLMService {
  /** 运行时内存中的启用状态，供各操作快速校验 */
  private enabled = true;

  /** 是否已执行 closeLLM（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   * @param logger 可选日志记录器
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, LLM_CONFIG_TABLE);
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   *
   * PRD 3.4.2 注：组件初始化时从 llm_config 读取 enabled 状态以恢复上次的可用状态。
   */
  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        'LLM 组件已关闭（closeLLM 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('LLM');
    }
  }

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * 构造 LLM 提供商 API 端点地址。
   *
   * 自动处理基址是否包含 /v1 后缀的情况：
   * - 基址为 `https://api.openai.com` + `v1/models` -> `https://api.openai.com/v1/models`
   * - 基址为 `https://api.openai.com/v1` + `v1/models` -> `https://api.openai.com/v1/models`
   *
   * @param baseUrl 提供商基址
   * @param apiPath API 路径（如 'v1/models'、'v1/chat/completions'）
   * @returns 完整端点地址
   */
  private buildEndpoint(baseUrl: string, apiPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
  }

  /**
   * 带超时的 fetch 请求。
   *
   * 使用 AbortController 实现超时控制，超时后中止请求并抛出错误。
   *
   * @param url 请求地址
   * @param options fetch 选项
   * @param timeoutMs 超时时间（毫秒）
   * @returns fetch 响应
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = new URL(url, 'http://localhost');
    }

    const isLocalhost =
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname === '0.0.0.0';

    if (!proxy || isLocalhost) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    // 存在代理且为外部地址时：使用代理 Agent 发起 HTTP/HTTPS 请求
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
      if (options.headers) {
        if (Array.isArray(options.headers)) {
          for (const [k, v] of options.headers) headers[k] = String(v);
        } else if (typeof (options.headers as any).entries === 'function') {
          for (const [k, v] of (options.headers as any).entries()) headers[k] = String(v);
        } else {
          for (const [k, v] of Object.entries(options.headers as Record<string, string>)) {
            if (v !== undefined) headers[k] = String(v);
          }
        }
      }

      const reqOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers,
        timeout: timeoutMs,
      };
      if (agent) {
        reqOptions.agent = agent;
      }

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const req = lib.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timer);
          const bodyBuffer = Buffer.concat(chunks);
          const bodyText = bodyBuffer.toString('utf-8');
          const responseObj = {
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode || 200,
            statusText: res.statusMessage || '',
            headers: new Headers(res.headers as Record<string, string>),
            text: async () => bodyText,
            json: async () => JSON.parse(bodyText),
          } as unknown as Response;
          resolve(responseObj);
        });
      });

      req.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      req.on('timeout', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      });

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            req.destroy(new Error('Request aborted'));
          }
        });
      }

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  /**
    * 更新 LLM 当日使用次数与 Token 用量（upsert 语义）。
    *
    * 若当天记录已存在则 usage_count + 1 且累计 input_tokens / output_tokens，
    * 否则新增一条记录。
    * 仅当 execLLM / embedLLM 调用成功时调用本方法。
    *
    * @param llmEnableId 启用的 LLM ID（llm_available.id）
    * @param inputTokens 本次调用输入 Token 数
    * @param outputTokens 本次调用输出 Token 数
    */
  private async upsertUsage(
    llmEnableId: string,
    inputTokens = 0,
    outputTokens = 0,
  ): Promise<void> {
    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(LLM_USAGE_TABLE, [
      { field: 'llm_available_id', operator: Operator.EQ, value: llmEnableId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      const currentInput = (existing.input_tokens as number) ?? 0;
      const currentOutput = (existing.output_tokens as number) ?? 0;
      await this.relationDb.update(
        LLM_USAGE_TABLE,
        [
          { field: 'usage_count', value: currentCount + 1 },
          { field: 'input_tokens', value: currentInput + inputTokens },
          { field: 'output_tokens', value: currentOutput + outputTokens },
          { field: 'updated', value: now },
        ],
        [
          { field: 'llm_available_id', operator: Operator.EQ, value: llmEnableId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      const usageId = IdGenerator.generate();
      await this.relationDb.insert(LLM_USAGE_TABLE, [
        { field: 'id', value: usageId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_available_id', value: llmEnableId },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
        { field: 'input_tokens', value: inputTokens },
        { field: 'output_tokens', value: outputTokens },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // LLM 提供商管理
  // -------------------------------------------------------------------------

  /**
   * 新增 LLM 提供商（addLLMProvider）。
   *
   * PRD 3.1.1 条：向系统中新增一个 LLM 提供商。
   */
  async addLLMProvider(
    input: AddLLMProviderInput,
    _context: LLMContext,
    output: AddLLMProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.llm_provider_url) {
      throw new ValidationError('llm_provider_url 不能为空');
    }
    if (!data.llm_provider_title) {
      throw new ValidationError('llm_provider_title 不能为空');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    // 未显式指定配额时，从 llm_config 读取全局默认配额（0 = 不限制）
    const [dTokensDay, dTokensWeek, dTokensMonth, dCallsDay, dCallsWeek, dCallsMonth] = await Promise.all([
      this.config.getInt('default_quota_tokens_per_day', 0),
      this.config.getInt('default_quota_tokens_per_week', 0),
      this.config.getInt('default_quota_tokens_per_month', 0),
      this.config.getInt('default_quota_calls_per_day', 0),
      this.config.getInt('default_quota_calls_per_week', 0),
      this.config.getInt('default_quota_calls_per_month', 0),
    ]);

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'llm_provider_url', value: data.llm_provider_url },
      { field: 'llm_provider_title', value: data.llm_provider_title },
      { field: 'llm_provider_brief', value: data.llm_provider_brief ?? null },
      { field: 'enable', value: data.enable === true ? 1 : 0 },
      { field: 'api_key', value: data.api_key ?? null },
      { field: 'models_path', value: data.models_path ?? null },
      { field: 'chat_path', value: data.chat_path ?? null },
      { field: 'quota_tokens_per_day', value: data.quota_tokens_per_day ?? dTokensDay },
      { field: 'quota_tokens_per_week', value: data.quota_tokens_per_week ?? dTokensWeek },
      { field: 'quota_tokens_per_month', value: data.quota_tokens_per_month ?? dTokensMonth },
      { field: 'quota_calls_per_day', value: data.quota_calls_per_day ?? dCallsDay },
      { field: 'quota_calls_per_week', value: data.quota_calls_per_week ?? dCallsWeek },
      { field: 'quota_calls_per_month', value: data.quota_calls_per_month ?? dCallsMonth },
    ];
    await this.relationDb.insert(LLM_PROVIDER_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 更新 LLM 提供商（updateLLMProvider）。
   *
   * PRD 3.1.2 条：支持按 ID 或按条件更新。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   */
  async updateLLMProvider(
    input: UpdateLLMProviderInput,
    _context: LLMContext,
    output: UpdateLLMProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.llm_provider_url !== undefined) {
      data.push({ field: 'llm_provider_url', value: patch.llm_provider_url });
    }
    if (patch.llm_provider_title !== undefined) {
      data.push({
        field: 'llm_provider_title',
        value: patch.llm_provider_title,
      });
    }
    if (patch.llm_provider_brief !== undefined) {
      data.push({
        field: 'llm_provider_brief',
        value: patch.llm_provider_brief,
      });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    if (patch.api_key !== undefined) {
      data.push({ field: 'api_key', value: patch.api_key });
    }
    if (patch.models_path !== undefined) {
      data.push({ field: 'models_path', value: patch.models_path });
    }
    if (patch.chat_path !== undefined) {
      data.push({ field: 'chat_path', value: patch.chat_path });
    }
    if (patch.models_fetched_at !== undefined) {
      data.push({ field: 'models_fetched_at', value: patch.models_fetched_at });
    }
    for (const qf of ['quota_tokens_per_day', 'quota_tokens_per_week', 'quota_tokens_per_month',
      'quota_calls_per_day', 'quota_calls_per_week', 'quota_calls_per_month'] as const) {
      if (patch[qf] !== undefined) {
        data.push({ field: qf, value: patch[qf] });
      }
    }

    output.affected_rows = await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 删除 LLM 提供商（delLLMProvider）。
   *
   * PRD 3.1.3 条：支持按 ID 批量删除或按条件删除。
   * 级联清理该提供商下关联的 LLM 模型记录（llm_model 表）。
   */
  async delLLMProvider(
    input: DelLLMProviderInput,
    _context: LLMContext,
    output: DelLLMProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    // 先确定待删除的 provider IDs（用于级联清理 llm_model）
    let providerIds: string[] = [];
    if (input.ids) {
      providerIds = input.ids;
    } else {
      const rows = await this.relationDb.select(LLM_PROVIDER_TABLE, {
        conditions: input.conditions!,
        fields: ['id'],
      });
      providerIds = rows.map((r) => String(r.id));
    }

    const affected = await this.relationDb.delete(
      LLM_PROVIDER_TABLE,
      conditions,
    );
    output.affected_rows = affected;

    // 级联清理关联记录
    if (providerIds.length > 0) {
      await this.relationDb.delete(LLM_CACHE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
      ]);
      const availableRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
        ],
        fields: ['id'],
      });
      const availableIds = availableRows.map((r) => String(r.id));
      if (availableIds.length > 0) {
        await this.relationDb.delete(LLM_USAGE_TABLE, [
          { field: 'llm_available_id', operator: Operator.IN, value: availableIds },
        ]);
      }
      await this.relationDb.delete(LLM_AVAILABLE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
      ]);
    }

    return true;
  }

  /**
   * 搜索 LLM 提供商（soLLMProvider）。
   *
   * PRD 3.1.4 条：支持关键词、条件过滤、排序、分页。
   * 关键词匹配 llm_provider_title。
   */
  async soLLMProvider(
    input: SoLLMProviderInput,
    _context: LLMContext,
    output: SoLLMProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'llm_provider_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }

    const rows = await this.relationDb.select(LLM_PROVIDER_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      LLM_PROVIDER_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as LLMProviderRecord[];
    output.total = total;
    return true;
  }

  /**
   * 测试 LLM 提供商连接（testLLMProvider）。
   *
   * PRD 3.1.5 条：向提供商地址发起网络连通性测试，返回连通状态和响应时间。
   * 使用 HTTP GET 请求，只要收到响应即视为连通（connected=true），
   * 网络错误或超时视为不可达（connected=false）。
   */
  // ===== 原始方法（保留作为参考）=====
  // async testLLMProvider(
  //   input: TestLLMProviderInput,
  //   _context: LLMContext,
  //   output: TestLLMProviderOutput,
  // ): Promise<boolean> {
  //   this.ensureEnabled();
  //   if (!input.id) {
  //     throw new ValidationError('id 不能为空');
  //   }
  //
  //   const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: input.id },
  //   ]);
  //   if (!row) {
  //     throw new NotFoundError('LLMProvider', input.id);
  //   }
  //   const provider = row as unknown as LLMProviderRecord;
  //
  //   const start = Date.now();
  //   let testUrl = provider.llm_provider_url;
  //   const isGoogle =
  //     provider.llm_provider_title?.toLowerCase().includes('google') ||
  //     testUrl.includes('googleapis.com');
  //
  //   const headers: Record<string, string> = {};
  //   if (provider.api_key) {
  //     if (isGoogle) {
  //       headers['x-goog-api-key'] = provider.api_key;
  //       if (!testUrl.includes('key=')) {
  //         testUrl += (testUrl.includes('?') ? '&' : '?') + `key=${encodeURIComponent(provider.api_key)}`;
  //       }
  //     } else {
  //       headers['Authorization'] = `Bearer ${provider.api_key}`;
  //       headers['x-api-key'] = provider.api_key;
  //     }
  //   }
  //   try {
  //     const res = await this.fetchWithTimeout(
  //       testUrl,
  //       { method: 'GET', headers },
  //       TEST_TIMEOUT_MS,
  //     );
  //     output.response_time_ms = Date.now() - start;
  //     output.status_code = res.status;
  //     // 只要收到 HTTP 响应即视为连通（即使状态码非 2xx）
  //     output.connected = true;
  //   } catch (err) {
  //     output.response_time_ms = Date.now() - start;
  //     output.connected = false;
  //     output.error = err instanceof Error ? err.message : String(err);
  //     output.error_code = 'CONNECT_ERROR';
  //   }
  //   return true;
  // }

  // ===== 修改后的方法 =====
  async testLLMProvider(
    input: TestLLMProviderInput,
    _context: LLMContext,
    output: TestLLMProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!row) {
      throw new NotFoundError('LLMProvider', input.id);
    }
    const provider = row as unknown as LLMProviderRecord;

    const start = Date.now();
    const strategy = LLMStrategyFactory.getStrategy(provider);
    const req = strategy.buildTestRequest(provider);

    try {
      const res = await this.fetchWithTimeout(
        req.url,
        { method: req.method, headers: req.headers, body: req.body },
        TEST_TIMEOUT_MS,
      );
      output.response_time_ms = Date.now() - start;
      output.status_code = res.status;
      // 只要收到 HTTP 响应即视为连通（即使状态码非 2xx）
      output.connected = true;
    } catch (err) {
      output.response_time_ms = Date.now() - start;
      output.connected = false;
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
    }
    return true;
  }

  // ===== 原始方法（保留作为参考）=====
  // async listLLM(
  //   input: ListLLMInput,
  //   _context: LLMContext,
  //   output: ListLLMOutput,
  // ): Promise<boolean> {
  //   this.ensureEnabled();
  //   if (!input.llm_provider_id) {
  //     throw new ValidationError('llm_provider_id 不能为空');
  //   }
  //
  //   const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: input.llm_provider_id },
  //   ]);
  //   if (!row) {
  //     throw new NotFoundError('LLMProvider', input.llm_provider_id);
  //   }
  //   const provider = row as unknown as LLMProviderRecord;
  //
  //   // 缓存命中：跳过远程请求，直接返回本地模型列表
  //   const cacheAge = !input.force && provider.models_fetched_at
  //     ? IdGenerator.now() - provider.models_fetched_at
  //     : Infinity;
  //   if (cacheAge < MODELS_CACHE_TTL_MS) {
  //     const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
  //       conditions: [
  //         { field: 'llm_provider_id', operator: Operator.EQ, value: input.llm_provider_id },
  //       ],
  //       order_by: [{ field: 'llm_title', direction: Direction.ASC }],
  //     });
  //     output.list = rows as unknown as LLMCacheRecord[];
  //     output.cached = true;
  //     return true;
  //   }
  //
  //   const modelsPath = provider.models_path || MODELS_PATH;
  //   const url = this.buildEndpoint(provider.llm_provider_url, modelsPath);
  //
  //   let models: Array<{
  //     id?: string;
  //     owned_by?: string;
  //     created?: number;
  //   }> = [];
  //   const headers: Record<string, string> = {};
  //   if (provider.api_key) {
  //     headers['Authorization'] = `Bearer ${provider.api_key}`;
  //   }
  //   try {
  //     const res = await this.fetchWithTimeout(
  //       url,
  //       { method: 'GET', headers },
  //       LIST_TIMEOUT_MS,
  //     );
  //     if (!res.ok) {
  //       output.error = `获取模型列表失败: HTTP ${res.status}`;
  //       output.error_code = 'REMOTE_ERROR';
  //       await this.updateModelsCacheTimestamp(input.llm_provider_id);
  //       return false;
  //     }
  //     const json = (await res.json()) as {
  //       data?: Array<Record<string, unknown>>;
  //     };
  //     models = json.data ?? [];
  //   } catch (err) {
  //     output.error = err instanceof Error ? err.message : String(err);
  //     output.error_code = 'CONNECT_ERROR';
  //     await this.updateModelsCacheTimestamp(input.llm_provider_id);
  //     return false;
  //   }
  //
  //   // upsert 到 llm_model 表（按 llm_provider_id + llm_title 判重）
  //   const now = IdGenerator.now();
  //   for (const m of models) {
  //     const modelId = String(m.id ?? '');
  //     if (!modelId) continue;
  //     const rawM = m as Record<string, unknown>;
  //     const brief = rawM.owned_by ? `owned_by: ${String(rawM.owned_by)}` : null;
  //     const tl = rawM.token_limits as Record<string, unknown> | undefined;
  //     const topProvider = rawM.top_provider as Record<string, unknown> | undefined;
  //     const maxTokens = Number(rawM.context_length || tl?.context_window
  //       || rawM.max_tokens || rawM.max_completion_tokens
  //       || (topProvider?.max_completion_tokens) || 0);
  //     const existing = await this.relationDb.selectOne(LLM_CACHE_TABLE, [
  //       {
  //         field: 'llm_provider_id',
  //         operator: Operator.EQ,
  //         value: input.llm_provider_id,
  //       },
  //       { field: 'llm_title', operator: Operator.EQ, value: modelId },
  //     ]);
  //
  //     if (existing) {
  //       await this.relationDb.update(
  //         LLM_CACHE_TABLE,
  //         [
  //           { field: 'llm_brief', value: brief },
  //           { field: 'llm_param', value: JSON.stringify(m) },
  //           { field: 'max_tokens', value: maxTokens },
  //           { field: 'llm_param', value: JSON.stringify(m) },
  //           { field: 'updated', value: now },
  //         ],
  //         [
  //           {
  //             field: 'llm_provider_id',
  //             operator: Operator.EQ,
  //             value: input.llm_provider_id,
  //           },
  //           { field: 'llm_title', operator: Operator.EQ, value: modelId },
  //         ],
  //       );
  //     } else {
  //       const id = IdGenerator.generate();
  //       try {
  //         await this.relationDb.insert(LLM_CACHE_TABLE, [
  //           { field: 'id', value: id },
  //           { field: 'created', value: now },
  //           { field: 'updated', value: now },
  //           { field: 'llm_provider_id', value: input.llm_provider_id },
  //           { field: 'llm_title', value: modelId },
  //           { field: 'llm_brief', value: brief },
  //           { field: 'llm_param', value: JSON.stringify(m) },
  //           { field: 'max_tokens', value: maxTokens },
  //           { field: 'llm_param', value: JSON.stringify(m) },
  //         ]);
  //       } catch {
  //         // skip duplicate insert
  //       }
  //     }
  //   }
  //
  //   // 更新模型列表缓存时间
  //   await this.updateModelsCacheTimestamp(input.llm_provider_id);
  //
  //   // 返回该提供商下所有模型
  //   const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
  //     conditions: [
  //       {
  //         field: 'llm_provider_id',
  //         operator: Operator.EQ,
  //         value: input.llm_provider_id,
  //       },
  //     ],
  //     order_by: [{ field: 'llm_title', direction: Direction.ASC }],
  //   });
  //   output.list = rows as unknown as LLMCacheRecord[];
  //   return true;
  // }

  // ===== 修改后的方法 =====
  /**
   * 获取 LLM 模型列表（listLLM）。
   *
   * PRD 3.1.6 条：从 LLM 提供商 API 获取可用的模型列表并缓存到本地。
   * 支持 OpenAI 兼容格式 (json.data) 与 Google / 统一格式 (json.models) 的动态解析。
   * 仅在请求成功时更新缓存时间戳。
   */
  async listLLM(
    input: ListLLMInput,
    _context: LLMContext,
    output: ListLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.llm_provider_id) {
      throw new ValidationError('llm_provider_id 不能为空');
    }

    const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.llm_provider_id },
    ]);
    if (!row) {
      throw new NotFoundError('LLMProvider', input.llm_provider_id);
    }
    const provider = row as unknown as LLMProviderRecord;

    // 缓存命中：仅在未指定 force 且缓存未过期时直接返回本地模型列表
    const cacheAge = !input.force && provider.models_fetched_at
      ? IdGenerator.now() - provider.models_fetched_at
      : Infinity;
    if (cacheAge < MODELS_CACHE_TTL_MS) {
      const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
        conditions: [
          { field: 'llm_provider_id', operator: Operator.EQ, value: input.llm_provider_id },
        ],
        order_by: [{ field: 'llm_title', direction: Direction.ASC }],
      });
      output.list = rows as unknown as LLMCacheRecord[];
      output.cached = true;
      return true;
    }

    const strategy = LLMStrategyFactory.getStrategy(provider);
    const req = strategy.buildListModelsRequest(provider);
    let parsedModels: Array<{
      modelId: string;
      displayName?: string;
      description?: string;
      maxTokens?: number;
      raw: Record<string, unknown>;
    }> = [];

    try {
      const res = await this.fetchWithTimeout(
        req.url,
        { method: req.method, headers: req.headers, body: req.body },
        LIST_TIMEOUT_MS,
      );
      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson.error?.message) errDetail += ` - ${errJson.error.message}`;
        } catch {
          /* ignore */
        }
        output.error = `获取模型列表失败: ${errDetail}`;
        output.error_code = 'REMOTE_ERROR';
        // 请求失败时不写入/更新缓存时间戳
        return false;
      }
      const rawText = await res.text();
      let json: unknown = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        json = {};
      }
      parsedModels = strategy.parseListModelsResponse(json, rawText);
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      // 异常时不写入/更新缓存时间戳
      return false;
    }

    // upsert 到 llm_cache 表（按 llm_provider_id + llm_title 判重）
    const now = IdGenerator.now();
    for (const m of parsedModels) {
      const modelId = m.modelId;
      if (!modelId) continue;
      const brief = m.description ?? null;
      const maxTokens = m.maxTokens ?? 0;

      const existing = await this.relationDb.selectOne(LLM_CACHE_TABLE, [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
        { field: 'llm_title', operator: Operator.EQ, value: modelId },
      ]);

      if (existing) {
        await this.relationDb.update(
          LLM_CACHE_TABLE,
          [
            { field: 'llm_brief', value: brief },
            { field: 'llm_param', value: JSON.stringify(m.raw) },
            { field: 'max_tokens', value: maxTokens },
            { field: 'updated', value: now },
          ],
          [
            {
              field: 'llm_provider_id',
              operator: Operator.EQ,
              value: input.llm_provider_id,
            },
            { field: 'llm_title', operator: Operator.EQ, value: modelId },
          ],
        );
      } else {
        const id = IdGenerator.generate();
        try {
          await this.relationDb.insert(LLM_CACHE_TABLE, [
            { field: 'id', value: id },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'llm_provider_id', value: input.llm_provider_id },
            { field: 'llm_title', value: modelId },
            { field: 'llm_brief', value: brief },
            { field: 'llm_param', value: JSON.stringify(m.raw) },
            { field: 'max_tokens', value: maxTokens },
          ]);
        } catch {
          // skip duplicate insert
        }
      }
    }

    // 仅在成功获取并保存模型后更新模型列表缓存时间
    await this.updateModelsCacheTimestamp(input.llm_provider_id);

    // 返回该提供商下所有模型
    const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
      conditions: [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
      ],
      order_by: [{ field: 'llm_title', direction: Direction.ASC }],
    });
    output.list = rows as unknown as LLMCacheRecord[];
    output.cached = false;
    return true;
  }

  private async updateModelsCacheTimestamp(providerId: string): Promise<void> {
    await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      [{ field: 'models_fetched_at', value: IdGenerator.now() }],
      [{ field: 'id', operator: Operator.EQ, value: providerId }],
    );
  }

  // -------------------------------------------------------------------------
  // LLM 模型管理
  // -------------------------------------------------------------------------

  /**
   * 新增 LLM（addLLM）。
   *
   * PRD 3.2.1 条：将一个 LLM 模型添加到启用列表（llm_enable 表）。
   */
  async addLLM(
    input: AddLLMInput,
    _context: LLMContext,
    output: AddLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.llm_provider_id) {
      throw new ValidationError('llm_provider_id 不能为空');
    }
    if (!data.llm_title) {
      throw new ValidationError('llm_title 不能为空');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'llm_provider_id', value: data.llm_provider_id },
      { field: 'llm_title', value: data.llm_title },
      { field: 'llm_brief', value: data.llm_brief ?? null },
      { field: 'llm_type', value: data.llm_type || 'text' },
      { field: 'enable', value: data.enable === false ? 0 : 1 },
      { field: 'is_default', value: data.is_default ? 1 : 0 },
      { field: 'max_tokens', value: data.max_tokens ?? 0 },
    ];
    await this.relationDb.insert(LLM_AVAILABLE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 删除 LLM（delLLM）。
   *
   * PRD 3.2.2 条：支持按 ID 批量删除或按条件删除。
   */
  async delLLM(
    input: DelLLMInput,
    _context: LLMContext,
    output: DelLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    output.affected_rows = await this.relationDb.delete(
      LLM_AVAILABLE_TABLE,
      conditions,
    );
    return true;
  }

  /**
   * 更新 LLM（updateLLM）。
   *
   * PRD 3.2.3 条：支持按 ID 或按条件更新，仅允许更新 llm_enable 表中的信息。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   * llm_provider_id 为引用字段，不可通过本方法修改。
   */
  async updateLLM(
    input: UpdateLLMInput,
    _context: LLMContext,
    output: UpdateLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.llm_title !== undefined) {
      data.push({ field: 'llm_title', value: patch.llm_title });
    }
    if (patch.llm_brief !== undefined) {
      data.push({ field: 'llm_brief', value: patch.llm_brief });
    }
    if (patch.llm_type !== undefined) {
      data.push({ field: 'llm_type', value: patch.llm_type });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    if (patch.max_tokens !== undefined) {
      data.push({ field: 'max_tokens', value: patch.max_tokens });
    }

    output.affected_rows = await this.relationDb.update(
      LLM_AVAILABLE_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 搜索可用模型（soLLM）。
   *
   * 支持关键词搜索 llm_title、条件过滤、排序、分页。
   * 合并了原 getLLM 的功能。
   */
  async soLLM(
    input: SoLLMInput,
    _context: LLMContext,
    output: SoLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'llm_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }

    const rows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      LLM_AVAILABLE_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as LLMAvailableRecord[];
    output.total = total;
    return true;
  }

  // -------------------------------------------------------------------------
  // LLM 调用
  // -------------------------------------------------------------------------

  /**
   * 调用 LLM（execLLM）。
   *
   * 处理流程：
   * 1. 若未传 ID，自动查找 is_default=1 且 enable=1 的默认模型；
   * 2. 根据 ID 获取可用模型（llm_available）及提供商（llm_provider）；
   * 3. 构造 OpenAI 兼容 POST 请求，调用提供商 chat API；
   * 4. 提取 result、input_tokens、output_tokens、duration_ms；
   * 5. 更新 llm_usage 表当天 usage_count。
   *
   * 支持的入参字段：
   * - prompt: 用户消息内容（必填）
   * - system: 系统提示词（可选，前置为 system 消息）
   * - temperature: 采样温度（可选）
   * - max_tokens: 最大 Token 数（可选，未指定时使用模型默认 max_tokens）
   * - extra: 其他参数原样传入请求体
   */
  // ===== 原始方法（保留作为参考）=====
  // async execLLM(
  //   input: ExecLLMInput,
  //   _context: LLMContext,
  //   output: ExecLLMOutput,
  // ): Promise<boolean> {
  //   this.ensureEnabled();
  //   if (!input.id) {
  //     // 1. 优先使用已启用的系统默认模型（is_default=1 且 enable=1）
  //     const defaultLLM = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //       { field: 'is_default', operator: Operator.EQ, value: 1 },
  //       { field: 'enable', operator: Operator.EQ, value: 1 },
  //     ]);
  //     if (defaultLLM) {
  //       input.id = (defaultLLM as unknown as LLMAvailableRecord).id;
  //     } else {
  //       // 2. 兜底使用首个已启用的可用模型（enable=1）
  //       const firstEnabled = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //         { field: 'enable', operator: Operator.EQ, value: 1 },
  //       ]);
  //       if (firstEnabled) {
  //         input.id = (firstEnabled as unknown as LLMAvailableRecord).id;
  //       } else {
  //         throw new ValidationError('id 不能为空，且无可用模型');
  //       }
  //     }
  //   }
  //   const prompt = String(input.prompt ?? '');
  //   if (!prompt) {
  //     throw new ValidationError('prompt 不能为空');
  //   }
  //
  //   const startTime = Date.now();
  //
  //   const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: input.id },
  //   ]);
  //   if (!llmRow) {
  //     throw new NotFoundError('LLM', input.id);
  //   }
  //   const llm = llmRow as unknown as LLMAvailableRecord;
  //   if (!llm.enable) {
  //     throw new ValidationError(`LLM ${input.id} 已禁用`);
  //   }
  //
  //   const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
  //   ]);
  //   if (!providerRow) {
  //     throw new NotFoundError('LLMProvider', llm.llm_provider_id);
  //   }
  //   const provider = providerRow as unknown as LLMProviderRecord;
  //   if (!provider.enable) {
  //     throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
  //   }
  //
  //   const body: Record<string, unknown> = {
  //     model: llm.llm_title,
  //     messages: [{ role: 'user', content: prompt }],
  //   };
  //   if (input.system) {
  //     (body.messages as Array<Record<string, unknown>>).unshift(
  //       { role: 'system', content: input.system },
  //     );
  //   }
  //   if (input.temperature !== undefined) {
  //     body.temperature = input.temperature;
  //   }
  //   if (input.max_tokens !== undefined) {
  //     body.max_tokens = input.max_tokens;
  //   } else if (llm.max_tokens) {
  //     body.max_tokens = llm.max_tokens;
  //   }
  //   // 透传其他参数（extra 中的参数原样进入请求体）
  //   if (input.extra) {
  //     for (const [k, v] of Object.entries(input.extra)) {
  //       if (!['prompt', 'system', 'temperature', 'max_tokens', 'model', 'messages', 'api_key'].includes(k)) {
  //         body[k] = v;
  //       }
  //     }
  //   }
  //
  //   const chatPath = provider.chat_path || CHAT_PATH;
  //   let url = this.buildEndpoint(provider.llm_provider_url, chatPath);
  //   const isGoogle =
  //     provider.llm_provider_title?.toLowerCase().includes('google') ||
  //     url.includes('googleapis.com');
  //
  //   const headers: Record<string, string> = {
  //     'Content-Type': 'application/json',
  //   };
  //   if (provider.api_key) {
  //     if (isGoogle) {
  //       headers['x-goog-api-key'] = provider.api_key;
  //       if (!url.includes('key=')) {
  //         url += (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(provider.api_key)}`;
  //       }
  //     } else {
  //       headers['Authorization'] = `Bearer ${provider.api_key}`;
  //     }
  //   }
  //   try {
  //     const res = await this.fetchWithTimeout(
  //       url,
  //       {
  //         method: 'POST',
  //         headers,
  //         body: JSON.stringify(body),
  //       },
  //       EXEC_TIMEOUT_MS,
  //     );
  //     if (!res.ok) {
  //       const text = await res.text();
  //       output.error = `LLM 调用失败: HTTP ${res.status} ${text}`;
  //       output.error_code = 'REMOTE_ERROR';
  //       output.duration_ms = Date.now() - startTime;
  //       return false;
  //     }
  //     const text = await res.text();
  //     output.raw_response = text;
  //     let json: {
  //       choices?: Array<{
  //         message?: { content?: string };
  //       }>;
  //       usage?: { prompt_tokens?: number; completion_tokens?: number };
  //     } = {};
  //     try {
  //       json = JSON.parse(text) as typeof json;
  //     } catch {
  //       json = {};
  //     }
  //     output.result = (json.choices?.[0]?.message?.content ?? '') as string;
  //     output.input_prompt = prompt;
  //     output.input_tokens = json.usage?.prompt_tokens ?? 0;
  //     output.output_tokens = json.usage?.completion_tokens ?? 0;
  //     output.duration_ms = Date.now() - startTime;
  //   } catch (err) {
  //     output.error = err instanceof Error ? err.message : String(err);
  //     output.error_code = 'CONNECT_ERROR';
  //     output.duration_ms = Date.now() - startTime;
  //     return false;
  //   }
  //
  //   // 成功后更新 llm_usage 表当天的 usage_count 与 token 用量
  //   await this.upsertUsage(input.id, output.input_tokens, output.output_tokens);
  //   return true;
  // }

  // ===== 原始方法（保留作为参考）：单模型直接调用，无故障自动降级机制 =====
  // async execLLM(
  //   input: ExecLLMInput,
  //   _context: LLMContext,
  //   output: ExecLLMOutput,
  // ): Promise<boolean> {
  //   this.ensureEnabled();
  //   if (!input.id) {
  //     const defaultLLM = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //       { field: 'is_default', operator: Operator.EQ, value: 1 },
  //       { field: 'enable', operator: Operator.EQ, value: 1 },
  //     ]);
  //     if (defaultLLM) {
  //       input.id = (defaultLLM as unknown as LLMAvailableRecord).id;
  //     } else {
  //       const firstEnabled = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //         { field: 'enable', operator: Operator.EQ, value: 1 },
  //       ]);
  //       if (firstEnabled) {
  //         input.id = (firstEnabled as unknown as LLMAvailableRecord).id;
  //       } else {
  //         throw new ValidationError('id 不能为空，且无可用模型');
  //       }
  //     }
  //   }
  //   const prompt = String(input.prompt ?? '');
  //   if (!prompt) {
  //     throw new ValidationError('prompt 不能为空');
  //   }
  //   const startTime = Date.now();
  //   const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: input.id },
  //   ]);
  //   if (!llmRow) throw new NotFoundError('LLM', input.id);
  //   const llm = llmRow as unknown as LLMAvailableRecord;
  //   if (!llm.enable) throw new ValidationError(`LLM ${input.id} 已禁用`);
  //   const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
  //   ]);
  //   if (!providerRow) throw new NotFoundError('LLMProvider', llm.llm_provider_id);
  //   const provider = providerRow as unknown as LLMProviderRecord;
  //   if (!provider.enable) throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
  //   const strategy = LLMStrategyFactory.getStrategy(provider);
  //   const req = strategy.buildChatRequest(provider, llm, input);
  //   const res = await this.fetchWithTimeout(req.url, { method: req.method, headers: req.headers, body: req.body }, EXEC_TIMEOUT_MS);
  //   ...
  //   return true;
  // }

  // ===== 修改后的方法：支持模型故障自动降级回退（指定模型 -> 默认模型 -> 启用模型1 -> 启用模型2 ...） =====
  async execLLM(
    input: ExecLLMInput,
    _context: LLMContext,
    output: ExecLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const prompt = String(input.prompt ?? '');
    if (!prompt) {
      throw new ValidationError('prompt 不能为空');
    }

    // 解析候选模型队列（按优先级排序并去重）
    const candidateIds = await this.resolveCandidateModels(input.id);
    if (candidateIds.length === 0) {
      if (input.id) {
        throw new NotFoundError('LLM', input.id);
      }
      throw new ValidationError('id 不能为空，且无可用模型');
    }

    const startTime = Date.now();
    let lastError = '';
    let lastErrorCode = '';

    for (let i = 0; i < candidateIds.length; i++) {
      const currentId = candidateIds[i];
      const singleOutput = new ExecLLMOutput();
      const ok = await this.executeSingleLLM(currentId, input, startTime, singleOutput);
      if (ok) {
        Object.assign(output, singleOutput);
        if (i > 0) {
          this.logger?.debug(
            `LLM failover: 模型 ${candidateIds[0]} 调用失败，自动降级至候选模型 ${currentId} 成功 (尝试第 ${i + 1} 个)`,
            {
              original_id: candidateIds[0],
              fallback_id: currentId,
              attempt_index: i + 1,
            },
          );
        }
        return true;
      }

      lastError = singleOutput.error || 'Unknown error';
      lastErrorCode = singleOutput.error_code || 'EXEC_FAILED';
      this.logger?.debug(
        `LLM candidate ${currentId} (${i + 1}/${candidateIds.length}) failed: ${lastError}`,
        {
          model_id: currentId,
          error: lastError,
        },
      );
    }

    // 若仅传入了一个 ID 且无任何其他候选模型可用，且属于特定异常类型
    if (candidateIds.length === 1 && (lastErrorCode === 'NOT_FOUND' || lastErrorCode === 'VALIDATION_ERROR')) {
      if (lastErrorCode === 'NOT_FOUND') {
        throw new NotFoundError('LLM', candidateIds[0]);
      }
      throw new ValidationError(lastError);
    }

    output.error = `所有可用模型均调用失败 (尝试了 ${candidateIds.length} 个模型): ${lastError}`;
    output.error_code = lastErrorCode || 'ALL_MODELS_FAILED';
    output.duration_ms = Date.now() - startTime;
    return false;
  }

  /**
   * 构建候选模型队列（按优先级排序并去重）：
   * 1. 显式指定的模型 (input.id)
   * 2. 默认模型 (is_default = 1 且 enable = 1)
   * 3. 数据库中其余所有启用的模型 (enable = 1)
   */
  private async resolveCandidateModels(specifiedId?: string): Promise<string[]> {
    const candidates: string[] = [];
    const added = new Set<string>();

    const addCandidate = (id?: string) => {
      if (id && !added.has(id)) {
        candidates.push(id);
        added.add(id);
      }
    };

    // 1. 显式指定的模型
    if (specifiedId) {
      addCandidate(specifiedId);
    }

    // 2. 系统默认模型
    try {
      const defaultRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'is_default', operator: Operator.EQ, value: 1 },
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ],
      });
      for (const row of defaultRows) {
        addCandidate((row as unknown as LLMAvailableRecord).id);
      }
    } catch {
      /* ignore */
    }

    // 3. 其余所有已启用的模型
    try {
      const allEnabledRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ],
      });
      for (const row of allEnabledRows) {
        addCandidate((row as unknown as LLMAvailableRecord).id);
      }
    } catch {
      /* ignore */
    }

    return candidates;
  }

  /**
   * 单个模型的底层推理请求执行
   */
  private async executeSingleLLM(
    llmId: string,
    input: ExecLLMInput,
    startTime: number,
    output: ExecLLMOutput,
  ): Promise<boolean> {
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmId },
    ]);
    if (!llmRow) {
      output.error = `LLM ${llmId} 不存在`;
      output.error_code = 'NOT_FOUND';
      return false;
    }
    const llm = llmRow as unknown as LLMAvailableRecord;
    if (!llm.enable) {
      output.error = `LLM ${llmId} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }

    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    if (!providerRow) {
      output.error = `LLMProvider ${llm.llm_provider_id} 不存在`;
      output.error_code = 'NOT_FOUND';
      return false;
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      output.error = `LLMProvider ${provider.id} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }

    const prompt = String(input.prompt ?? '');
    const body: Record<string, unknown> = {
      model: llm.llm_title,
      messages: [{ role: 'user', content: prompt }],
    };
    if (input.system) {
      (body.messages as Array<Record<string, unknown>>).unshift(
        { role: 'system', content: input.system },
      );
    }
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }
    if (input.max_tokens !== undefined) {
      body.max_tokens = input.max_tokens;
    } else if (llm.max_tokens) {
      body.max_tokens = llm.max_tokens;
    }
    // 透传其他参数（extra 中的参数原样进入请求体）
    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        if (!['prompt', 'system', 'temperature', 'max_tokens', 'model', 'messages', 'api_key'].includes(k)) {
          body[k] = v;
        }
      }
    }

    const strategy = LLMStrategyFactory.getStrategy(provider);
    const req = strategy.buildChatRequest(provider, llm, input);

    try {
      const res = await this.fetchWithTimeout(
        req.url,
        {
          method: req.method,
          headers: req.headers,
          body: req.body,
        },
        EXEC_TIMEOUT_MS,
      );
      if (!res.ok) {
        const text = await res.text();
        output.error = `LLM 调用失败: HTTP ${res.status} ${text}`;
        output.error_code = 'REMOTE_ERROR';
        output.duration_ms = Date.now() - startTime;
        return false;
      }
      const rawText = await res.text();
      output.raw_response = rawText;
      let json: unknown = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        json = {};
      }
      const parsed = strategy.parseChatResponse(json, rawText);
      output.result = parsed.content;
      output.input_prompt = prompt;
      output.input_tokens = parsed.inputTokens;
      output.output_tokens = parsed.outputTokens;
      output.duration_ms = Date.now() - startTime;
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      output.duration_ms = Date.now() - startTime;
      return false;
    }

    // 成功后更新 llm_usage 表当天的 usage_count 与 token 用量
    await this.upsertUsage(llmId, output.input_tokens, output.output_tokens);
    return true;
  }

  /**
   * 调用 LLM 生成向量（embedLLM）。
   *
   * 面向 llm_type = 'embedding' 的模型，调用 OpenAI 兼容的
   * `POST {base}/v1/embeddings` 接口，请求体为 `{ model, input }`。
   *
   * 处理流程：
   * 1. 若未传 ID，自动查找 llm_type='embedding' 且 enable=1 的模型；
   * 2. 根据 ID 获取可用模型及提供商；
   * 3. 校验模型类型为 embedding；
   * 4. 调用向量化 API，解析 data[0].embedding 作为结果；
   * 5. 更新 llm_usage 表当天 usage_count。
   */
  async embedLLM(
    input: EmbedLLMInput,
    _context: LLMContext,
    output: EmbedLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      const defaultEmbedding = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
        { field: 'llm_type', operator: Operator.EQ, value: 'embedding' },
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      if (!defaultEmbedding) {
        throw new ValidationError('id 不能为空，且无可用默认 embedding 模型');
      }
      input.id = (defaultEmbedding as unknown as LLMAvailableRecord).id;
    }
    const text = String(input.input ?? '');
    if (!text) {
      throw new ValidationError('input 不能为空');
    }

    const startTime = Date.now();

    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!llmRow) {
      throw new NotFoundError('LLM', input.id);
    }
    const llm = llmRow as unknown as LLMAvailableRecord;
    if (!llm.enable) {
      throw new ValidationError(`LLM ${input.id} 已禁用`);
    }
    if (llm.llm_type !== 'embedding') {
      throw new ValidationError(`LLM ${input.id} 类型为 ${llm.llm_type}，不支持向量化调用`);
    }

    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    if (!providerRow) {
      throw new NotFoundError('LLMProvider', llm.llm_provider_id);
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
    }

    const strategy = LLMStrategyFactory.getStrategy(provider);
    const req = strategy.buildEmbedRequest(provider, llm, input);

    try {
      const res = await this.fetchWithTimeout(
        req.url,
        {
          method: req.method,
          headers: req.headers,
          body: req.body,
        },
        EXEC_TIMEOUT_MS,
      );
      if (!res.ok) {
        const errText = await res.text();
        output.error = `向量化调用失败: HTTP ${res.status} ${errText}`;
        output.error_code = 'REMOTE_ERROR';
        output.duration_ms = Date.now() - startTime;
        return false;
      }
      const rawText = await res.text();
      output.raw_response = rawText;
      let json: unknown = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        json = {};
      }
      const parsed = strategy.parseEmbedResponse(json, rawText);
      output.embedding = parsed.embedding;
      output.input_tokens = parsed.inputTokens;
      output.duration_ms = Date.now() - startTime;
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      output.duration_ms = Date.now() - startTime;
      return false;
    }

    await this.upsertUsage(input.id, output.input_tokens, 0);
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 可视化数据（visualizedLLM）。
   *
   * PRD 3.4.1 条：根据 scope 获取 LLM 服务的可视化信息。
   * - health：LLM 服务健康状态（连接状态、响应时间、启用状态）；
   * - volume：数据量（提供商数、模型数、启用 LLM 数、调用记录数）；
   * - diskUsage：占用磁盘空间（基于 SQLite page_size * page_count）。
   */
  async visualizedLLM(
    input: VisualizedLLMInput,
    _context: LLMContext,
    output: VisualizedLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const start = Date.now();
      this.relationDb.queryRaw('SELECT 1');
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
        enabled: this.enabled,
        provider_count: await this.relationDb.count(LLM_PROVIDER_TABLE),
        enabled_llm_count: await this.relationDb.count(LLM_AVAILABLE_TABLE, [
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ]),
      };
    } else if (scope === 'volume') {
      output.data = {
        provider_count: await this.relationDb.count(LLM_PROVIDER_TABLE),
        model_count: await this.relationDb.count(LLM_CACHE_TABLE),
        enabled_llm_count: await this.relationDb.count(LLM_AVAILABLE_TABLE),
        usage_record_count: await this.relationDb.count(LLM_USAGE_TABLE),
      };
    } else if (scope === 'diskUsage') {
      const pageSizes = this.relationDb.queryRaw<{ page_size: number }>(
        'PRAGMA page_size',
      );
      const pageCounts = this.relationDb.queryRaw<{ page_count: number }>(
        'PRAGMA page_count',
      );
      const pageSize =
        pageSizes.length > 0 ? Number(pageSizes[0].page_size) : 0;
      const pageCount =
        pageCounts.length > 0 ? Number(pageCounts[0].page_count) : 0;
      output.data = {
        disk_usage_bytes: pageSize * pageCount,
        page_size: pageSize,
        page_count: pageCount,
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  /**
   * 启用/禁用 LLM 组件（enableLLM）。
   *
   * PRD 3.4.2 条：运行时控制 LLM 组件的可用状态。
   * 状态同步持久化到 llm_config，组件初始化时恢复。
   * 禁用期间所有 LLM 操作将返回失败（LLM 组件未启用）。
   *
   * 注：closeLLM 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   */
  async enableLLM(
    input: EnableLLMInput,
    _context: LLMContext,
    _output: EnableLLMOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        'LLM 组件已关闭（closeLLM 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'LLM 组件是否启用（enableLLM 读写）',
    );
    return true;
  }
}

