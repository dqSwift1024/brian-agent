/**
 * @fileoverview ToolProvider 系统资源监控服务层。
 *
 * 采集主机与进程的真实资源使用情况：
 * - CPU：进程 CPU 时间增量 / 采样窗口（首采样回退到系统负载均值）
 * - 内存：系统已用 / 总量（os.totalmem / os.freemem）
 * - 磁盘：文件系统块用量（fs.statfsSync）
 *
 * 纯采集逻辑，无数据库依赖，通过 SystemMonitorAccess 对外暴露。
 */

import os from 'node:os';
import fs from 'node:fs';

import type { SystemResourceMetrics } from '../domain/SystemMonitorTypes';

/** CPU 采样状态（用于计算进程 CPU 时间增量） */
interface CpuSample {
  /** 上次进程 CPU 时间（微秒） */
  usage: NodeJS.CpuUsage;
  /** 上次采样时刻（纳秒） */
  time: bigint;
}

export class SystemMonitorService {
  /** 磁盘使用率默认统计的挂载路径（无显式传入时使用） */
  private readonly diskPath: string;

  /** 上一次 CPU 采样（用于增量计算） */
  private lastCpuSample: CpuSample | null = null;

  /**
   * @param diskPath 磁盘使用率统计的目标路径，默认 `/`（根挂载点）
   */
  constructor(diskPath = '/') {
    this.diskPath = diskPath;
  }

  /**
   * 采集 CPU 使用率（%）。
   *
   * 通过两次 process.cpuUsage() 采样计算进程 CPU 时间增量在窗口内的占比：
   *   percent = (userΔ + systemΔ) / (elapsed × cpus) × 100
   *
   * 首次采样尚无增量基线，回退为系统 1 分钟负载均值占核数的比例。
   */
  getCpuUsagePercent(): number {
    const cpus = Math.max(1, os.cpus().length);
    const usage = process.cpuUsage();
    const now = process.hrtime.bigint();

    if (this.lastCpuSample) {
      const userDelta = usage.user - this.lastCpuSample.usage.user;
      const systemDelta = usage.system - this.lastCpuSample.usage.system;
      // hrtime 返回纳秒，CPU 时间返回微秒；窗口总可用微秒 = elapsed(μs) × cpus
      const elapsedUs = Number(now - this.lastCpuSample.time) / 1000;
      const totalUs = elapsedUs * cpus;
      this.lastCpuSample = { usage, time: now };
      if (totalUs <= 0) return 0;
      return this.clampPercent(((userDelta + systemDelta) / totalUs) * 100);
    }

    this.lastCpuSample = { usage, time: now };
    // 首采样：负载均值 / 核数 × 100
    return this.clampPercent((os.loadavg()[0] / cpus) * 100);
  }

  /** 采集内存使用率（%）：系统已用 / 总量 */
  getMemoryUsagePercent(): number {
    const total = os.totalmem();
    if (total <= 0) return 0;
    return this.clampPercent(((total - os.freemem()) / total) * 100);
  }

  /**
   * 采集磁盘使用率（%）：(blocks - bfree) / blocks × 100。
   *
   * @param path 目标路径，不传则使用构造时指定的 diskPath
   */
  getDiskUsagePercent(path?: string): number {
    try {
      const target = path ?? this.diskPath;
      const stat = fs.statfsSync(target);
      if (stat.blocks <= 0) return 0;
      const used = stat.blocks - stat.bfree;
      return this.clampPercent((used / stat.blocks) * 100);
    } catch {
      return 0;
    }
  }

  /** 一次性采集 CPU / 内存 / 磁盘使用率 */
  collect(path?: string): SystemResourceMetrics {
    return {
      cpu: this.getCpuUsagePercent(),
      memory: this.getMemoryUsagePercent(),
      disk: this.getDiskUsagePercent(path),
    };
  }

  /** 将百分比收敛到 [0, 100] 并保留一位小数 */
  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
  }
}
