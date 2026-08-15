/**
 * @fileoverview ToolProvider 模块测试（ToolAccess 业务用例）。
 *
 * 测试范围：
 * - ID 生成：generateId / generateIds / now / today
 * - JSON：检查 / 格式化 / 压缩
 * - XML：检查 / 格式化 / 压缩
 * - 正则表达式匹配：全局匹配、捕获组、非法正则容错
 *
 * 纯工具测试，无数据库依赖。
 */

import { describe, it, expect } from 'vitest';
import { ToolAccess } from '../ToolProvider';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('ToolProvider', () => {
  const tool = new ToolAccess();

  describe('ID 生成', () => {
    it('should generate valid UUID v4', () => {
      const id = tool.generateId();
      expect(id).toMatch(UUID_V4);
    });

    it('should generate unique ids', () => {
      const ids = tool.generateIds(100);
      expect(ids).toHaveLength(100);
      expect(new Set(ids).size).toBe(100);
    });

    it('should clamp count to [0, 1000]', () => {
      expect(tool.generateIds(-1)).toEqual([]);
      expect(tool.generateIds(5000)).toHaveLength(1000);
    });

    it('should return timestamp and date', () => {
      expect(tool.now()).toBeGreaterThan(0);
      expect(tool.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('JSON', () => {
    it('should check json validity', () => {
      expect(tool.jsonCheck('{"a":1}').valid).toBe(true);
      expect(tool.jsonCheck('{"a":1,}').valid).toBe(false);
    });

    it('should format json', () => {
      const out = tool.jsonFormat('{"a":1,"b":[1,2]}');
      expect(out.valid).toBe(true);
      expect(out.result).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    });

    it('should minify json', () => {
      const out = tool.jsonMinify('{\n  "a": 1\n}');
      expect(out.valid).toBe(true);
      expect(out.result).toBe('{"a":1}');
    });

    it('should return error on invalid json', () => {
      expect(tool.jsonFormat('not json').valid).toBe(false);
      expect(tool.jsonMinify('not json').result).toBe('');
    });
  });

  describe('XML', () => {
    it('should check xml validity', () => {
      expect(tool.xmlCheck('<a>1</a>').valid).toBe(true);
      expect(tool.xmlCheck('<a>1').valid).toBe(false);
    });

    it('should format xml', () => {
      const out = tool.xmlFormat('<root><a>1</a><b>2</b></root>');
      expect(out.valid).toBe(true);
      expect(out.result).toBe('<root>\n  <a>1</a>\n  <b>2</b>\n</root>');
    });

    it('should minify xml', () => {
      const out = tool.xmlMinify('<root>\n  <a>1</a>\n</root>');
      expect(out.valid).toBe(true);
      expect(out.result).toBe('<root><a>1</a></root>');
    });

    it('should return error on invalid xml', () => {
      expect(tool.xmlFormat('not xml').valid).toBe(false);
    });
  });

  describe('正则表达式', () => {
    it('should match with global flag', () => {
      const out = tool.regexMatch('\\d+', 'a1b22c333', 'g');
      expect(out.valid).toBe(true);
      expect(out.matched).toBe(true);
      expect(out.matches).toEqual(['1', '22', '333']);
      expect(out.count).toBe(3);
    });

    it('should return single match without global flag', () => {
      const out = tool.regexMatch('\\d+', 'a1b22c333');
      expect(out.valid).toBe(true);
      expect(out.matched).toBe(true);
      expect(out.matches).toEqual(['1']);
      expect(out.count).toBe(1);
    });

    it('should return named capture groups', () => {
      const out = tool.regexMatch('(?<key>\\w+)=(?<val>\\w+)', 'x=1');
      expect(out.valid).toBe(true);
      expect(out.groups).toEqual([{ key: 'x', val: '1' }]);
    });

    it('should report unmatched', () => {
      const out = tool.regexMatch('\\d+', 'abc', 'g');
      expect(out.valid).toBe(true);
      expect(out.matched).toBe(false);
      expect(out.matches).toEqual([]);
      expect(out.count).toBe(0);
    });

    it('should report invalid pattern', () => {
      const out = tool.regexMatch('[', 'abc');
      expect(out.valid).toBe(false);
      expect(out.error).toBeTruthy();
    });

    it('should report invalid flags', () => {
      const out = tool.regexMatch('a', 'abc', 'zz');
      expect(out.valid).toBe(false);
      expect(out.error).toBeTruthy();
    });
  });
});
