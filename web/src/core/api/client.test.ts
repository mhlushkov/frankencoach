import { expect, test } from 'bun:test'
import { analyze, getTools, health } from './client'
import type { AgentEvent } from '../../../../contracts/types'

function mockFetch(fn: (url: string, init?: RequestInit) => Response) {
  const orig = globalThis.fetch
  globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => fn(String(u), i)) as typeof fetch
  return () => { globalThis.fetch = orig }
}

test('analyze POSTs the request and streams SSE events to onEvent', async () => {
  let body = ''
  const restore = mockFetch((url, init) => {
    expect(url).toBe('/api/analyze')
    body = String(init?.body)
    return new Response('data: {"type":"thinking","text":"a"}\n\n: ping\n\ndata: {"type":"answer","text":"b"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  })
  const got: AgentEvent[] = []
  await analyze({ sessionId: 's', message: 'hi', input: { kind: 'none' } }, (e) => got.push(e))
  restore()
  expect(JSON.parse(body).message).toBe('hi')
  expect(got.map((e) => e.type)).toEqual(['thinking', 'answer'])
})

test('analyze throws on HTTP error; getTools/health parse JSON', async () => {
  const restore = mockFetch((url) =>
    url.endsWith('/analyze') ? new Response('nope', { status: 500 })
      : url.endsWith('/tools') ? Response.json([{ name: 'pose-metrics' }])
      : Response.json({ ok: true, demoMode: false, budgetLeftUsd: 5, toolsCount: 2, startedAt: 'x' }))
  let err = ''
  await analyze({ sessionId: 's', message: 'hi', input: { kind: 'none' } }, () => {}).catch((e: Error) => { err = e.message })
  expect(err).toContain('500')
  expect((await getTools())[0].name).toBe('pose-metrics')
  expect((await health()).toolsCount).toBe(2)
  restore()
})
