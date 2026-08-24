import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  CountDBInput, CountDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, NotFoundError, Operator,
  type Logger, type Condition,
  type StreamAccess,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  LastNInfoInput, LastNInfoOutput,
  GraphInfoInput, GraphInfoOutput,
  KeywordKInfoInput, KeywordKInfoOutput,
  PinInfoInput, PinInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import type { WriterAgentAccess } from '@brian-agent/agent';
import { SaveUserProfileInput, SaveUserProfileOutput, WriterAgentContext } from '@brian-agent/agent';
import type { EvolutorAgentAccess } from '@brian-agent/agent';
import { GetEvaluationInput, GetEvaluationOutput, EvolutorAgentContext } from '@brian-agent/agent';
import type { OrchestrationEntryAccess } from '@brian-agent/orchestration';
import {
  OrchestrationEntryContext, ReceiveWorkInput, ReceiveWorkOutput,
  CancelWorkInput as OrchCancelWorkInput, CancelWorkOutput as OrchCancelWorkOutput,
  ConfirmIntentInput as OrchConfirmIntentInput, ConfirmIntentOutput as OrchConfirmIntentOutput,
} from '@brian-agent/orchestration';
import {
  ChatContext,
  SubmitWorkInput, SubmitWorkOutput,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
  CheckSessionOverflowInput, CheckSessionOverflowOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  GetMessageGraphInput, GetMessageGraphOutput,
  CancelWorkInput, CancelWorkOutput,
  ConfirmIntentInput, ConfirmIntentOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  type SSEEvent,
} from '../domain/types';

