/**
 * 跨平台剪贴板复制工具函数 (Windows, Linux, macOS)
 * 支持现代 Clipboard API 与经典 execCommand 兜底方案
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // 1. 尝试现代异步 Clipboard API (需安全上下文)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 失败时降级到 execCommand 兜底方案
    }
  }

  // 2. 跨平台 execCommand 兜底实现
  if (typeof document === 'undefined') return false

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // 隐藏元素并防止在移动端/桌面端触发页面滚动
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.setAttribute('readonly', '')

    document.body.appendChild(textarea)

    // 适配 iOS / Safari 与桌面端文本选中
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}
