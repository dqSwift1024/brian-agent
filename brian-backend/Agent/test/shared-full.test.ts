import { describe, it, expect } from 'vitest';
import { buildTaskSignature, parseJsonObject } from '../shared/signature';
import { formatContextCategories } from '@brian-agent/base';

describe('AgentShared - buildTaskSignature', () => {
  it('TC-SH-001: 正常格式 [domain] + 正文', () => {
    expect(buildTaskSignature('hello world', 'coding')).toBe('[coding] hello world');
  });

  it('TC-SH-002: domain 为空默认 general', () => {
    expect(buildTaskSignature('x')).toBe('[general] x');
  });

  it('TC-SH-003: domain 为 whitespace 默认 general', () => {
    expect(buildTaskSignature('test', '   ')).toBe('[general] test');
  });

  it('TC-SH-004: body 超 256 截断', () => {
    const body = 'a'.repeat(300);
    const sig = buildTaskSignature(body, 'd');
    expect(sig.length).toBe('[d] '.length + 256);
    expect(sig).toBe('[d] ' + 'a'.repeat(256));
  });

  it('TC-SH-005: body 恰好 256 不截断', () => {
    const body = 'x'.repeat(256);
    expect(buildTaskSignature(body, 'd')).toBe('[d] ' + body);
  });

  it('TC-SH-006: null/undefined 处理', () => {
    expect(buildTaskSignature(null as any, 'd')).toBe('[d] ');
    expect(buildTaskSignature('', 'd')).toBe('[d] ');
  });

  it('TC-SH-007: domain 含特殊字符', () => {
    expect(buildTaskSignature('test', 'ai-ml')).toBe('[ai-ml] test');
  });
});

describe('AgentShared - parseJsonObject', () => {
  it('TC-SH-008: 纯 JSON 对象', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('TC-SH-009: 从混合文本提取 JSON', () => {
    expect(parseJsonObject('prefix {"b":2} suffix')).toEqual({ b: 2 });
  });

  it('TC-SH-010: 嵌套 JSON', () => {
    expect(parseJsonObject('{"a":{"b":1},"c":[1,2]}')).toEqual({ a: { b: 1 }, c: [1, 2] });
  });

  it('TC-SH-011: 多个 JSON 块时, 贪婪匹配整个 {} 块, 首个不合法 JSON 返回 null', () => {
    // The implementation uses greedy regex /\{[\s\S]*\}/ which matches from first { to last }
    // producing '{"a":1} middle {"b":2}' which is NOT valid JSON, so returns null
    expect(parseJsonObject('start {"a":1} middle {"b":2} end')).toBeNull();
  });

  it('TC-SH-012: 空字符串返回 null', () => {
    expect(parseJsonObject('')).toBeNull();
  });

  it('TC-SH-013: 非 JSON 纯文本返回 null', () => {
    expect(parseJsonObject('this is just text')).toBeNull();
  });

  it('TC-SH-014: 格式错误 JSON 返回 null', () => {
    expect(parseJsonObject('{"a":1,}')).toBeNull();
  });

  it('TC-SH-015: JSON 数组返回该数组（typeof object）', () => {
    expect(parseJsonObject('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('TC-SH-016: 跨行嵌入式 JSON', () => {
    expect(parseJsonObject('prefix\n{"key":\n"value"}\nsuffix')).toEqual({ key: 'value' });
  });
});

describe('AgentShared - formatContextCategories', () => {
  it('TC-SH-020: 渲染分类标签并过滤非内容属性', () => {
    const input = {
      categories: {
        pinned: [{ info: '系统提示规则', info_id: 'db-123', created: 1000 }],
        similarity: [{ info: '向量记忆信息', info_id: 'db-456' }],
        random: [{ info: '探查随机信息', info_id: 'db-789' }],
      },
    };
    const res = formatContextCategories(input);
    expect(res).toContain('<上下文信息>');
    expect(res).toContain('<钉住的消息>\n- 系统提示规则\n</钉住的消息>');
    expect(res).toContain('<向量语义消息>\n- 向量记忆信息\n</向量语义消息>');
    expect(res).toContain('<探查随机消息>\n- 探查随机信息\n</探查随机消息>');
    expect(res).not.toContain('db-123');
    expect(res).not.toContain('created');
  });

  it('TC-SH-021: 无 categories 降级到 list 渲染', () => {
    const input = {
      list: [{ info: '兜底普通消息' }],
    };
    const res = formatContextCategories(input);
    expect(res).toContain('<上下文信息>');
    expect(res).toContain('<历史消息>\n- 兜底普通消息\n</历史消息>');
  });

  it('TC-SH-022: 空输入返回空字符串', () => {
    expect(formatContextCategories(undefined)).toBe('');
    expect(formatContextCategories({})).toBe('');
  });
});
