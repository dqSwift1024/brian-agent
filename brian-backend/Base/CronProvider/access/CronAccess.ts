/**
 * @fileoverview CronProvider 接入层。
 *
 * 作为定时任务调度中心的统一入口。提供两类接口：
 * 1. 内部布线接口（registerTask / start / stop）：供 DI 层注册任务与启停调度循环；
 * 2. 查询/更新接口（listCronTasks / getCronTask / setCronTask / setCronTaskEnabled /
 *    triggerCronTask / listCronTaskRuns）：采用 (Input, Context, Output) 签名，供 HTTP 层调用。
 *
 * 说明：CronService 是状态化调度器（持有 handler 注册表与定时器），因此不做 AopProxy 包装，
 * 其内部通过注入的 logger 记录执行日志。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import { CronSchemaInitializer } from '../infrastructure/CronSchemaInitializer';
import { CronService } from '../application/CronService';
import type { CronHandler } from '../application/CronService';
import {
  CronContext,
  ListCronTasksOutput,
  GetCronTaskInput,
  GetCronTaskOutput,
  SetCronTaskInput,
  SetCronTaskOutput,
  SetCronTaskEnabledInput,
  SetCronTaskEnabledOutput,
  TriggerCronTaskInput,
  TriggerCronTaskOutput,
  ListCronTaskRunsInput,
  ListCronTaskRunsOutput,
} from '../domain/types';

export class CronAccess {
  private readonly service: CronService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new CronSchemaInitializer(relationDb).init();
    this.service = new CronService(relationDb, logger);
  }

  // -------------------------------------------------------------------------
  // 内部布线（发布订阅）
  // -------------------------------------------------------------------------

  /** 订阅定时任务：注册 name / 默认 cron / handler */
  async registerTask(
    name: string,
    description: string | undefined,
    defaultCron: string,
    handler: CronHandler,
  ): Promise<void> {
    await this.service.registerTask({ name, description, defaultCron, handler });
  }

  /** 启动调度循环 */
  start(): void {
    this.service.start();
  }

  /** 停止调度循环 */
  stop(): void {
    this.service.stop();
  }

  // -------------------------------------------------------------------------
  // 查询 / 更新
  // -------------------------------------------------------------------------

  async listCronTasks(_context: CronContext, output: ListCronTasksOutput): Promise<boolean> {
    output.tasks = this.service.listTasks();
    return true;
  }

  async getCronTask(input: GetCronTaskInput, _context: CronContext, output: GetCronTaskOutput): Promise<boolean> {
    output.task = this.service.getTask(input.name);
    return true;
  }

  async setCronTask(input: SetCronTaskInput, _context: CronContext, output: SetCronTaskOutput): Promise<boolean> {
    output.task = this.service.setCron(input.name, input.cron);
    return true;
  }

  async setCronTaskEnabled(input: SetCronTaskEnabledInput, _context: CronContext, output: SetCronTaskEnabledOutput): Promise<boolean> {
    output.task = this.service.setEnabled(input.name, input.enabled);
    return true;
  }

  async triggerCronTask(input: TriggerCronTaskInput, _context: CronContext, output: TriggerCronTaskOutput): Promise<boolean> {
    output.run = await this.service.trigger(input.name);
    return true;
  }

  async listCronTaskRuns(input: ListCronTaskRunsInput, _context: CronContext, output: ListCronTaskRunsOutput): Promise<boolean> {
    output.runs = this.service.listRuns(input.name, input.limit ?? 50);
    return true;
  }
}
