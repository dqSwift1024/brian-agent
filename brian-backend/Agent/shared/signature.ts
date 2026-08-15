/**
 * task_signature 统一格式：`[domain] 任务前256字`
 * 对齐 docs/_01_TerminologyStandardization.md
 */
import { JsonParser } from '@brian-agent/base';

export function buildTaskSignature(taskContent: string, domain = ''): string {
  const body = (taskContent ?? '').slice(0, 256);
  const d = (domain ?? '').trim() || 'general';
  return `[${d}] ${body}`;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const value = JsonParser.parse(text);
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}
