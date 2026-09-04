/**
 * @fileoverview 日志拦截器（LogInterceptor）。
 *
 * 实现 {@link Interceptor} 接口，在方法执行失败时调用 LogProvider 记录 ERROR 日志。
 *
 * 设计要点：
 * - 使用原始 LogService（未经 AOP 包装），避免与 AOP 代理产生递归调用；
 * - 日志写入采用 fire-and-forget 模式（不 await），不阻塞业务方法执行；
 * - 通过 shouldLog(targetName, methodName) 检查日志规则，仅记录被启用的模块/方法；
 * - **方法进入（invoke）/完成（done）日志已默认关闭**：这两类日志随每次 AOP 方法调用
 *   产生 2 条记录（此前曾达 30 条/秒），是 brian_log.db 膨胀与内存压力的主因，
 *   且监控价值远低于失败日志。业务代码需要过程可观测时，应显式调用 logProvider
 *   记录带业务语义的 INFO/WARN 日志，而非依赖 AOP 自动埋点。
 */

import type { Interceptor, InterceptContext } from '../../shared/aop/Interceptor';
import type { LogService } from '../application/LogService';
import type { LogData } from '../domain/types';
import { LogLevel, LogSource } from '../domain/types';

/**
 * 日志拦截器。
 *
 * 作为 AOP 切面之一，在方法执行失败时自动记录 ERROR 日志。
 * 通过 LogService.shouldLog() 检查日志规则，仅记录被启用的模块/方法。
 *
 * 用法示例：
 * ```typescript
 * const logAccess = new LogAccess(relationDb);
 * await logAccess.initialize();
 *
 * const logInterceptor = new LogInterceptor(logAccess.getRawService());
 *
 * // 配置只记录 SoulProvider 的日志
 * await logAccess.enableLog(
 *   { rules: [{ source: '*', method: '*', enable: false }, { source: 'SoulService', method: '*', enable: true }] },
 *   new EnableLogOutput(), new LogContext(),
 * );
 *
 * // 将拦截器注入到其他 Provider 的 AOP 代理中
 * const soulAccess = new SoulAccess(relationDb, {
 *   interceptors: [logInterceptor],
 * });
 * ```
 */
export class LogInterceptor implements Interceptor {
  /**
   * @param logService 原始 LogService（未经 AOP 包装）
   */
  constructor(private readonly logService: LogService) {}

  /**
   * 切入点 4（方法执行后）：仅记录失败（ERROR）。
   *
   * 消息格式 "{methodName} failed: {error.message}"，附 elapsed_ms / trace_id / caller /
   * work_id / interact_id。成功路径不产生任何日志。
   * 通过 shouldLog 检查日志规则，未启用的模块/方法跳过记录。
   */
  afterExecute(ctx: InterceptContext, error?: Error): void {
    if (!error) {
      return;
    }

    // 检查日志规则
    if (!this.logService.shouldLog(ctx.targetName, ctx.methodName)) {
      return;
    }

    const data: LogData = {
      level: LogLevel.ERROR,
      source: ctx.targetName,
      message: `${ctx.methodName} failed: ${error.message}`,
      elapsed_ms: ctx.elapsedMs,
      metadata: { log_source: LogSource.AOP },
    };

    // 从 input 中提取 trace_id
    if (ctx.input && typeof ctx.input === 'object' && 'trace_id' in ctx.input) {
      const traceId = (ctx.input as { trace_id?: string }).trace_id;
      if (traceId) {
        data.trace_id = traceId;
      }
    }

    // 从 context 中提取 caller
    if (ctx.context && typeof ctx.context === 'object' && 'caller' in ctx.context) {
      const caller = (ctx.context as { caller?: string }).caller;
      if (caller) {
        data.caller = caller;
      }
    }

    // 从 input 中提取 work_id 和 interact_id
    if (ctx.input && typeof ctx.input === 'object') {
      const input = ctx.input as { work_id?: string; interact_id?: string };
      if (input.work_id) data.work_id = input.work_id;
      if (input.interact_id) data.interact_id = input.interact_id;
    }

    // fire-and-forget：不阻塞业务方法
    this.logService.addLog({ data }, {} as never, {} as never).catch(() => {});
  }
}
