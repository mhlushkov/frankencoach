import { expect, test } from 'bun:test'
import { parseSse } from './sse'
import type { AgentEvent } from '../../../../contracts/types'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}

async function collect(chunks: string[]): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of parseSse(streamOf(chunks))) out.push(e)
  return out
}

test('JSON split across chunks is reassembled', async () => {
  const line = 'data: ' + JSON.stringify({ type: 'thinking', text: 'looking at the video' }) + '\n\n'
  const events = await collect([line.slice(0, 7), line.slice(7, 20), line.slice(20)])
  expect(events).toEqual([{ type: 'thinking', text: 'looking at the video' }])
})

test('several events in one chunk, heartbeats ignored, CRLF ok', async () => {
  const events = await collect([
    ': ping\n\ndata: {"type":"thinking","text":"a"}\r\n\r\ndata: {"type":"answer","text":"b"}\n\n: ping\n\n',
  ])
  expect(events.map((e) => e.type)).toEqual(['thinking', 'answer'])
})

test('trailing event without blank line is flushed; bad JSON skipped', async () => {
  const events = await collect(['data: {oops}\n\n', 'data: {"type":"error","text":"x"}'])
  expect(events).toEqual([{ type: 'error', text: 'x' }])
})
