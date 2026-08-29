/**
 * @fileoverview CronProvider 领域层类型定义。
 *
 * CronProvider 是定时任务调度中心（Base 层），通过发布订阅模型接收「定时时间」
 * 与「需要定时执行的接口（handler）」，在时间到达时触发执行，并记录执行历史。
 */

import { Input, Context, Output } from '../../shared/base';

/** 定时任务上下文 */
export class CronContext extends Context {}

/** 定时任务记录（cron_task 表） */
export interface CronTaskRecord {
  id: string;
  /** 任务名（唯一，如 tag_aging） */
  name: string;
  /** 任务描述 */
  description: string;
  /** 6 字段 cron 表达式（秒 分 时 日 月 周） */
  cron: string;
  /** 是否启用（1/0） */
  enabled: number;
  /** 上次执行时间戳（0 表示从未执行） */
  last_run: number;
  /** 下次执行时间戳（0 表示无） */
  next_run: number;
  created: number;
  updated: number;
}

/** 定时任务执行记录（cron_task_run 表） */
export interface CronTaskRunRecord {
  id: string;
  task_id: string;
  task_name: string;
  /** 开始执行时间戳 */
  started_at: number;
  /** 结束执行时间戳（运行中为 0） */
  finished_at: number;
  /** SUCCESS / FAILED */
  status: string;
  /** 执行结果摘要 */
  result: string;
  /** 错误信息（无错误为空串） */
  error: string;
  created: number;
}

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

/** listCronTasks 出参 */
export class ListCronTasksInput extends Input {
}

export class ListCronTasksOutput extends Output {
  tasks: CronTaskRecord[] = [];
}

// ---------------------------------------------------------------------------
// 查询单个任务
// ---------------------------------------------------------------------------

/** soCronTask 入参 */
export class GetCronTaskInput extends Input {
  name!: string;
}

/** soCronTask 出参 */
export class GetCronTaskOutput extends Output {
  task: CronTaskRecord | null = null;
}

// ---------------------------------------------------------------------------
// 更新 cron
// ---------------------------------------------------------------------------

/** setCronTask 入参 */
export class SetCronTaskInput extends Input {
  name!: string;
  cron!: string;
}

/** setCronTask 出参 */
export class SetCronTaskOutput extends Output {
  task: CronTaskRecord | null = null;
}

// ---------------------------------------------------------------------------
// 启用/禁用
// ---------------------------------------------------------------------------

/** setCronTaskEnabled 入参 */
export class SetCronTaskEnabledInput extends Input {
  name!: string;
  enabled!: boolean;
}

/** setCronTaskEnabled 出参 */
export class SetCronTaskEnabledOutput extends Output {
  task: CronTaskRecord | null = null;
}

// ---------------------------------------------------------------------------
// 单次触发
// ---------------------------------------------------------------------------

/** triggerCronTask 入参 */
export class TriggerCronTaskInput extends Input {
  name!: string;
}

/** triggerCronTask 出参 */
export class TriggerCronTaskOutput extends Output {
  run: CronTaskRunRecord | null = null;
}

// ---------------------------------------------------------------------------
// 执行历史
// ---------------------------------------------------------------------------

/** listCronTaskRuns 入参 */
export class ListCronTaskRunsInput extends Input {
  name?: string;
  /** 返回条数，默认 50 */
  limit?: number;
}

/** listCronTaskRuns 出参 */
export class ListCronTaskRunsOutput extends Output {
  runs: CronTaskRunRecord[] = [];
}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

export const CRON_TASK_TABLE = 'cron_task';
export const CRON_TASK_RUN_TABLE = 'cron_task_run';

/** 定时任务执行状态 */
export const CRON_RUN_STATUS = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
