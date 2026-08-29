/**
 * @fileoverview ToolProvider 系统资源监控接入层。
 *
 * 系统资源（CPU / 内存 / 磁盘）采集的统一对外入口，无状态采集工具。
 * 签名规范：`Boolean method(Input, Output, Context, Metrics, Report)`。
 */

import { SystemMonitorService } from '../application/SystemMonitorService';
import type {
  SystemMonitorContext,
  SoCpuUsageInput, SoCpuUsageOutput,
  SoMemoryUsageInput, SoMemoryUsageOutput,
  SoDiskUsageInput, SoDiskUsageOutput,
  SoResourceInput, SoResourceOutput,
} from '../domain/SystemMonitorTypes';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class SystemMonitorAccess {
  private readonly service: SystemMonitorService;

  /**
   * @param diskPath 磁盘使用率统计的目标路径（默认 `/`）
   */
  constructor(diskPath?: string) {
    this.service = new SystemMonitorService(diskPath);
  }

  /** 采集 CPU 使用率（%） */
  async soCpuUsage(input: SoCpuUsageInput, output: SoCpuUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getCpuUsagePercent();
    return true;
  }

  /** 采集内存使用率（%） */
  async soMemoryUsage(input: SoMemoryUsageInput, output: SoMemoryUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getMemoryUsagePercent();
    return true;
  }

  /** 采集磁盘使用率（%） */
  async soDiskUsage(input: SoDiskUsageInput, output: SoDiskUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getDiskUsagePercent(input.path);
    return true;
  }

  /** 一次性采集 CPU / 内存 / 磁盘使用率 */
  async soResource(input: SoResourceInput, output: SoResourceOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.metrics = this.service.collect(input.path);
    return true;
  }
}
