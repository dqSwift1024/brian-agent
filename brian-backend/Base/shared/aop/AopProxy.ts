/**
 * @fileoverview AOP 代理工具。
 *
 * 遵循 `_00_DevStandardization.md` 第 4 条：所有方法都需要通过代理模式增加切面注入能力。
 *
 * 通过 JavaScript Proxy 拦截目标对象的方法调用，提供四个切入点（2 前 + 2 后）：
 * 1. beforeExecute（方法执行前 #1）：方法调用最开始的钩子
 * 2. preExecute（方法执行前 #2）：方法实际执行前的钩子
 * 3. postExecute（方法执行后 #1）：方法成功返回后的钩子
 * 4. afterExecute（方法执行后 #2）：方法执行完成后的钩子（无论成功或失败）
 *
 * 支持注入多个拦截器（Interceptor），每个拦截器可实现任意组合的切入点。
 * 日志切面功能通过 LogInterceptor 在 beforeExecute 和 afterExecute 中实现。
 */

import type { Interceptor, InterceptContext } from './Interceptor';
import { IdGenerator } from '../../ToolProvider/IdGenerator';

/**
 * 日志记录器接口，供调用方注入自定义 logger。
 *
 * 向后兼容：若未提供 interceptors 但提供了 logger，
 * AopProxy 会自动创建一个使用 logger 的内置拦截器。
 */
export interface Logger {
  /** 记录调试日志 */
  debug(message: string, meta?: Record<string, unknown>): void;
  /** 记录信息日志（可选） */
  info?(message: string, meta?: Record<string, unknown>): void;
  /** 记录警告日志（可选） */
  warn?(message: string, meta?: Record<string, unknown>): void;
  /** 记录错误日志 */
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * 默认控制台日志记录器。
 */
export class ConsoleLogger implements Logger {
  debug(message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ' ' + JSON.stringify(meta) : '';
    console.log(`[DEBUG] ${message}${suffix}`);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ' ' + JSON.stringify(meta) : '';
    console.error(`[ERROR] ${message}${suffix}`);
  }
}

/**
 * AOP 代理选项。
 */
export interface AopProxyOptions {
  /** 日志记录器（向后兼容，若提供 interceptors 则忽略） */
  logger?: Logger;
  /** 是否启用 AOP（默认 true） */
  enableAop?: boolean;
  /** 拦截器列表，按顺序执行 */
  interceptors?: Interceptor[];
}

/**
 * AOP 代理工厂。
 *
 * 使用方式（拦截器模式）：
 * ```typescript
 * const logInterceptor = new LogInterceptor(logAccess);
 * const service = AopProxy.wrap(rawService, {
 *   interceptors: [logInterceptor],
 * });
 * ```
 *
 * 使用方式（向后兼容，logger 模式）：
 * ```typescript
 * const service = AopProxy.wrap(rawService, { logger: new ConsoleLogger() });
 * ```
 */
export class AopProxy {
  /**
   * 包装目标对象，为所有方法注入四个切入点的切面能力。
   *
   * @param target 目标对象（通常是 Service 实例）
   * @param options 选项
   * @returns 与 target 同类型的代理对象
   */
  static wrap<T extends object>(target: T, options?: AopProxyOptions): T {
    const enableAop = options?.enableAop ?? true;

    // 构建拦截器列表
    let interceptors: Interceptor[] = [];
    if (options?.interceptors && options.interceptors.length > 0) {
      interceptors = options.interceptors;
    } else if (options?.logger) {
      // 向后兼容：将 logger 转为内置拦截器
      interceptors = [AopProxy.createLoggerInterceptor(options.logger)];
    } else {
      // 默认使用 ConsoleLogger
      interceptors = [AopProxy.createLoggerInterceptor(new ConsoleLogger())];
    }

    return new Proxy(target, {
      get(obj: T, prop: string | symbol): unknown {
        const value = Reflect.get(obj as Record<string, unknown>, prop);
        if (typeof value !== 'function') {
          return value;
        }
        const methodName = String(prop);
        const targetName = obj.constructor.name;
        const fn = value as (...args: unknown[]) => unknown;

        return function wrapped(this: unknown, ...args: unknown[]): unknown {
          if (!enableAop) {
            return fn.apply(obj, args);
          }

          // trace_id 自动生成：traceId 独立于 work_id / interact_id / info_id 等业务 ID。
          // 有效 trace_id 优先级：入参 Input.trace_id（显式传播）→ Context.trace_id → 新生成。
          // 生成结果回填到 Context（供日志与后续读取），不回填 Input（避免污染查询类入参的 trace_id 过滤字段）。
          let effectiveTraceId = AopProxy.pickField(args[0], 'trace_id');
          if (!effectiveTraceId) effectiveTraceId = AopProxy.pickField(args[1], 'trace_id');
          if (!effectiveTraceId) effectiveTraceId = IdGenerator.generate();
          const contextArg = args[1];
          if (contextArg && typeof contextArg === 'object' && !Array.isArray(contextArg)) {
            (contextArg as { trace_id?: string }).trace_id = effectiveTraceId;
          }

          const startedAt = Date.now();
          const ctx: InterceptContext = {
            targetName,
            methodName,
            input: args[0],
            context: args[1],
            output: args[2],
            startedAt,
            elapsedMs: 0,
          };

          // 切入点 1：beforeExecute（方法执行前 #1）
          AopProxy.runBeforeExecute(interceptors, ctx);

          // 切入点 2：preExecute（方法执行前 #2）
          AopProxy.runPreExecute(interceptors, ctx);

          try {
            const result = fn.apply(obj, args);

            // 处理异步方法（返回 Promise）
            if (result instanceof Promise) {
              return result
                .then((res: unknown) => {
                  ctx.elapsedMs = Date.now() - startedAt;
                  AopProxy.fillElapsed(args, ctx.elapsedMs);
                  // 切入点 3：postExecute（方法执行后 #1，仅成功）
                  AopProxy.runPostExecute(interceptors, ctx, res);
                  // 切入点 4：afterExecute（方法执行后 #2，始终）
                  AopProxy.runAfterExecute(interceptors, ctx);
                  return res;
                })
                .catch((err: unknown) => {
                  ctx.elapsedMs = Date.now() - startedAt;
                  AopProxy.fillElapsed(args, ctx.elapsedMs);
                  const error = err instanceof Error ? err : new Error(String(err));
                  // 切入点 4：afterExecute（方法执行后 #2，始终）
                  AopProxy.runAfterExecute(interceptors, ctx, error);
                  throw err;
                });
            }

            // 同步方法
            ctx.elapsedMs = Date.now() - startedAt;
            AopProxy.fillElapsed(args, ctx.elapsedMs);
            // 切入点 3：postExecute（方法执行后 #1，仅成功）
            AopProxy.runPostExecute(interceptors, ctx, result);
            // 切入点 4：afterExecute（方法执行后 #2，始终）
            AopProxy.runAfterExecute(interceptors, ctx);
            return result;
          } catch (err) {
            ctx.elapsedMs = Date.now() - startedAt;
            AopProxy.fillElapsed(args, ctx.elapsedMs);
            const error = err instanceof Error ? err : new Error(String(err));
            // 切入点 4：afterExecute（方法执行后 #2，始终）
            AopProxy.runAfterExecute(interceptors, ctx, error);
            throw err;
          }
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // 切入点执行器
  // -------------------------------------------------------------------------

  /**
   * 执行所有拦截器的 beforeExecute 切入点。
   */
  private static runBeforeExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.beforeExecute?.(ctx);
      } catch {
        // 拦截器异常不影响业务方法执行
      }
    }
  }

  /**
   * 执行所有拦截器的 preExecute 切入点。
   */
  private static runPreExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.preExecute?.(ctx);
      } catch {
        // 拦截器异常不影响业务方法执行
      }
    }
  }

