/**
 * @fileoverview LogProvider 接入层。
 *
 * 作为日志的唯一操作入口，封装 application 层 Service，
 * 通过 AOP 代理注入切面能力。
 *
 * 同时暴露 getRawService() 供 LogInterceptor 使用，
 * 避免 AOP 代理与日志切面之间产生递归调用。
 */

import { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { SQLiteRelationDBOptions } from '../../RelationDBProvider/infrastructure/SQLiteRelationDBRepository';
import { LogSchemaInitializer } from '../infrastructure/LogSchemaInitializer';
import { LogService } from '../application/LogService';
import {
  LogContext,
  AddLogInput,
  AddLogOutput,
  GetLogInput,
  GetLogOutput,
  SoLogInput,
  SoLogOutput,
  DelLogInput,
  DelLogOutput,
  CountLogInput,
  CountLogOutput,
  VisualizedLogInput,
  VisualizedLogOutput,
  EnableLogInput,
  EnableLogOutput,
  ConfigLogInput,
  ConfigLogOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class LogAccess {
  /** 原始 Service（未经 AOP 包装），供 LogInterceptor 使用 */
  private readonly rawService: LogService;
  /** AOP 包装后的 Service */
  private readonly service: LogService;

  /** 专用于日志的 RelationDB 实例 */
  private readonly relationDb: RelationDBAccess;

  // ===== 原始构造函数（保留作为参考）=====
  // constructor(relationDb: RelationDBAccess, logger?: Logger) {
  //   new LogSchemaInitializer(relationDb).init();
  //   this.rawService = new LogService(relationDb);
  //   this.service = AopProxy.wrap(this.rawService, { logger });
  // }

  // ===== 修改后的构造函数 =====
  constructor(
    relationDbOrOptions?: RelationDBAccess | SQLiteRelationDBOptions | string,
    logger?: Logger,
  ) {
    if (relationDbOrOptions && typeof relationDbOrOptions === 'object' && 'executeRaw' in relationDbOrOptions) {
      this.relationDb = relationDbOrOptions as RelationDBAccess;
    } else if (typeof relationDbOrOptions === 'string') {
      this.relationDb = new RelationDBAccess({ dbPath: relationDbOrOptions, wal: true, autoCreateConfigTable: true });
    } else if (relationDbOrOptions && typeof relationDbOrOptions === 'object') {
      this.relationDb = new RelationDBAccess(relationDbOrOptions as SQLiteRelationDBOptions);
    } else {
      this.relationDb = new RelationDBAccess({ dbPath: './data/brian_log.db', wal: true, autoCreateConfigTable: true });
    }

    new LogSchemaInitializer(this.relationDb).init();
    this.rawService = new LogService(this.relationDb);
    this.service = AopProxy.wrap(this.rawService, { logger });
  }

  /** 获取日志模块底层的 RelationDBAccess 实例 */
  getRelationDb(): RelationDBAccess {
    return this.relationDb;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.rawService.initialize();
  }

  /**
   * 获取原始 Service（未经 AOP 包装）。
   *
   * 供 LogInterceptor 使用，避免 AOP 代理与日志切面之间产生递归调用。
   */
  getRawService(): LogService {
    return this.rawService;
  }

  async addLog(i: AddLogInput, c: LogContext, o: AddLogOutput) {
    return this.service.addLog(i, c, o);
  }
  async getLog(i: GetLogInput, c: LogContext, o: GetLogOutput) {
    return this.service.getLog(i, c, o);
  }
  async soLog(i: SoLogInput, c: LogContext, o: SoLogOutput) {
    return this.service.soLog(i, c, o);
  }
  async delLog(i: DelLogInput, c: LogContext, o: DelLogOutput) {
    return this.service.delLog(i, c, o);
  }
  async countLog(i: CountLogInput, c: LogContext, o: CountLogOutput) {
    return this.service.countLog(i, c, o);
  }
  async visualizedLog(i: VisualizedLogInput, c: LogContext, o: VisualizedLogOutput) {
    return this.service.visualizedLog(i, c, o);
  }
  async enableLog(i: EnableLogInput, c: LogContext, o: EnableLogOutput) {
    return this.service.enableLog(i, c, o);
  }
  async configLog(i: ConfigLogInput, c: LogContext, o: ConfigLogOutput) {
    return this.service.configLog(i, c, o);
  }
  async queryLogs(options: {
    level?: string; source?: string; keyword?: string;
    trace_id?: string; work_id?: string; interact_id?: string;
    log_source?: string;
    start_time?: number; end_time?: number;
    page?: number; pageSize?: number;
  }) {
    return this.service.queryLogs(options);
  }
  async getLogStats(options?: { start_time?: number; end_time?: number }) {
    return this.service.getLogStats(options);
  }
  async listSources() {
    return this.service.listSources();
  }
}
