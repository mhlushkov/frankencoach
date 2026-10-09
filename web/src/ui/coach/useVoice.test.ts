import { expect, test } from 'bun:test'
import type { ChatMessage } from '../../../../contracts/types'
import { nextToSpeak } from './useVoice'

const user = (text: string): ChatMessage => ({ role: 'user', text, ts: 0 })
const coach = (text: string): ChatMessage => ({ role: 'coach', text, ts: 0 })

test('nothing to say in an empty chat', () => {
  expect(nextToSpeak([], 0)).toEqual({ texts: [], upTo: 0 })
})

test('only coach lines, in order, never the member', () => {
  const msgs = [user('How was my squat?'), coach('Your depth was good.'), user('And my back?'), coach('Keep it straighter.')]
  expect(nextToSpeak(msgs, 0)).toEqual({ texts: ['Your depth was good.', 'Keep it straighter.'], upTo: 4 })
})

test('the watermark skips what was already on screen and advances', () => {
  const msgs = [user('a'), coach('old tip'), user('b'), coach('new tip')]
  const first = nextToSpeak(msgs, 2)
  expect(first).toEqual({ texts: ['new tip'], upTo: 4 })
  expect(nextToSpeak([...msgs, coach('later')], first.upTo)).toEqual({ texts: ['later'], upTo: 5 })
})

test('nothing new when the watermark is at the end', () => {
  const msgs = [user('a'), coach('b')]
  expect(nextToSpeak(msgs, msgs.length)).toEqual({ texts: [], upTo: 2 })
})

test('a new chat (fewer messages than the watermark) starts over without speaking', () => {
  expect(nextToSpeak([], 4)).toEqual({ texts: [], upTo: 0 })
})
