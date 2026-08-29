/**
 * @fileoverview SoulProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 SoulSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { SoulSchemaInitializer } from '../infrastructure/SoulSchemaInitializer';
import { SoulService } from '../application/SoulService';
import {
  SoulContext,
  AddSoulInput,
  AddSoulOutput,
  DelSoulInput,
  DelSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  EnableSoulInput,
  EnableSoulOutput,
  CloseSoulInput,
  CloseSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * SoulProvider 接入层。
 *
 * 作为 Soul 的唯一操作入口，上层通过本类访问 Soul 数据。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const soulAccess = new SoulAccess(relationDb);
 * await soulAccess.initialize();
 *
 * const output = new AddSoulOutput();
 * await soulAccess.addSoul(
 *   { data: { soul_content: '...', soul_brief: '...', soul_usage: '...' } },
 *   output, new SoulContext(),
 * );
 * ```
 */
export class SoulAccess {
  private readonly service: SoulService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new SoulSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new SoulService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增 Soul */
  async addSoul(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSoul(input, output, context, metrics, report);
  }

  /** 删除 Soul */
  async delSoul(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delSoul(input, output, context, metrics, report);
  }

  /** 更新 Soul */
  async updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSoul(input, output, context, metrics, report);
  }

  /** 获取 Soul */
  async soSoulById(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulById(input, output, context, metrics, report);
  }

  /** 搜索 Soul */
  async soSoul(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoul(input, output, context, metrics, report);
  }

  /** 启用/禁用 Soul 组件 */
  async enableSoul(input: EnableSoulInput, output: EnableSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableSoul(input, output, context, metrics, report);
  }

  /** 关闭 Soul 组件（终态操作） */
  async closeSoul(input: CloseSoulInput, output: CloseSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeSoul(input, output, context, metrics, report);
  }

  /** 记录 Soul 使用次数（upsert） */
  async recordSoulUsage(input: RecordSoulUsageInput, output: RecordSoulUsageOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.recordSoulUsage(input, output, context, metrics, report);
  }
}
