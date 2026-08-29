/**
 * @fileoverview SSE 流式响应公共组合式函数。
 *
 * 将 fetch + ReadableStream + `data: ` 帧解析的传输逻辑从组件中分离：
 * 组件只负责发起请求与处理业务事件，帧解析复用本模块。
 */

/**
 * 逐帧读取 SSE 响应体，解析出每条 `data: ` 帧。
 *
 * 与后端 StreamProvider 的帧协议对应：每帧一行 `data: {json}`，
 * 空行为心跳分隔；解析失败的帧静默忽略（心跳/半包容错）。
 *
 * @param res fetch 返回的 Response（调用方负责检查 res.ok）
 * @param onData 收到一条完整帧时的回调
 * @throws Error 当响应体不可读时
 */
export async function readSSE(
  res: Response,
  onData: (data: unknown) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) { // eslint-disable-line no-constant-condition
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        onData(JSON.parse(line.slice(6)))
      } catch {
        /* 忽略半包/心跳帧 */
      }
    }
  }
}
