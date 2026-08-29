/**
 * @fileoverview XML 解析提取公共能力。
 *
 * 提供轻量、零依赖的 XML 解析与提取能力，用于 LLM 输出等场景中
 * 解析 / 提取 XML 内容。支持：
 * - 嵌套元素、自闭合标签、属性
 * - 文本与 CDATA 内容
 * - 注释与 XML 声明忽略
 * - 常用 XML 实体转义解码
 *
 * 供各层复用，避免各自实现 XML 容错解析导致行为不一致。
 */

/** XML 节点结构 */
export interface XmlNode {
  /** 标签名 */
  tag: string;
  /** 属性表 */
  attributes: Record<string, string>;
  /** 直接文本内容（不含子元素文本） */
  text: string;
  /** 子节点列表 */
  children: XmlNode[];
}

/** 正则特殊字符转义 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 递归下降 XML 解析器（内部实现）。
 */
class XmlTokenizer {
  private readonly src: string;
  private pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private eof(): boolean {
    return this.pos >= this.src.length;
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.src[this.pos])) {
      this.pos += 1;
    }
  }

  /** 跳过 XML 声明与注释等 prolog 片段 */
  private skipProlog(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.src.startsWith('<?', this.pos)) {
        const end = this.src.indexOf('?>', this.pos);
        this.pos = end === -1 ? this.src.length : end + 2;
      } else if (this.src.startsWith('<!--', this.pos)) {
        const end = this.src.indexOf('-->', this.pos);
        this.pos = end === -1 ? this.src.length : end + 3;
      } else {
        return;
      }
    }
  }

  /** 读取元素名 */
  private readName(): string {
    let name = '';
    while (!this.eof() && /[a-zA-Z0-9_.:-]/.test(this.src[this.pos])) {
      name += this.src[this.pos];
      this.pos += 1;
    }
    return name;
  }

  /** 解析属性表 */
  private parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (;;) {
      this.skipWhitespace();
      const c = this.peek();
      if (c === '/' || c === '>' || c === '?' || this.eof()) {
        break;
      }
      const name = this.readName();
      if (!name) {
        this.pos += 1;
        continue;
      }
      this.skipWhitespace();
      if (this.peek() === '=') {
        this.pos += 1;
        this.skipWhitespace();
        const quote = this.peek();
        if (quote === '"' || quote === "'") {
          this.pos += 1;
          let value = '';
          while (!this.eof() && this.peek() !== quote) {
            value += this.src[this.pos];
            this.pos += 1;
          }
          this.pos += 1; // 跳过结束引号
          attrs[name] = XmlParser.decodeEntities(value);
        } else {
          // 无引号属性值
          let value = '';
          while (!this.eof() && !/[\s/>]/.test(this.src[this.pos])) {
            value += this.src[this.pos];
            this.pos += 1;
          }
          attrs[name] = XmlParser.decodeEntities(value);
        }
      } else {
        attrs[name] = '';
      }
    }
    return attrs;
  }

  /** 解析元素节点 */
  parseElement(): XmlNode {
    this.skipProlog();
    this.skipWhitespace();
    if (this.peek() !== '<') {
      throw new Error('expected "<"');
    }
    this.pos += 1; // 跳过 '<'

    const tag = this.readName();
    if (!tag) {
      throw new Error('invalid tag name');
    }
    const attributes = this.parseAttributes();

    this.skipWhitespace();
    // 自闭合标签
    if (this.peek() === '/') {
      this.pos += 2; // 跳过 '/>'
      return { tag, attributes, text: '', children: [] };
    }
    if (this.peek() !== '>') {
      throw new Error('expected ">"');
    }
    this.pos += 1; // 跳过 '>'

    const node: XmlNode = { tag, attributes, text: '', children: [] };
    let text = '';

    for (;;) {
      if (this.eof()) {
        throw new Error(`unclosed tag <${tag}>`);
      }
      // 闭合标签
      if (this.src.startsWith('</', this.pos)) {
        this.pos += 2;
        this.readName();
        this.skipWhitespace();
        if (this.peek() === '>') {
          this.pos += 1;
        }
        node.text = XmlParser.decodeEntities(text.trim());
        return node;
      }
      // 注释
      if (this.src.startsWith('<!--', this.pos)) {
        const end = this.src.indexOf('-->', this.pos);
        this.pos = end === -1 ? this.src.length : end + 3;
        continue;
      }
      // CDATA
      if (this.src.startsWith('<![CDATA[', this.pos)) {
        const end = this.src.indexOf(']]>', this.pos);
        const content = end === -1
          ? this.src.slice(this.pos + 9)
          : this.src.slice(this.pos + 9, end);
        text += content;
        this.pos = end === -1 ? this.src.length : end + 3;
        continue;
      }
      // 子元素
      if (this.src[this.pos] === '<') {
        if (text.trim()) {
          node.text = XmlParser.decodeEntities(text.trim());
        }
        node.children.push(this.parseElement());
        text = '';
        continue;
      }
      text += this.src[this.pos];
      this.pos += 1;
    }
  }
}

/**
 * XML 解析提取工具。
 */
