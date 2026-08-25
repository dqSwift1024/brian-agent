/**
 * @fileoverview Prompt 重建器（PromptRebuilder）。
 *
 * 展示「思考过程」时，用落库的 PromptReference（模板引用 + 小变量）+ 外部补充的
 * 上下文（context_data）与历史（history），经 PromptProvider 重建完整 prompt。
 */
import {
  PromptsAccess, SoulAccess,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  GetSoulInput, GetSoulOutput, SoulContext,
  formatContextCategories,
} from '@brian-agent/base';
import { PromptReference, TraceIterations } from '../../domain/trace';

export class PromptRebuilder {
  constructor(
    private readonly promptsAccess: PromptsAccess,
    private readonly soulAccess: SoulAccess,
  ) {}

  /** 重建完整 prompt：模板 + soul + task + context + history + tools。 */
  async rebuildPrompt(ref: PromptReference, contextData: string, history: string): Promise<string> {
    const soul = await this.loadSoul(ref.variables.soul_id);
    const variables = this.assembleVariables(ref, contextData, history, soul);
    return this.render(ref.template_id, variables);
  }

  /** 从 iterations 重建指定索引之前的 ReACT 累积历史（Think/Act/Reflect 文本）。 */
  rebuildHistory(iterations: TraceIterations, beforeIndex: number): string {
    let history = '';
    for (let i = 0; i < beforeIndex; i++) {
      history = this.appendIterationHistory(iterations[i], history);
    }
    return history;
  }

  /** 从 info_context_source 三对象（source_ids_map / content_map）重建格式化的上下文文本。 */
  formatContextText(sourceIdsMap: Record<string, string[]>, contentMap: Record<string, string>): string {
    const toItems = (key: string) =>
      (sourceIdsMap[key] ?? []).map((id) => ({ info: contentMap[id] ?? '' })).filter((i) => i.info);
    return formatContextCategories({
      categories: {
        selected: toItems('CUSTOM'),
        pinned: toItems('PINNED'),
        timeline: toItems('TIMELINE'),
        citing: toItems('CITING'),
        tag_relative: toItems('TAG_RELATIVE'),
        similarity: toItems('SIMILARITY'),
        keyword: toItems('KEYWORD'),
        random: toItems('RANDOM'),
      },
    });
  }

  private appendIterationHistory(iter: TraceIterations[number], history: string): string {
    let out = history;
    if (iter.think) out += `\nThink: ${iter.think.reasoning}\nNext: ${iter.think.next_action}`;
    if (iter.act) out += `\nAct: ${iter.act.result}`;
    if (iter.reflect) out += `\nReflect: ${iter.reflect.reflection}`;
    return out;
  }

  /** 组装完整渲染变量（多余变量由模板自行忽略）。 */
  private assembleVariables(
    ref: PromptReference,
    contextData: string,
    history: string,
    soul: string,
  ): Record<string, unknown> {
    const v = ref.variables;
    return {
      agent_name: v.agent_name,
      soul,
      task_content: v.task_content,
      context_data: contextData,
      history,
      iteration: v.iteration,
      max_iterations: v.max_iterations,
      tools_json: v.tools_json,
      domain: v.domain,
    };
  }

  private async loadSoul(soulId: string): Promise<string> {
    if (!soulId) return '';
    try {
      const out = new GetSoulOutput();
      await this.soulAccess.getSoul(
        Object.assign(new GetSoulInput(), { id: soulId }),
        new SoulContext(),
        out,
      );
      return out.soul?.soul_content ?? out.soul?.soul_brief ?? '';
    } catch {
      return '';
    }
  }

  private async render(templateId: string, variables: Record<string, unknown>): Promise<string> {
    const out = new ExecPromptOutput();
    const ok = await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), { id: templateId, variables }),
      new PromptContext(),
      out,
    );
    return ok && out.prompt ? out.prompt : '';
  }
}
