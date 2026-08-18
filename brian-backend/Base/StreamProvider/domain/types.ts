/**
 * @fileoverview StreamProvider 领域层类型定义。
 *
 * StreamProvider 负责统一管理服务端的 SSE (Server-Sent Events) 端点，
 * 接收来自各层（编排、Agent构建、Agent执行等）的事件与数据流，
 * 按照结构化 BrianSSEMessage 协议，分块（chunk 2-5字符）流式输出给前端。
 * 具备会话隔离、心跳保活、以及多 Agent 并发时的流缓冲与通道隔离能力。
 */

import { Input, Context, Output } from '../../shared/base';

/** StreamProvider 上下文 */
export class StreamContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

/** SSE 消息类型 */
export type SSEMessageType = 'TEXT' | 'DAG' | 'CONTEXT' | 'AGENT_SPEC' | 'TRACE' | 'CONTROL';

/** 结构化 SSE 消息对象协议 */
export interface BrianSSEMessage<T = unknown> {
  /** 唯一消息 ID */
  msg_id: string;
  /** 单会话内严格单调递增序号 (0, 1, 2, ...) */
  seq: number;
  /** 会话 ID */
  session_id: string;
  /** 单轮交互 ID */
  interact_id: string;
  /** 编排工作 ID */
  work_id: string;
  /** 产出该消息的 Agent ID (用于多 Agent 并发隔离) */
  agent_id?: string;
  /** 产出该消息的 Agent 名称 */
  agent_name?: string;
  /** 产出该消息的 Agent 类型 */
  agent_type?: string;
  /** 所属 DAG 节点 ID */
  node_id?: string;
  /** SSE 事件名（如 agent_thinking, text, dag_node_start, done 等） */
  event: string;
  /** 消息内容大类 */
  msg_type: SSEMessageType;
  /** 预期完整长度（已知时传递） */
  full_length?: number;
  /** 本次推送的 chunk 长度（针对文本类为字符数，对象类为 1） */
  chunk_length: number;
  /** 当前通道/任务累计已推送长度 */
  accumulated_length: number;
  /** 服务端统一时间戳（毫秒） */
  timestamp: number;
  /** 结构化载荷数据 */
  data: T;
}

/** 流式输出写入器（回调函数或写入接口） */
export type StreamWriter = (chunk: string) => boolean | void | Promise<boolean | void>;

/** 注册 SSE 端点入参 */
export class RegisterStreamInput extends Input {
  session_id!: string;
  writer!: StreamWriter;
  onClose?: () => void;
}

/** 注册 SSE 端点出参 */
export class RegisterStreamOutput extends Output {
  client_id = '';
  registered = false;
}

/** 推送流式消息入参 */
export class PushStreamInput<T = unknown> extends Input {
  session_id!: string;
  event!: string;
  msg_type: SSEMessageType = 'TEXT';
  data!: T;
  interact_id?: string;
  work_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  /** 是否需要按 2-5 字符进行打字机 chunk 分片（仅当 data 包含字符串或为字符串时生效） */
  enable_chunking?: boolean;
  /** 自定义最小 chunk 字符数（默认 2） */
  chunk_min?: number;
  /** 自定义最大 chunk 字符数（默认 5） */
  chunk_max?: number;
  /** 每个 chunk 发送微延迟（毫秒，默认 0 即同步批分片推送，避免阻塞协程） */
  chunk_delay_ms?: number;
}

/** 推送流式消息出参 */
export class PushStreamOutput extends Output {
  msg_id = '';
  seq = 0;
  pushed = false;
}

/** 关闭 SSE 端点入参 */
export class CloseStreamInput extends Input {
  session_id!: string;
  reason?: string;
}

/** 关闭 SSE 端点出参 */
export class CloseStreamOutput extends Output {
  closed = false;
}

/** 获取流端点统计信息出参 */
export class GetStreamStatsOutput extends Output {
  active_sessions_count = 0;
  active_sessions: string[] = [];
}

/** 配置 StreamProvider 入参 */
export class ConfigStreamInput extends Input {
  sse_heartbeat_interval_ms?: number;
  chunk_min_chars?: number;
  chunk_max_chars?: number;
}

/** 配置 StreamProvider 出参 */
export class ConfigStreamOutput extends Output {
  updated = false;
}

/** 表名与常量定义 */
export const STREAM_CONFIG_TABLE = 'stream_config';

export interface StreamConfigRecord {
  id: string;
  sse_heartbeat_interval_ms: number;
  chunk_min_chars: number;
  chunk_max_chars: number;
  created: number;
  updated: number;
}