export class XmlParser {
  /** 常用 XML 实体解码表 */
  private static readonly ENTITIES: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#34;': '"',
    '&#39;': "'",
  };

  /** 解码 XML 实体 */
  static decodeEntities(text: string): string {
    if (!text) return text;
    return text.replace(/&(lt|gt|amp|quot|apos|#34|#39);/g, (m, _key: string) => {
      return XmlParser.ENTITIES[m] ?? m;
    });
  }

  /** 编码 XML 实体 */
  private static encodeEntities(text: string): string {
    if (!text) return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 解析 XML 文本为节点树。
   *
   * @param text 原始 XML 文本
   * @returns 根节点，解析失败返回 null
   */
  static parse(text: string): XmlNode | null {
    if (!text) return null;
    try {
      const tokenizer = new XmlTokenizer(text);
      return tokenizer.parseElement();
    } catch {
      return null;
    }
  }

  /**
   * 将 XML 文本解析为普通对象（xml2js 风格约定）：
   * - 文本内容写入 `#text`
   * - 属性写入 `@属性名`
   * - 子元素按标签名分组，单个为对象、多个为数组
   *
   * @param text 原始 XML 文本
   * @returns 普通对象，解析失败返回 null
   */
  static toObject(text: string): Record<string, unknown> | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.nodeToObject(node);
  }

  /**
   * 提取第一个指定标签的内容（不含标签本身）。
   *
   * @param text 原始 XML 文本
   * @param tag 标签名
   * @returns 标签内容，未找到返回 null
   */
  static extract(text: string, tag: string): string | null {
    if (!text || !tag) return null;
    const re = new RegExp(
      `<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(tag)}>`,
      'i',
    );
    const match = text.match(re);
    return match ? XmlParser.decodeEntities(match[1]) : null;
  }

  /**
   * 提取所有指定标签的内容（不含标签本身）。
   *
   * @param text 原始 XML 文本
   * @param tag 标签名
   * @returns 标签内容数组，未找到返回空数组
   */
  static extractAll(text: string, tag: string): string[] {
    if (!text || !tag) return [];
    const re = new RegExp(
      `<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(tag)}>`,
      'gi',
    );
    const out: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      out.push(XmlParser.decodeEntities(match[1]));
    }
    return out;
  }

  /**
   * 检查文本是否为合法 XML。
   *
   * @param text 待检查文本
   * @returns 合法状态与错误信息（合法时 error 为空串）
   */
  static check(text: string): { valid: boolean; error: string } {
    const node = XmlParser.parse(text);
    if (node) {
      return { valid: true, error: '' };
    }
    return { valid: false, error: 'XML 解析失败' };
  }

  /**
   * 格式化（美化）XML 文本。
   *
   * 解析成功后按指定缩进重新序列化输出。
   *
   * @param text 原始 XML 文本
   * @param indent 缩进空格数，默认 2
   * @returns 格式化后的 XML 字符串，失败返回 null
   */
  static format(text: string, indent = 2): string | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.serializeNode(node, indent, 0);
  }

  /**
   * 压缩（minify）XML 文本。
   *
   * @param text 原始 XML 文本
   * @returns 压缩后的单行 XML 字符串，失败返回 null
   */
  static minify(text: string): string | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.serializeNode(node, null, 0);
  }

  /**
   * 将 XmlNode 序列化为 XML 字符串。
   *
   * @param node 节点
   * @param indent 缩进空格数；null 表示不缩进（单行压缩）
   * @param level 当前层级
   */
  private static serializeNode(node: XmlNode, indent: number | null, level: number): string {
    const nl = indent === null ? '' : '\n';
    const pad = indent === null ? '' : ' '.repeat(indent * level);
    const childPad = indent === null ? '' : ' '.repeat(indent * (level + 1));

    const attrs = Object.entries(node.attributes)
      .map(([k, v]) => (v ? ` ${k}="${XmlParser.encodeEntities(v)}"` : ` ${k}`))
      .join('');

    const hasChildren = node.children.length > 0;
    const hasText = node.text.length > 0;

    // 空元素 → 自闭合
    if (!hasChildren && !hasText) {
      return `${pad}<${node.tag}${attrs}/>`;
    }

    // 仅文本，无子元素 → 单行
    if (!hasChildren) {
      return `${pad}<${node.tag}${attrs}>${XmlParser.encodeEntities(node.text)}</${node.tag}>`;
    }

    const open = `${pad}<${node.tag}${attrs}>`;
    const close = `${pad}</${node.tag}>`;

    const parts: string[] = [];
    if (hasText) {
      parts.push(`${childPad}${XmlParser.encodeEntities(node.text)}`);
    }
    for (const child of node.children) {
      parts.push(XmlParser.serializeNode(child, indent, level + 1));
    }

    return `${open}${nl}${parts.join(nl)}${nl}${close}`;
  }

  /** 将 XmlNode 转为普通对象（xml2js 风格） */
  private static nodeToObject(node: XmlNode): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.attributes)) {
      obj[`@${key}`] = value;
    }

    const childTags = new Set(node.children.map((c) => c.tag));
    for (const tag of childTags) {
      const items = node.children.filter((c) => c.tag === tag);
      const values = items.map((c) => XmlParser.nodeToObject(c));
      obj[tag] = values.length === 1 ? values[0] : values;
    }

    const text = node.text;
    if (text) {
      if (node.children.length === 0 && Object.keys(node.attributes).length === 0) {
        return { '#text': text };
      }
      obj['#text'] = text;
    }
    return obj;
  }
}
