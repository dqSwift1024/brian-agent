/**
 * @fileoverview Markdown 渲染公共工具。
 *
 * marked 解析 + DOMPurify 消毒，解析失败时回退原文。
 * 消息卡片（MessageCard）、思考块（ThinkingBlock）、资料库文档阅读
 * （LibraryTab）等 v-html 场景共用；配套排版样式见 styles/globals.css
 * 的 .markdown-body。
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** 渲染 Markdown 为消毒后的 HTML（空内容返回空串，解析失败回退原文） */
export function renderMarkdown(content: string): string {
  const raw = content || ''
  if (!raw.trim()) return ''
  try {
    return DOMPurify.sanitize(marked.parse(raw) as string)
  } catch {
    return raw
  }
}
