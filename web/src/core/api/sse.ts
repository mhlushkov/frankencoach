import type { AgentEvent } from '../../../../contracts/types'

// `data: <JSON>\n\n` per event, `: ping\n\n` heartbeats (contracts/events.md).
function parseBlock(block: string): AgentEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as AgentEvent
  } catch {
    return null
  }
}

export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split(/\r?\n\r?\n/)
      buf = parts.pop() ?? ''
      for (const p of parts) {
        const e = parseBlock(p)
        if (e) yield e
      }
    }
    buf += dec.decode()
    const e = parseBlock(buf)
    if (e) yield e
  } finally {
    reader.releaseLock()
  }
}
