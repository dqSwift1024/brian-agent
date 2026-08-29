/**
 * @fileoverview Agent 层公共基座（AgentKit）。
 *
 * 收敛各 Agent 服务中逐字复制的私有辅助方法（改造前：renderPrompt ×5、
 * resolveLlm ×5、assertPrompt ×3、Soul 兜底 prompt ×5），统一为一处实现。
 *
 * 模式：Facade —— 对"模板渲染 + 内置兜底"与"Agent LLM 绑定解析"的高频组合提供单一入口。
 */

import type { PromptsAccess, SoulAccess } from '@brian-agent/base';
import {
  ExecPromptInput,
  ExecPromptOutput,
  PromptContext,
  SoPromptInput,
  SoPromptOutput,
  Operator,
  getBuiltinTemplate,
  renderTemplate,
  GetSoulInput,
  GetSoulOutput,
  SoulContext,
  ValidationError,
} from '@brian-agent/base';
import type { LLMCoreAccess } from '@brian-agent/core';
import { MatchLLMInput, MatchLLMOutput, LLMCoreContext } from '@brian-agent/core';

/**
 * 渲染 Prompt：优先执行配置的模板（templateId），失败或为空时回退到内置模板。
 *
 * @param promptsAccess PromptsProvider 接入层
 * @param templateId 配置的模板 ID（可为空，空则直接使用内置模板）
 * @param builtinId 内置模板 ID（PROMPT_IDS）
 * @param variables 模板变量
 * @returns 渲染后的 Prompt 文本（可能为空字符串）
 */
export async function renderPromptWithFallback(
  promptsAccess: PromptsAccess,
  templateId: string | undefined,
  builtinId: string,
  variables: Record<string, unknown>,
): Promise<string> {
  const id = templateId || builtinId;
  try {
    const promptOut = new ExecPromptOutput();
    await promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), { id, variables }),
      promptOut,
      new PromptContext(),
    );
    if (promptOut.prompt) return promptOut.prompt;
  } catch {
    /* 回退内置模板 */
  }
  const tpl = getBuiltinTemplate(builtinId);
  return tpl ? renderTemplate(tpl, variables) : '';
}

/**
 * 解析 Agent 绑定的 LLM（经 Core.matchLLM 查询 agent_llm 绑定）。
 *
 * @param llmCore LLMCore 接入层（可为空，空则直接返回 ''）
 * @param agentId Agent ID
 * @returns 匹配到的 LLM ID；未匹配或异常时返回空字符串
 */
export async function resolveAgentLlm(
  llmCore: LLMCoreAccess | undefined,
  agentId: string,
): Promise<string> {
  if (!llmCore) return '';
  try {
    const llmOut = new MatchLLMOutput();
    await llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId }),
      llmOut,
      new LLMCoreContext(),
    );
    return llmOut.llm_id || '';
  } catch {
    return '';
  }
}

/**
 * 断言 Prompt 模板存在，不存在时抛出 ValidationError。
 *
 * @param promptsAccess PromptsProvider 接入层
 * @param id 模板 ID
 * @throws ValidationError 当模板不存在
 */
export async function assertPromptExists(promptsAccess: PromptsAccess, id: string): Promise<void> {
  const out = new SoPromptOutput();
  await promptsAccess.soPrompt(
    Object.assign(new SoPromptInput(), {
      conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
    }),
    out,
    new PromptContext(),
  );
  if (!out.list?.length) throw new ValidationError(`prompt_template_id 不存在: ${id}`);
}

/**
 * 获取 Soul 系统提示词内容：优先 soul_content，回退 soul_brief，均无则空串。
 *
 * @param soulAccess SoulProvider 接入层
 * @param soulId Soul ID（可为空）
 */
export async function getSoulSystemPrompt(soulAccess: SoulAccess, soulId: string): Promise<string> {
  if (!soulId) return '';
  try {
    const soulOut = new GetSoulOutput();
    await soulAccess.soSoulById(
      Object.assign(new GetSoulInput(), { id: soulId }),
      soulOut,
      new SoulContext(),
    );
    return soulOut.soul?.soul_content || soulOut.soul?.soul_brief || '';
  } catch {
    return '';
  }
}
