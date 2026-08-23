/**
 * @fileoverview ToolProvider 系统资源监控测试（SystemMonitorAccess）。
 *
 * 测试范围：
 * - collect：CPU / 内存 / 磁盘使用率均为 [0, 100] 内的数值
 * - 磁盘使用率：对不存在路径容错返回 0
 * - CPU 首采样与二次采样均返回合法值
 *
 * 纯采集测试，无数据库依赖。
 */

import { describe, it, expect } from 'vitest';
import { SystemMonitorAccess } from '../ToolProvider';

describe('SystemMonitorAccess', () => {
  const monitor = new SystemMonitorAccess('/');

  it('should collect cpu/memory/disk as valid percentages', () => {
    const metrics = monitor.collect();
    expect(metrics).toHaveProperty('cpu');
    expect(metrics).toHaveProperty('memory');
    expect(metrics).toHaveProperty('disk');
    for (const key of ['cpu', 'memory', 'disk'] as const) {
      const value = metrics[key];
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('should return valid memory percentage', () => {
    const memory = monitor.getMemoryUsagePercent();
    expect(memory).toBeGreaterThanOrEqual(0);
    expect(memory).toBeLessThanOrEqual(100);
  });

  it('should return valid cpu percentage across multiple samples', () => {
    for (let i = 0; i < 3; i++) {
      const cpu = monitor.getCpuUsagePercent();
      expect(cpu).toBeGreaterThanOrEqual(0);
      expect(cpu).toBeLessThanOrEqual(100);
    }
  });

  it('should tolerate missing disk path', () => {
    const disk = monitor.getDiskUsagePercent('/definitely/not/exist/path');
    expect(disk).toBe(0);
  });
});
