/**
 * @fileoverview ToolProvider 系统资源监控接入层。
 *
 * 作为系统资源（CPU / 内存 / 磁盘）采集的统一对外入口。
 * 无状态采集工具，不依赖数据库、无 AOP 日志切面。
 *
 * 用法示例：
 * ```typescript
 * import { SystemMonitorAccess } from '@brian-agent/base';
 * const monitor = new SystemMonitorAccess('/data');
 * const metrics = monitor.collect();
 * console.log(metrics.cpu, metrics.memory, metrics.disk);
 * ```
 */

import { SystemMonitorService } from '../application/SystemMonitorService';
import type { SystemResourceMetrics } from '../domain/SystemMonitorTypes';

export class SystemMonitorAccess {
  private readonly service: SystemMonitorService;

  /**
   * @param diskPath 磁盘使用率统计的目标路径（默认 `/`）
   */
  constructor(diskPath?: string) {
    this.service = new SystemMonitorService(diskPath);
  }

  /** 采集 CPU 使用率（%） */
  getCpuUsagePercent(): number {
    return this.service.getCpuUsagePercent();
  }

  /** 采集内存使用率（%） */
  getMemoryUsagePercent(): number {
    return this.service.getMemoryUsagePercent();
  }

  /**
   * 采集磁盘使用率（%）。
   *
   * @param path 目标路径，不传则使用构造时指定的 diskPath
   */
  getDiskUsagePercent(path?: string): number {
    return this.service.getDiskUsagePercent(path);
  }

  /** 一次性采集 CPU / 内存 / 磁盘使用率 */
  collect(path?: string): SystemResourceMetrics {
    return this.service.collect(path);
  }
}
