/**
 * @fileoverview ChunkProvider 接入层。
 *
 * DDD 中 access 层作为模块对外的统一入口，提供 (Input, Context, Output) 签名的方法调用。
 * 通过 AOP 代理注入日志记录与耗时统计切面。
 */

import { ChunkService } from '../application/ChunkService';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import {
  ChunkContext,
  ChunkTextInput,
  ChunkTextOutput,
  ChunkFileInput,
  ChunkFileOutput,
} from '../domain/types';

export class ChunkAccess {
  private readonly service: ChunkService;

  constructor(logger?: Logger) {
    const rawService = new ChunkService();
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async chunkText(
    input: ChunkTextInput,
    context: ChunkContext,
    output: ChunkTextOutput,
  ): Promise<boolean> {
    return this.service.chunkText(input, context, output);
  }

  async chunkFile(
    input: ChunkFileInput,
    context: ChunkContext,
    output: ChunkFileOutput,
  ): Promise<boolean> {
    return this.service.chunkFile(input, context, output);
  }
}
