/**
 * @fileoverview 不可用沙箱占位实现。
 *
 * 当平台缺少 isolated-vm 预编译二进制（如部分离线发行包）时，
 * SkillService 以本实现降级：服务正常启动，.js Skill 执行时返回
 * 明确的错误信息而非进程崩溃。
 */

import type { ISandbox, SandboxResult } from './ISandbox';

export class UnavailableJsSandbox implements ISandbox {
  constructor(private readonly reason: string) {}

  async execute(
    _code: string,
    _params: Record<string, unknown>,
    _timeoutMs: number,
  ): Promise<SandboxResult> {
    throw new Error(
      `[sandbox] 当前发行包缺少 JavaScript 沙箱原生模块，.js Skill 不可用。\n原因: ${this.reason}`,
    );
  }

  dispose(): void { /* 无资源 */ }
}
