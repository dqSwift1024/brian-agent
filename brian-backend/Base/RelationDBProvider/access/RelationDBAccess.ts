/**
 * @fileoverview RelationDBProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 2. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 3. 实现 {@link IConfigStorage} 接口，供其他 Provider 操作各自的配置表；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 其他 Provider（LLMProvider、MCPProvider 等）通过本层访问关系数据库，
 * 不直接接触 Service 或 Repository。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { SQLiteRelationDBRepository } from '../infrastructure/SQLiteRelationDBRepository';
import type { SQLiteRelationDBOptions } from '../infrastructure/SQLiteRelationDBRepository';
import { RelationDBService } from '../application/RelationDBService';
import {
  DBContext,
  InsertDBInput,
  InsertDBOutput,
  DeleteDBInput,
  DeleteDBOutput,
  UpdateDBInput,
  UpdateDBOutput,
  SelectDBInput,
  SelectDBOutput,
  SelectOneDBInput,
  SelectOneDBOutput,
  CountDBInput,
  CountDBOutput,
  TransactionDBInput,
  TransactionDBOutput,
  VisualizedDBInput,
  VisualizedDBOutput,
  EnableDBInput,
  EnableDBOutput,
  CloseDBInput,
  CloseDBOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import type { IConfigStorage } from '../../shared/config/ConfigService';
import type { Condition } from '../../shared/query';

/**
 * RelationDBProvider 接入层。
 *
 * 作为关系数据库的唯一操作入口，上层（其他 Provider、application 层）
 * 通过本类访问关系数据库。
 *
 * 用法示例：
 * ```typescript
 * const access = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await access.initialize();
 *
 * const output = new InsertDBOutput();
 * await access.insertDB(
 *   { table: 'soul', data: [{ field: 'id', value: 'xxx' }] },
 *   output, new DBContext(),
 * );
 * ```
 */
export class RelationDBAccess implements IConfigStorage {
  private readonly repository: SQLiteRelationDBRepository;
  private readonly service: RelationDBService;

  /**
   * @param options SQLite 选项
   * @param logger 可选日志记录器
   */
  constructor(
    options: SQLiteRelationDBOptions,
    logger?: Logger,
  ) {
    this.repository = new SQLiteRelationDBRepository(options);
    const rawService = new RelationDBService(this.repository);
    // 通过代理模式增加切面注入能力（日志记录、耗时统计）
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：创建配置表、恢复 enabled 状态、写入默认配置。
   *
   * 必须在首次使用前调用。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  // -------------------------------------------------------------------------
  // CURD 操作（委托 Service）
  // -------------------------------------------------------------------------

  /** 新增记录 */
  async insertDB(input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.insertDB(input, output, context, metrics, report);
  }

  /** 删除记录 */
  async deleteDB(input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.deleteDB(input, output, context, metrics, report);
  }

  /** 更新记录 */
  async updateDB(input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateDB(input, output, context, metrics, report);
  }

  /** 查询记录列表 */
  async selectDB(input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectDB(input, output, context, metrics, report);
  }

  /** 查询单条记录 */
  async selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectOneDB(input, output, context, metrics, report);
  }

  /** 统计记录数 */
  async countDB(input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.countDB(input, output, context, metrics, report);
  }

  /** 执行事务 */
  async transactionDB(input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.transactionDB(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /** 可视化数据 */
  async visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedDB(input, output, context, metrics, report);
  }

  /** 启用/禁用关系数据库 */
  async enableDB(input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableDB(input, output, context, metrics, report);
  }

  /** 关闭数据库连接（终态操作） */
  async closeDB(input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeDB(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // IConfigStorage 实现（供其他 Provider 的 ConfigService 使用）
  // -------------------------------------------------------------------------

  /** {@inheritDoc} */
  async selectOne(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown> | null> {
    const output = new SelectOneDBOutput();
    const ok = await this.service.selectOneDB(
      { query_param: { table, conditions } },
      output, new DBContext(),
    );
    return ok ? output.row : null;
  }

  /**
   * 查询记录列表（便捷方法，供依赖 Provider 使用）。
   *
   * @param table 表名
   * @param options 查询选项（conditions / order_by / page / fields）
   * @returns 匹配记录列表
   */
  async select(
    table: string,
    options?: {
      conditions?: Condition[];
      order_by?: import('../../shared/query').OrderBy[];
      page?: import('../../shared/query').Page;
      fields?: string[];
    },
  ): Promise<Array<Record<string, unknown>>> {
    const output = new SelectDBOutput();
    await this.service.selectDB(
      {
        query_param: {
          table,
          conditions: options?.conditions,
          order_by: options?.order_by,
          page: options?.page,
          fields: options?.fields,
        },
      },
      output, new DBContext(),
    );
    return output.rows;
  }

  /** {@inheritDoc} */
  async insert(
    table: string,
    data: Array<{ field: string; value: unknown }>,
  ): Promise<number> {
    const output = new InsertDBOutput();
    await this.service.insertDB({ table, data }, output, new DBContext());
    return output.affected_rows;
  }

  /** {@inheritDoc} */
  async update(
    table: string,
    data: Array<{ field: string; value: unknown }>,
    conditions: Condition[],
  ): Promise<number> {
    const output = new UpdateDBOutput();
    await this.service.updateDB(
      { table, data, conditions },
      output, new DBContext(),
    );
    return output.affected_rows;
  }

  /**
   * 删除记录（便捷方法，供依赖 Provider 使用）。
   *
   * @param table 表名
   * @param conditions 删除条件（可选，不指定则删除全表）
   * @returns 影响行数
   */
  async delete(table: string, conditions?: Condition[]): Promise<number> {
    const output = new DeleteDBOutput();
    await this.service.deleteDB(
      { table, conditions },
      output, new DBContext(),
    );
    return output.affected_rows;
  }

  /** {@inheritDoc} */
  async count(table: string, conditions?: Condition[]): Promise<number> {
    const output = new CountDBOutput();
    await this.service.countDB({ table, conditions }, output, new DBContext());
    return output.count;
  }

  /**
   * 执行原生 DDL 语句（建表等）。
   *
   * 供各 Provider 的 infrastructure 层初始化表结构使用。
   */
  executeRaw(sql: string, params?: unknown[]): number {
    return this.repository.executeRaw(sql, params);
  }

  /**
   * 执行原生查询 SQL。
   */
  queryRaw<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T[] {
    return this.repository.queryRaw<T>(sql, params);
  }

  /**
   * 在事务中执行多个操作。
   *
   * 供各 Provider 在 infrastructure 层执行复杂事务使用。
   */
  transactionRaw(operations: import('../../shared/query').Operation[]): boolean {
    return this.repository.transaction(operations);
  }

  /**
   * 执行 WAL checkpoint 以回收 WAL 文件磁盘空间。
   *
   * 在 WAL 模式下，写事务会追加到 WAL 文件；长时间不 checkpoint 会导致 WAL 文件
   * 持续膨胀。在批量写入后调用此方法可回收磁盘空间。
   *
   * @param mode checkpoint 模式：PASSIVE（默认，不阻塞）、TRUNCATE（截断 WAL 文件至 0）
   * @returns checkpoint 结果
   */
  walCheckpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): { busy: boolean; log: number; checkpointed: number } {
    return this.repository.walCheckpoint(mode);
  }
}