export class ChatService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly orchestrationEntry: OrchestrationEntryAccess,
    private readonly logger?: Logger,
    private readonly streamAccess?: StreamAccess,
  ) {}

  // ===== 原始 submitWork 与 openChatStream 实现（保留作为参考） =====
  /*
  async submitWork(
    input: SubmitWorkInput,
    context: ChatContext,
    output: SubmitWorkOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const overflowInput = Object.assign(new CheckSessionOverflowInput(), {
      session_id: input.session_id,
    });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, context, overflowOutput);
    if (overflowOutput.is_overflowed) {
      throw new ValidationError(`Session ${input.session_id} has exceeded message limit`);
    }

    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();

    let userProfile: Record<string, unknown> | undefined;
    try {
      const profileOut = Object.assign(new (await this.getWriterProfileOutputClass())(), {});
      await this.writerAgent.getUserProfile(
        Object.assign(new (await this.getWriterProfileInputClass())(), {
          session_id: input.session_id,
        }),
        new (await this.getWriterAgentContextClass())(),
        profileOut,
      );
      userProfile = profileOut.user_profile;
    } catch {
      / * best-effort * /
    }

    const citingMsgIds = Array.from(new Set([
      ...(input.citing_msg_ids ?? []),
      ...(input.selected_msg_ids ?? []),
    ]));

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: input.session_id,
      user_query: input.msg_content,
      force_orchestration_strategy: input.force_orchestration_strategy,
      user_profile: userProfile,
      citing_msg_ids: citingMsgIds,
      selected_msg_ids: input.selected_msg_ids ?? [],
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwContext = Object.assign(new OrchestrationEntryContext(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
    });

    let workOk = false;
    try {
      workOk = await this.orchestrationEntry.receiveWork(rwInput, rwContext, rwOutput);
    } catch (err: unknown) {
      this.logger?.error?.('submitWork: orchestration failed', {
        session_id: input.session_id,
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
      output.work_id = workId;
      output.interact_id = interactId;
      return false;
    }

    const finalResponse = rwOutput.final_response || '';

    try {
      const evalOut = Object.assign(new (await this.getEvalOutputClass())(), {});
      await this.evolutorAgent.getEvaluation(
        Object.assign(new (await this.getEvalInputClass())(), {
          conditions: [{ field: 'work_id', operator: 'EQ', value: workId }],
        }),
        new (await this.getEvolutorAgentContextClass())(),
        evalOut,
      );
    } catch {
      / * best-effort * /
    }

    output.work_id = workId;
    output.interact_id = interactId;
    return workOk;
  }
  */

  // ===== 修改后的 submitWork 与 openChatStream 实现：增加第一条消息自动生成会话名称（50字截断，若已有名称则不覆盖） =====
  async submitWork(
    input: SubmitWorkInput,
    context: ChatContext,
    output: SubmitWorkOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const overflowInput = Object.assign(new CheckSessionOverflowInput(), {
      session_id: input.session_id,
    });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, context, overflowOutput);
    if (overflowOutput.is_overflowed) {
      throw new ValidationError(`Session ${input.session_id} has exceeded message limit`);
    }

    // 自动判断并生成会话名称（若尚未有特定名称，以第一条消息做50字符截断）
    await this.autoGenerateSessionTitleIfEmpty(input.session_id, input.msg_content);

    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();

    let userProfile: Record<string, unknown> | undefined;
    try {
      const profileOut = Object.assign(new (await this.getWriterProfileOutputClass())(), {});
      await this.writerAgent.getUserProfile(
        Object.assign(new (await this.getWriterProfileInputClass())(), {
          session_id: input.session_id,
        }),
        new (await this.getWriterAgentContextClass())(),
        profileOut,
      );
      userProfile = profileOut.user_profile;
    } catch {
      /* best-effort */
    }

    const citingMsgIds = Array.from(new Set([
      ...(input.citing_msg_ids ?? []),
      ...(input.selected_msg_ids ?? []),
    ]));

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: input.session_id,
      user_query: input.msg_content,
      force_orchestration_strategy: input.force_orchestration_strategy,
      user_profile: userProfile,
      citing_msg_ids: citingMsgIds,
      selected_msg_ids: input.selected_msg_ids ?? [],
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwContext = Object.assign(new OrchestrationEntryContext(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
    });

    let workOk = false;
    try {
      workOk = await this.orchestrationEntry.receiveWork(rwInput, rwContext, rwOutput);
    } catch (err: unknown) {
      this.logger?.error?.('submitWork: orchestration failed', {
        session_id: input.session_id,
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
      output.work_id = workId;
      output.interact_id = interactId;
      return false;
    }

    const finalResponse = rwOutput.final_response || '';

    try {
      const evalOut = Object.assign(new (await this.getEvalOutputClass())(), {});
      await this.evolutorAgent.getEvaluation(
        Object.assign(new (await this.getEvalInputClass())(), {
          conditions: [{ field: 'work_id', operator: 'EQ', value: workId }],
        }),
        new (await this.getEvolutorAgentContextClass())(),
        evalOut,
      );
    } catch {
      /* best-effort */
    }

    output.work_id = workId;
    output.interact_id = interactId;
    return workOk;
  }

  async openChatStream(
    input: OpenChatStreamInput,
    context: ChatContext,
    output: OpenChatStreamOutput,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const sessionExists = await this.checkSessionExists(input.session_id);
    if (!sessionExists) {
      throw new NotFoundError('Session', input.session_id);
    }

    // trace_id 统一由后端经 ToolProvider(IdGenerator) 生成 UUID v4，
    // 作为本次问答的链路追踪 ID 贯穿整条处理链路与日志，不再依赖前端透传。
    // 优先复用 AOP 层已生成并回填到 Context 的 trace_id，保证日志与 SSE 事件口径一致。
    const traceId = context.trace_id || IdGenerator.generate();
    context.trace_id = traceId;

    const overflowInput = Object.assign(new CheckSessionOverflowInput(), {
      session_id: input.session_id,
    });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, context, overflowOutput);
    if (overflowOutput.is_overflowed) {
      const errEvent: SSEEvent = {
        event: 'error',
        data: { error_message: `Session ${input.session_id} has exceeded message limit`, error_code: 'OVERFLOW' },
      };
      output.events = [errEvent];
      return true;
    }

    // 自动判断并生成会话名称（若尚未有特定名称，以第一条消息做50字符截断）
    await this.autoGenerateSessionTitleIfEmpty(input.session_id, input.msg_content);

    const events: SSEEvent[] = [];
    const emit = (event: string, data: Record<string, unknown>) => {
      const evt: SSEEvent = { event, data };
      events.push(evt);
      onEvent?.(evt);
    };

    emit('connected', { session_id: input.session_id, trace_id: traceId });
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
      await this.streamAccess.pushEvent(input.session_id, 'connected', 'CONTROL', {
        session_id: input.session_id,
        trace_id: traceId,
      });
    }

    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();

    let userProfile: Record<string, unknown> | undefined;
    try {
      const profileOut = Object.assign(new (await this.getWriterProfileOutputClass())(), {});
      await this.writerAgent.getUserProfile(
        Object.assign(new (await this.getWriterProfileInputClass())(), {
          session_id: input.session_id,
        }),
        new (await this.getWriterAgentContextClass())(),
        profileOut,
      );
      userProfile = profileOut.user_profile;
    } catch {
      /* best-effort */
    }

    emit('loading', { work_id: workId });
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
      await this.streamAccess.pushEvent(input.session_id, 'loading', 'CONTROL', {
        work_id: workId,
      }, { work_id: workId, interact_id: interactId });
    }

    const citingMsgIds = Array.from(new Set([
      ...(input.citing_msg_ids ?? []),
      ...(input.selected_msg_ids ?? []),
    ]));

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: input.session_id,
      user_query: input.msg_content,
      trace_id: traceId,
      force_orchestration_strategy: input.force_orchestration_strategy,
      user_profile: userProfile,
      citing_msg_ids: citingMsgIds,
      selected_msg_ids: input.selected_msg_ids ?? [],
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwContext = Object.assign(new OrchestrationEntryContext(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
    });

    const startedAt = Date.now();
    let tokenUsage: Record<string, unknown> = {};
    let workOk = false;
    try {
      workOk = await this.orchestrationEntry.receiveWork(rwInput, rwContext, rwOutput);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('openChatStream: orchestration failed', {
        session_id: input.session_id,
        work_id: workId,
        trace_id: traceId,
        error: errorMsg,
      });
      emit('error', { work_id: workId, trace_id: traceId, error_message: errorMsg, error_code: 'ORCHESTRATION_FAILED' });
      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
        await this.streamAccess.pushEvent(input.session_id, 'error', 'CONTROL', {
          work_id: workId,
          trace_id: traceId,
          error_message: errorMsg,
          error_code: 'ORCHESTRATION_FAILED',
        }, { work_id: workId, interact_id: interactId });
      }
      output.events = events;
      return true;
    }

    if (!workOk || rwOutput.error) {
      const errorMsg = rwOutput.error || '处理失败';
      const errorCode = rwOutput.error_code || 'ORCHESTRATION_FAILED';
      emit('error', { work_id: workId, trace_id: traceId, error_message: errorMsg, error_code: errorCode });
      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
        await this.streamAccess.pushEvent(input.session_id, 'error', 'CONTROL', {
          work_id: workId,
          trace_id: traceId,
          error_message: errorMsg,
          error_code: errorCode,
        }, { work_id: workId, interact_id: interactId });
      }
      output.events = events;
      return true;
    }

    const elapsedMs = Date.now() - startedAt;
    const finalResponse = rwOutput.final_response || '';
    const paused = rwOutput.paused === true;

    // 需求理解暂停等待确认时，不流式输出任何文本（由 intent_confirmation_required 事件驱动前端弹窗）
    if (!paused && finalResponse) {
      // 通过 StreamAccess 进行 2-5 字符随机 chunk 打字机流式推送（无延迟，实时推送）
      if (this.streamAccess && typeof this.streamAccess.pushText === 'function') {
        await this.streamAccess.pushText(input.session_id, 'text_chunk', finalResponse, {
          work_id: workId,
          interact_id: interactId,
          chunk_delay_ms: 0,
        });
      }

      // 兼容回调
      for (let i = 0; i < finalResponse.length; ) {
        const chunkSize = Math.floor(Math.random() * 4) + 2;
        emit('text', { work_id: workId, chunk: finalResponse.substring(i, i + chunkSize) });
        i += chunkSize;
      }
    }

    emit('done', { work_id: workId, interact_id: interactId, trace_id: traceId, final_response: paused ? '' : finalResponse, elapsed_ms: elapsedMs, token_usage: tokenUsage, paused });
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
      await this.streamAccess.pushEvent(input.session_id, 'done', 'CONTROL', {
        work_id: workId,
        interact_id: interactId,
        trace_id: traceId,
        final_response: paused ? '' : finalResponse,
        elapsed_ms: elapsedMs,
        token_usage: tokenUsage,
        paused,
      }, { work_id: workId, interact_id: interactId });
    }

    output.events = events;
    return true;
  }

  async createSession(
    input: CreateSessionInput,
    _context: ChatContext,
    output: CreateSessionOutput,
  ): Promise<boolean> {
    const sessionId = IdGenerator.generate();
    const now = IdGenerator.now();
    const title = input.session_title || '新会话';

    const data: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'session_id', value: sessionId },
      { field: 'session_title', value: title },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'chat_session',
      data,
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    output.session_id = sessionId;
    output.session_title = title;
    output.created = now;
    return true;
  }

  async deleteSession(
    input: DeleteSessionInput,
    _context: ChatContext,
    output: DeleteSessionOutput,
  ): Promise<boolean> {
    if (!input.session_ids || input.session_ids.length === 0) {
      throw new ValidationError('session_ids must be a non-empty array');
    }

    // ===== 原始实现（保留参考）：仅删除 chat_session / info_raw / info_graph 三张表 =====
    // for (const sessionId of input.session_ids) {
    //   const delSessionInput = Object.assign(new DeleteDBInput(), { table: 'chat_session', conditions: [...] });
    //   ... deleteDB(chat_session), deleteDB(info_raw), deleteDB(info_graph)
    // }
    // ===== 修改后：级联清理按 info_id 关联的派生表，避免孤儿数据 =====

    let deletedCount = 0;

    for (const sessionId of input.session_ids) {
      try {
        // 1. 收集该会话下所有 info_id
        const infoRows = await this.relationDb.select('info_raw', {
          conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
          fields: ['info_id'],
        });
        const infoIds = infoRows.map((r) => String(r.info_id ?? '')).filter(Boolean);

        // 2. 删除按 info_id 关联的派生表（info_tag_vector 为全局标签向量，交由 orphan_tag_check 定时任务清理）
        if (infoIds.length > 0) {
          await this.relationDb.delete('info_tag', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_summary', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_keyword', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_vector', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
        }

        // 3. 删除主表与关系表
        await this.relationDb.delete('info_graph', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        await this.relationDb.delete('info_raw', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        const affected = await this.relationDb.delete('chat_session', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        deletedCount += affected;
      } catch (err: unknown) {
        this.logger?.error?.('deleteSession: failed to delete session', {
          session_id: sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    output.deleted_count = deletedCount;
    return true;
  }

  async searchSession(
    input: SearchSessionInput,
    _context: ChatContext,
    output: SearchSessionOutput,
  ): Promise<boolean> {
    const conditions: Condition[] = [];

    if (input.keyword) {
      // ===== 原始实现（保留参考）：仅按 session_title 模糊匹配 =====
      // conditions.push({
      //   field: 'session_title',
      //   operator: Operator.LIKE,
      //   value: `%${input.keyword}%`,
      // });
      // ===== 修改后：全文搜索，会话标题或消息内容（info_raw.info）命中 =====
      const kw = `%${input.keyword}%`;
      const matchedRows = this.relationDb.queryRaw<{ session_id: string }>(
        `SELECT "session_id" FROM "chat_session" WHERE "session_title" LIKE ? UNION SELECT DISTINCT "session_id" FROM "info_raw" WHERE "info" LIKE ?`,
        [kw, kw],
      );
      const matchedIds = matchedRows.map((r) => r.session_id).filter(Boolean);
      if (matchedIds.length === 0) {
        output.sessions = [];
        output.total = 0;
        return true;
      }
      conditions.push({
        field: 'session_id',
        operator: Operator.IN,
        value: matchedIds,
      });
    }

    if (input.start_time !== undefined || input.end_time !== undefined) {
      // ===== 原始实现（保留参考）：按会话创建时间 chat_session.created 过滤 =====
      // if (input.start_time !== undefined) {
      //   conditions.push({ field: 'created', operator: Operator.GE, value: input.start_time });
      // }
      // if (input.end_time !== undefined) {
      //   conditions.push({ field: 'created', operator: Operator.LE, value: input.end_time });
      // }
      // ===== 修改后：按消息时间 info_raw.created 过滤，命中在该时间段内有对话（REQUEST/RESPONSE 等）的会话 =====
      const timeConds: string[] = [];
      const timeArgs: unknown[] = [];
      if (input.start_time !== undefined) {
        timeConds.push('"created" >= ?');
        timeArgs.push(input.start_time);
      }
      if (input.end_time !== undefined) {
        timeConds.push('"created" <= ?');
        timeArgs.push(input.end_time);
      }
      const timeRows = this.relationDb.queryRaw<{ session_id: string }>(
        `SELECT DISTINCT "session_id" FROM "info_raw" WHERE ${timeConds.join(' AND ')}`,
        timeArgs,
      );
      const timeMatchedIds = timeRows.map((r) => r.session_id).filter(Boolean);
      if (timeMatchedIds.length === 0) {
        output.sessions = [];
        output.total = 0;
        return true;
      }
      conditions.push({
        field: 'session_id',
        operator: Operator.IN,
        value: timeMatchedIds,
      });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions,
        order_by: input.order_by ? [
          { field: input.order_by.replace(/^-/, ''), direction: input.order_by.startsWith('-') ? 'DESC' : 'ASC' },
        ] : [{ field: 'updated', direction: 'DESC' }],
        page: { current: pageCurrent, size: pageSize },
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    // ===== 新增：批量聚合会话统计（问答次数 / 字符数 / 标签 / token），避免逐会话 N+1 =====
    const sessionIds = selOutput.rows.map((r) => String(r.session_id ?? '')).filter(Boolean);
    const statMap = new Map<string, { qa_count: number; question_chars: number; answer_chars: number }>();
    const tagsMap = new Map<string, string[]>();
    const tokenMap = new Map<string, { input_tokens: number; output_tokens: number }>();

    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');

      try {
        const statRows = this.relationDb.queryRaw<{ session_id: string; qa_count: number; question_chars: number; answer_chars: number }>(
          `SELECT "session_id",
             SUM(CASE WHEN "info_type" = 'REQUEST' THEN 1 ELSE 0 END) AS qa_count,
             SUM(CASE WHEN "info_type" = 'REQUEST' THEN "info_length" ELSE 0 END) AS question_chars,
             SUM(CASE WHEN "info_type" = 'RESPONSE' THEN "info_length" ELSE 0 END) AS answer_chars
           FROM "info_raw" WHERE "session_id" IN (${placeholders}) GROUP BY "session_id"`,
          sessionIds,
        );
        for (const r of statRows) {
          statMap.set(String(r.session_id), {
            qa_count: Number(r.qa_count ?? 0) || 0,
            question_chars: Number(r.question_chars ?? 0) || 0,
            answer_chars: Number(r.answer_chars ?? 0) || 0,
          });
        }
      } catch {
        /* degrade gracefully */
      }

      try {
        const tagRows = this.relationDb.queryRaw<{ session_id: string; tag: string }>(
          `SELECT ir."session_id", t."tag"
           FROM "info_tag" t
           INNER JOIN "info_raw" ir ON t."info_id" = ir."info_id"
           WHERE ir."session_id" IN (${placeholders})
           GROUP BY ir."session_id", t."tag"`,
          sessionIds,
        );
        for (const r of tagRows) {
          const sid = String(r.session_id ?? '');
          const tag = String(r.tag ?? '').trim();
          if (!sid || !tag) continue;
          const list = tagsMap.get(sid) ?? [];
          if (!list.includes(tag)) list.push(tag);
          tagsMap.set(sid, list);
        }
      } catch {
        /* degrade gracefully */
      }

      try {
        const traceRows = this.relationDb.queryRaw<{ session_id: string; trace_id: string; iterations_json: string; total_token_usage: number }>(
          `SELECT ow."session_id", t."trace_id", t."iterations_json", t."total_token_usage"
           FROM "orchestration_work" ow
           INNER JOIN "orchestration_agent_execution" e ON ow."work_id" = e."work_id"
           INNER JOIN "agent_execution_trace" t ON e."trace_id" = t."trace_id" AND e."trace_id" IS NOT NULL AND e."trace_id" != ''
           WHERE ow."session_id" IN (${placeholders})
           GROUP BY ow."session_id", t."trace_id"`,
          sessionIds,
        );
        const seen = new Set<string>();
        for (const r of traceRows) {
          const sid = String(r.session_id ?? '');
          const traceId = String(r.trace_id ?? '');
          if (!sid || !traceId || seen.has(`${sid}:${traceId}`)) continue;
          seen.add(`${sid}:${traceId}`);
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            const iterations = JSON.parse(r.iterations_json || '[]');
            if (Array.isArray(iterations)) {
              for (const it of iterations) {
                for (const key of ['think', 'reflect', 'answer']) {
                  const piece = it?.[key];
                  if (piece && typeof piece === 'object') {
                    inputTokens += Number(piece.input_tokens ?? 0) || 0;
                    outputTokens += Number(piece.output_tokens ?? 0) || 0;
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
          if (inputTokens === 0 && outputTokens === 0) {
            outputTokens = Number(r.total_token_usage ?? 0) || 0;
          }
          const cur = tokenMap.get(sid) ?? { input_tokens: 0, output_tokens: 0 };
          cur.input_tokens += inputTokens;
          cur.output_tokens += outputTokens;
          tokenMap.set(sid, cur);
        }
      } catch {
        /* degrade gracefully */
      }
    }

    const sessions: SearchSessionOutput['sessions'] = [];

    for (const row of selOutput.rows) {
      const sessionId = row.session_id as string;

      let messageCount = 0;
      let lastMessageTime = 0;
      let lastMessage = '';

      try {
        const cntInput = Object.assign(new CountDBInput(), {
          table: 'info_raw',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        });
        const cntOutput = Object.assign(new CountDBOutput(), {});
        await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
        messageCount = cntOutput.count;
      } catch {
        /* degrade gracefully */
      }

      try {
        const lastSelInput = Object.assign(new SelectDBInput(), {
          query_param: {
            table: 'info_raw',
            conditions: [
              { field: 'session_id', operator: Operator.EQ, value: sessionId },
            ] as Condition[],
            order_by: [{ field: 'created', direction: 'DESC' }],
            page: { current: 1, size: 1 },
          },
        });
        const lastSelOutput = Object.assign(new SelectDBOutput(), {});
        await this.relationDb.selectDB(lastSelInput, new DBContext(), lastSelOutput);
        if (lastSelOutput.rows.length > 0) {
          lastMessageTime = lastSelOutput.rows[0].created as number;
          lastMessage = (lastSelOutput.rows[0].info as string) ?? '';
        }
      } catch {
        /* degrade gracefully */
      }

      const stat = statMap.get(sessionId) ?? { qa_count: 0, question_chars: 0, answer_chars: 0 };
      const token = tokenMap.get(sessionId) ?? { input_tokens: 0, output_tokens: 0 };

      sessions.push({
        session_id: sessionId,
        session_title: (row.session_title as string) ?? '',
        message_count: messageCount,
        last_message_time: lastMessageTime,
        last_message: lastMessage || (row.session_title as string) || '',
        created: (row.created as number) ?? 0,
        updated: (row.updated as number) ?? 0,
        qa_count: stat.qa_count,
        question_chars: stat.question_chars,
        answer_chars: stat.answer_chars,
        input_tokens: token.input_tokens,
        output_tokens: token.output_tokens,
        tags: tagsMap.get(sessionId) ?? [],
      });
    }

    let total = 0;
    try {
      const totalInput = Object.assign(new CountDBInput(), {
        table: 'chat_session',
        conditions,
      });
      const totalOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(totalInput, new DBContext(), totalOutput);
      total = totalOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.sessions = sessions;
    output.total = total;
    return true;
  }

  async getSessionDetail(
    input: GetSessionDetailInput,
    _context: ChatContext,
    output: GetSessionDetailOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    if (!selOutput.row) {
      throw new NotFoundError('Session', input.session_id);
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.session = {
      ...selOutput.row,
      message_count: messageCount,
    };
    return true;
  }

  async updateSessionTitle(
    input: UpdateSessionTitleInput,
    _context: ChatContext,
    output: UpdateSessionTitleOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.session_title || input.session_title.trim() === '') {
      throw new ValidationError('session_title cannot be empty');
    }

    const data: DataObject[] = [
      { field: 'session_title', value: input.session_title.trim() },
      { field: 'updated', value: IdGenerator.now() },
    ];

    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'chat_session',
      data,
      conditions: [
        { field: 'session_id', operator: Operator.EQ, value: input.session_id },
      ] as Condition[],
    });
    const updOutput = Object.assign(new UpdateDBOutput(), {});
    await this.relationDb.updateDB(updInput, new DBContext(), updOutput);

    if (updOutput.affected_rows === 0) {
      throw new NotFoundError('Session', input.session_id);
    }

    return true;
  }

  async checkSessionOverflow(
    input: CheckSessionOverflowInput,
    _context: ChatContext,
    output: CheckSessionOverflowOutput,
  ): Promise<boolean> {
    let maxMessages = 1000;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'chat_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      if (selOutput.row) {
        maxMessages = (selOutput.row.max_messages_per_session as number) ?? 1000;
      }
    } catch {
      /* use default */
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.is_overflowed = messageCount >= maxMessages;
    output.message_count = messageCount;
    output.max_messages = maxMessages;
    return true;
  }

  async getChatHistory(
    input: GetChatHistoryInput,
    _context: ChatContext,
    output: GetChatHistoryOutput,
  ): Promise<boolean> {
    let lastN = input.lastN;
    if (lastN === undefined) {
      lastN = 50;
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: { table: 'chat_config' },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
        if (selOutput.row) {
          lastN = (selOutput.row.default_history_lastN as number) ?? 50;
        }
      } catch {
        /* use default */
      }
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      lastN,
    });
    const lastNOutput = new LastNInfoOutput();
    await this.infoCore.lastNInfo(
      lastNInput,
      new InfoCoreContext(),
      lastNOutput,
    );

    const messages: GetChatHistoryOutput['messages'] = [];
    const allRows = lastNOutput.list;

    let start = 0;
    let end = allRows.length;

    if (input.page_current !== undefined && input.page_size !== undefined) {
      start = (input.page_current - 1) * input.page_size;
      end = start + input.page_size;
      if (start < 0) start = 0;
      if (end > allRows.length) end = allRows.length;
    }

    const pageRows = allRows.slice(start, end);

    let graphRows: Array<Record<string, unknown>> = [];
    try {
      graphRows = await this.relationDb.select('info_graph', {
        fields: ['citing_info_id', 'cited_info_id'],
      });
    } catch { /* degrade gracefully */ }

    for (const row of pageRows) {
      const citingInfoIds: string[] = [];
      const citedInfoIds: string[] = [];

      for (const g of graphRows) {
        const citing = String(g.citing_info_id ?? '');
        const cited = String(g.cited_info_id ?? '');
        if (cited === row.info_id && citing) {
          citingInfoIds.push(citing);
        }
        if (citing === row.info_id && cited) {
          citedInfoIds.push(cited);
        }
      }

      messages.push({
        info_id: row.info_id,
        info_type: row.info_type,
        info_creator_role: row.info_creator_role,
        info: row.info,
        created: row.created,
        pin: row.pin === 1,
        work_id: row.work_id,
        interact_id: row.interact_id,
        trace_id: row.trace_id,
        citing_count: citingInfoIds.length,
        cited_count: citedInfoIds.length,
        citing_info_ids: [...new Set(citingInfoIds)],
        cited_info_ids: [...new Set(citedInfoIds)],
      });
    }

    output.messages = messages;
    output.total = allRows.length;
    return true;
  }

  async searchMessage(
    input: SearchMessageInput,
    _context: ChatContext,
    output: SearchMessageOutput,
  ): Promise<boolean> {
    if (!input.keyword || input.keyword.trim() === '') {
      throw new ValidationError('keyword cannot be empty');
    }

    const kwInput = Object.assign(new KeywordKInfoInput(), {
      info: input.keyword,
    });
    const kwOutput = new KeywordKInfoOutput();
    await this.infoCore.keywordKInfo(
      kwInput,
      new InfoCoreContext(),
      kwOutput,
    );

    let filteredList = kwOutput.list;
    if (input.session_id) {
      filteredList = filteredList.filter((r) => r.session_id === input.session_id);
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;
    const start = (pageCurrent - 1) * pageSize;
    const pageList = filteredList.slice(start, start + pageSize);

    const messages: SearchMessageOutput['messages'] = [];

    for (const row of pageList) {
      let summary = '';
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: {
            table: 'info_summary',
            conditions: [
              { field: 'info_id', operator: Operator.EQ, value: row.info_id },
            ] as Condition[],
          },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
        if (selOutput.row) {
          summary = (selOutput.row.summary as string) ?? '';
        }
      } catch {
        /* degrade gracefully */
      }

      messages.push({
        info_id: row.info_id,
        info_type: row.info_type,
        info_creator_role: row.info_creator_role,
        info: row.info,
        summary,
        created: row.created,
        session_id: row.session_id,
      });
    }

    output.messages = messages;
    output.total = filteredList.length;
    return true;
  }

  async pinMessage(
    input: PinMessageInput,
    _context: ChatContext,
    output: PinMessageOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('info_id is required');
    }

    let currentPin = false;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'info_raw',
          conditions: [
            { field: 'info_id', operator: Operator.EQ, value: input.info_id },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      if (selOutput.row) {
        currentPin = (selOutput.row.pin as number) === 1;
      }
    } catch {
      /* degrade gracefully */
    }

    try {
      const pinInput = Object.assign(new PinInfoInput(), {
        info_id: input.info_id,
      });
      await this.infoCore.pinInfo(
        pinInput,
        new InfoCoreContext(),
        new PinInfoOutput(),
      );
      output.pin = !currentPin;
    } catch (err: unknown) {
      this.logger?.error?.('pinMessage: failed to pin info', {
        info_id: input.info_id,
        error: err instanceof Error ? err.message : String(err),
      });
      output.pin = currentPin;
      return false;
    }

    return true;
  }

  async getMessageGraph(
    input: GetMessageGraphInput,
    _context: ChatContext,
    output: GetMessageGraphOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }

    const graphInput = Object.assign(new GraphInfoInput(), {
      session_id: input.session_id,
    });
    const graphOutput = new GraphInfoOutput();
    await this.infoCore.graphInfo(
      graphInput,
      new InfoCoreContext(),
      graphOutput,
    );

    output.graph_structure = {
      nodes: graphOutput.graph.nodes,
      edges: graphOutput.graph.edges,
    };

    return true;
  }

  async cancelWork(
    input: CancelWorkInput,
    _context: ChatContext,
    output: CancelWorkOutput,
  ): Promise<boolean> {
    if (!input.work_id) {
      throw new ValidationError('work_id is required');
    }

    const cancelInput = Object.assign(new OrchCancelWorkInput(), {
      work_id: input.work_id,
      reason: input.reason,
    });
    const cancelOutput = new OrchCancelWorkOutput();
    const cancelContext = new OrchestrationEntryContext();

    try {
      const ok = await this.orchestrationEntry.cancelWork(cancelInput, cancelContext, cancelOutput);
      output.cancelled = cancelOutput.cancelled;
      return ok;
    } catch (err: unknown) {
      this.logger?.error?.('cancelWork: failed to cancel work', {
        work_id: input.work_id,
        error: err instanceof Error ? err.message : String(err),
      });
      output.cancelled = false;
      return false;
    }
  }

  async confirmIntent(
    input: ConfirmIntentInput,
    _context: ChatContext,
    output: ConfirmIntentOutput,
  ): Promise<boolean> {
    if (!input.work_id) throw new ValidationError('work_id is required');
    if (!input.action) throw new ValidationError('action is required');

    const confirmIn = Object.assign(new OrchConfirmIntentInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      action: input.action,
      understood_requirement: input.understood_requirement,
    });
    const confirmOut = new OrchConfirmIntentOutput();
    const confirmCtx = new OrchestrationEntryContext();

    const ok = await this.orchestrationEntry.confirmIntent(confirmIn, confirmCtx, confirmOut);
    output.success = confirmOut.success;
    output.action_applied = confirmOut.action_applied;
    output.next_status = confirmOut.next_status;
    output.final_response = confirmOut.final_response || '';
    output.interact_id = confirmOut.interact_id || '';

    // 确认重入编排完成（APPROVE/KEEP）后，经 StreamAccess 流式回传最终回复与 done 事件，
    // 使前端在确认请求内实时展示思考过程与系统回答（此前为同步 JSON 请求，前端无流式进度）。
    const finalResponse = output.final_response;
    if (input.action !== 'CANCEL') {
      if (this.streamAccess && typeof this.streamAccess.pushText === 'function' && finalResponse) {
        await this.streamAccess.pushText(input.session_id, 'text_chunk', finalResponse, {
          work_id: input.work_id,
          interact_id: output.interact_id,
          chunk_delay_ms: 0,
        });
      }
      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
        await this.streamAccess.pushEvent(input.session_id, 'done', 'CONTROL', {
          work_id: input.work_id,
          interact_id: output.interact_id,
          final_response: finalResponse,
          paused: false,
        }, { work_id: input.work_id, interact_id: output.interact_id });
      }
    }

    return ok;
  }

  async configChat(
    input: ConfigChatInput,
    _context: ChatContext,
    output: ConfigChatOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'chat_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const id = (current.id as string) || 'chat_config_default';
    const data: DataObject[] = [
      { field: 'id', value: id },
      { field: 'updated', value: IdGenerator.now() },
    ];

    if (input.max_messages_per_session !== undefined) {
      if (input.max_messages_per_session <= 0) {
        throw new ValidationError('max_messages_per_session must be positive');
      }
      data.push({ field: 'max_messages_per_session', value: input.max_messages_per_session });
    }

    if (input.sse_heartbeat_interval_ms !== undefined) {
      if (input.sse_heartbeat_interval_ms <= 0) {
        throw new ValidationError('sse_heartbeat_interval_ms must be positive');
      }
      data.push({ field: 'sse_heartbeat_interval_ms', value: input.sse_heartbeat_interval_ms });
    }

    if (input.default_history_lastN !== undefined) {
      if (input.default_history_lastN <= 0) {
        throw new ValidationError('default_history_lastN must be positive');
      }
      data.push({ field: 'default_history_lastN', value: input.default_history_lastN });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'chat_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    const outConfig: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      outConfig[key] = current[key];
    }
    if (input.max_messages_per_session !== undefined) {
      outConfig.max_messages_per_session = input.max_messages_per_session;
    }
    if (input.sse_heartbeat_interval_ms !== undefined) {
      outConfig.sse_heartbeat_interval_ms = input.sse_heartbeat_interval_ms;
    }
    if (input.default_history_lastN !== undefined) {
      outConfig.default_history_lastN = input.default_history_lastN;
    }

    output.config = outConfig;
    return true;
  }

  private async autoGenerateSessionTitleIfEmpty(sessionId: string, msgContent: string): Promise<void> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

      if (selOutput.row) {
        const currentTitle = (selOutput.row.session_title as string) ?? '';
        if (!currentTitle || currentTitle.trim() === '' || currentTitle.trim() === '新会话') {
          const autoTitle = msgContent.trim().slice(0, 50);
          if (autoTitle) {
            const updInput = Object.assign(new UpdateSessionTitleInput(), {
              session_id: sessionId,
              session_title: autoTitle,
            });
            await this.updateSessionTitle(updInput, new ChatContext(), new UpdateSessionTitleOutput());
          }
        }
      }
    } catch {
      /* best effort */
    }
  }

  private async checkSessionExists(sessionId: string): Promise<boolean> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      return selOutput.row != null;
    } catch {
      return false;
    }
  }

  private async getWriterProfileOutputClass(): Promise<new () => any> {
    const { GetUserProfileOutput } = await import('@brian-agent/agent');
    return GetUserProfileOutput;
  }

  private async getWriterProfileInputClass(): Promise<new () => any> {
    const { GetUserProfileInput } = await import('@brian-agent/agent');
    return GetUserProfileInput;
  }

  private async getWriterAgentContextClass(): Promise<new () => any> {
    const { WriterAgentContext } = await import('@brian-agent/agent');
    return WriterAgentContext;
  }

  private async getEvalOutputClass(): Promise<new () => any> {
    const { GetEvaluationOutput } = await import('@brian-agent/agent');
    return GetEvaluationOutput;
  }

  private async getEvalInputClass(): Promise<new () => any> {
    const { GetEvaluationInput } = await import('@brian-agent/agent');
    return GetEvaluationInput;
  }

  private async getEvolutorAgentContextClass(): Promise<new () => any> {
    const { EvolutorAgentContext } = await import('@brian-agent/agent');
    return EvolutorAgentContext;
  }
}
