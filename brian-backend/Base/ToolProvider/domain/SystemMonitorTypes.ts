/**
 * @fileoverview ToolProvider 系统资源监控类型定义。
 *
 * 用于监控页「系统健康」展示框的 CPU / 内存 / 磁盘真实采集。
 * 采集逻辑位于 SystemMonitorService，由 SystemMonitorAccess 对外暴露。
 */

/** 系统资源使用率（百分比 0-100） */
export interface SystemResourceMetrics {
  /** CPU 使用率（%） */
  cpu: number;
  /** 内存使用率（%） */
  memory: number;
  /** 磁盘使用率（%） */
  disk: number;
}