  /**
   * 执行所有拦截器的 postExecute 切入点。
   */
  private static runPostExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
    result: unknown,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.postExecute?.(ctx, result);
      } catch {
        // 拦截器异常不影响业务方法执行
      }
    }
  }

  /**
   * 执行所有拦截器的 afterExecute 切入点。
   */
  private static runAfterExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
    error?: Error,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.afterExecute?.(ctx, error);
      } catch {
        // 拦截器异常不影响业务方法执行
      }
    }
  }

  // -------------------------------------------------------------------------
  // 内置工具
  // -------------------------------------------------------------------------

  /**
   * 将耗时写入第三个参数（Output）的 elapsed_ms 字段。
   */
  private static fillElapsed(args: unknown[], elapsed: number): void {
    const output = args[2];
    if (
      output !== null &&
      typeof output === 'object' &&
      !Array.isArray(output)
    ) {
      (output as { elapsed_ms?: number }).elapsed_ms = elapsed;
    }
  }

  /**
   * 创建使用 Logger 的内置拦截器（向后兼容）。
   */
  private static createLoggerInterceptor(logger: Logger): Interceptor {
    return {
      beforeExecute(ctx: InterceptContext): void {
        logger.debug(`${ctx.methodName} invoke`, {
          source: ctx.targetName,
          args: AopProxy.summarizeValue(ctx.input),
          trace_id: AopProxy.pickTraceId(ctx),
          work_id: AopProxy.pickField(ctx.input, 'work_id'),
          interact_id: AopProxy.pickField(ctx.input, 'interact_id'),
        });
      },
      afterExecute(ctx: InterceptContext, error?: Error): void {
        if (error) {
          logger.error(`${ctx.methodName} failed`, {
            source: ctx.targetName,
            elapsed_ms: ctx.elapsedMs,
            trace_id: AopProxy.pickTraceId(ctx),
            error: error.message,
          });
        } else {
          logger.debug(`${ctx.methodName} done`, {
            source: ctx.targetName,
            elapsed_ms: ctx.elapsedMs,
            trace_id: AopProxy.pickTraceId(ctx),
          });
        }
      },
    };
  }

  /**
   * 提取有效 trace_id：优先 Context（AOP 已回填），其次 Input（显式传播），无则 undefined。
   */
  private static pickTraceId(ctx: InterceptContext): string | undefined {
    return AopProxy.pickField(ctx.context, 'trace_id') ?? AopProxy.pickField(ctx.input, 'trace_id');
  }

  /**
   * 从对象中提取指定字段值（用于日志记录，无则返回 undefined）。
   */
  private static pickField(input: unknown, field: string): string | undefined {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const value = (input as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) return value;
    }
    return undefined;
  }

  /**
   * 简化值摘要，避免序列化大对象或循环引用。
   */
  private static summarizeValue(value: unknown): unknown {
    try {
      if (value === null || value === undefined) {
        return value;
      }
      if (typeof value === 'object') {
        const keys = Object.keys(value);
        return `{${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', ...' : ''}}`;
      }
      return value;
    } catch {
      return '[unserializable]';
    }
  }
}
