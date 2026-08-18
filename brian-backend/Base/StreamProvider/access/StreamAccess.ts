/**
 * @fileoverview StreamProvider 接入层。
 *
 * 作为统一流式输出（SSE）的操作入口，封装 application 层 Service。
 * 提供标准 (Input, Context, Output) 方法及便捷推送方法。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { StreamSchemaInitializer } from '../infrastructure/StreamSchemaInitializer';
import { StreamService } from '../application/StreamService';
import {
  StreamContext,
  RegisterStreamInput,
  RegisterStreamOutput,
  PushStreamInput,
  PushStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  GetStreamStatsOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
  SSEMessageType,
} from '../domain/types';
import type { Logger } from '../../shared/aop/AopProxy';

export class StreamAccess {
  private readonly service: StreamService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new StreamSchemaInitializer(relationDb).init();
    this.service = new StreamService(relationDb, logger);
  }

  async registerStream(
    input: RegisterStreamInput,
    _context: StreamContext,
    output: RegisterStreamOutput,
  ): Promise<boolean> {
    return this.service.registerStream(input, output);
  }

  async pushStream<T = unknown>(
    input: PushStreamInput<T>,
    _context: StreamContext,
    output: PushStreamOutput,
  ): Promise<boolean> {
    return this.service.pushStream(input, output);
  }

  async closeStream(
    input: CloseStreamInput,
    _context: StreamContext,
    output: CloseStreamOutput,
  ): Promise<boolean> {
    return this.service.closeStream(input, output);
  }

  async getStreamStats(
    _context: StreamContext,
    output: GetStreamStatsOutput,
  ): Promise<boolean> {
    return this.service.getStreamStats(output);
  }

  async configStream(
    input: ConfigStreamInput,
    _context: StreamContext,
    output: ConfigStreamOutput,
  ): Promise<boolean> {
    return this.service.configStream(input, output);
  }

  // ---------------------------------------------------------------------------
  // 业务便捷调用扩展（直通底层服务）
  // ---------------------------------------------------------------------------

  /**
   * 推送打字机文本片段（自动 2-5 字符 chunk 切片）
   */
  async pushText(
    sessionId: string,
    event: string,
    text: string,
    meta?: {
      interact_id?: string;
      work_id?: string;
      agent_id?: string;
      node_id?: string;
      chunk_delay_ms?: number;
    },
  ): Promise<boolean> {
    const input = Object.assign(new PushStreamInput<string>(), {
      session_id: sessionId,
      event,
      msg_type: 'TEXT' as SSEMessageType,
      data: text,
      interact_id: meta?.interact_id,
      work_id: meta?.work_id,
      agent_id: meta?.agent_id,
      node_id: meta?.node_id,
      enable_chunking: true,
      chunk_delay_ms: meta?.chunk_delay_ms,
    });
    const output = new PushStreamOutput();
    return this.service.pushStream(input, output);
  }

  /**
   * 推送结构化事件对象（DAG事件、上下文事件、Agent规格事件、控制事件等）
   */
  async pushEvent<T = unknown>(
    sessionId: string,
    event: string,
    msgType: SSEMessageType,
    data: T,
    meta?: {
      interact_id?: string;
      work_id?: string;
      agent_id?: string;
      node_id?: string;
    },
  ): Promise<boolean> {
    const input = Object.assign(new PushStreamInput<T>(), {
      session_id: sessionId,
      event,
      msg_type: msgType,
      data,
      interact_id: meta?.interact_id,
      work_id: meta?.work_id,
      agent_id: meta?.agent_id,
      node_id: meta?.node_id,
      enable_chunking: false,
    });
    const output = new PushStreamOutput();
    return this.service.pushStream(input, output);
  }
}
