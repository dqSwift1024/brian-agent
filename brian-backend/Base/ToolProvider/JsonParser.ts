/**
 * @fileoverview JSON 解析提取公共能力。
 *
 * 提供对 LLM 输出等非严格文本的 JSON 解析与提取能力：
 * - 容忍 markdown 代码围栏（```json ... ```）
 * - 容忍 JSON 前后的附加说明文本
 * - 支持对象 / 数组两种结构的提取
 *
 * 供各层（Core / Agent / Orchestration / Application）复用，
 * 避免各自实现 JSON 容错解析导致行为不一致。
 */

/**
 * JSON 解析提取工具。
 */
export class JsonParser {
  /**
   * 剥离文本首尾的 markdown 代码围栏（```json / ```）。
   *
   * 仅处理首尾围栏，不破坏正文中间的内容。
   *
   * @param text 原始文本
   * @returns 剥离围栏并 trim 后的文本
   */
  static stripCodeFence(text: string): string {
    if (!text) return text;
    let t = text.trim();
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '');
    t = t.replace(/\n?```\s*$/, '');
    return t.trim();
  }

  /**
   * 安全解析 JSON，容忍代码围栏与前后附加文本。
   *
   * 解析顺序：
   * 1. 剥离围栏后直接 JSON.parse
   * 2. 正则提取第一个 JSON 对象并解析
   * 3. 正则提取第一个 JSON 数组并解析
   *
   * @param text 原始文本
   * @returns 解析结果（对象 / 数组 / 原始 JSON 值），失败返回 null
   */
  static parse(text: string): unknown | null {
    if (!text) return null;
    const cleaned = JsonParser.stripCodeFence(text);

    const direct = JsonParser.tryParse(cleaned);
    if (direct !== null) return direct;

    const objStr = JsonParser.extractObject(cleaned);
    if (objStr !== null) {
      const obj = JsonParser.tryParse(objStr);
      if (obj !== null) return obj;
    }

    const arrStr = JsonParser.extractArray(cleaned);
    if (arrStr !== null) {
      const arr = JsonParser.tryParse(arrStr);
      if (arr !== null) return arr;
    }

    return null;
  }

  /**
   * 解析 JSON 对象。
   *
   * @param text 原始文本
   * @returns JSON 对象，失败或非对象返回 null
   */
  static parseObject(text: string): Record<string, unknown> | null {
    const value = JsonParser.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  /**
   * 解析 JSON 数组。
   *
   * @param text 原始文本
   * @returns JSON 数组，失败或非数组返回 null
   */
  static parseArray(text: string): unknown[] | null {
    const value = JsonParser.parse(text);
    if (Array.isArray(value)) {
      return value;
    }
    return null;
  }

  /**
   * 提取文本中第一个 JSON 对象子串（含花括号）。
   *
   * @param text 原始文本
   * @returns JSON 对象子串，未找到返回 null
   */
  static extractObject(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }

  /**
   * 提取文本中第一个 JSON 数组子串（含方括号）。
   *
   * @param text 原始文本
   * @returns JSON 数组子串，未找到返回 null
   */
  static extractArray(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\[[\s\S]*\]/);
    return match ? match[0] : null;
  }

  /**
   * 检查文本是否为合法 JSON。
   *
   * @param text 待检查文本
   * @returns 合法状态与错误信息（合法时 error 为空串）
   */
  static check(text: string): { valid: boolean; error: string } {
    try {
      JSON.parse(text);
      return { valid: true, error: '' };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * 格式化（美化）JSON 文本。
   *
   * 容忍代码围栏与前后附加文本，解析成功后按指定缩进重新输出。
   *
   * @param text 原始 JSON 文本
   * @param indent 缩进空格数，默认 2
   * @returns 格式化后的 JSON 字符串，失败返回 null
   */
  static format(text: string, indent = 2): string | null {
    const value = JsonParser.parse(text);
    if (value === null) return null;
    try {
      return JSON.stringify(value, null, indent);
    } catch {
      return null;
    }
  }

  /**
   * 压缩（minify）JSON 文本。
   *
   * @param text 原始 JSON 文本
   * @returns 压缩后的单行 JSON 字符串，失败返回 null
   */
  static minify(text: string): string | null {
    const value = JsonParser.parse(text);
    if (value === null) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  /**
   * 尝试 JSON.parse，失败返回 null。
   */
  private static tryParse(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
