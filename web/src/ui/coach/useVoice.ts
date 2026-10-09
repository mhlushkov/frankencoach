import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../../contracts/types'
import { speak } from '../../core/api/client'

export const VOICE_ERROR = 'Voice is not available right now.'

/** Coach lines at index ≥ spokenUpTo, and the new watermark. A shorter list (new chat) resets without speaking. */
export function nextToSpeak(messages: ChatMessage[], spokenUpTo: number): { texts: string[]; upTo: number } {
  if (spokenUpTo > messages.length) return { texts: [], upTo: messages.length }
  const texts = messages.slice(spokenUpTo).filter((m) => m.role === 'coach').map((m) => m.text)
  return { texts, upTo: messages.length }
}

export interface VoiceControls {
  play(text: string): Promise<void>
  stop(): void
  playing: string | null
  loading: string | null
  error: string | null
}

/** One shared <audio>; Listen per line, or read new coach lines aloud in order while `enabled && available`. */
export function useVoice({ enabled, available, messages }: { enabled: boolean; available: boolean; messages: ChatMessage[] }): VoiceControls {
  const [playing, setPlaying] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef<string | null>(null)
  const seq = useRef(0)                     // bumped by stop(): anything started before it gives up
  const abort = useRef<AbortController | null>(null)
  const finish = useRef<(() => void) | null>(null)
  const queue = useRef<string[]>([])
  const pumping = useRef<Promise<void> | null>(null)
  const mark = useRef<number | null>(null)  // auto-read watermark; null while auto-read is off

  const stop = useCallback(() => {
    seq.current++
    queue.current = []
    abort.current?.abort()
    audio.current?.pause()
    finish.current?.()
    setPlaying(null)
    setLoading(null)
  }, [])

  async function playOne(text: string): Promise<void> {
    const tok = seq.current
    const ac = (abort.current = new AbortController())
    setPlaying(null)
    setLoading(text)
    try {
      const blob = await speak(text, ac.signal)
      if (tok !== seq.current) return
      const el = (audio.current ??= new Audio())
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(blob)
      el.src = url.current
      let ok = true
      const done = new Promise<void>((res) => {
        finish.current = res
        el.onended = () => res()
        el.onerror = () => { ok = false; res() }
      })
      setLoading(null)
      setPlaying(text)
      await el.play()
      setError(null)
      await done
      if (tok !== seq.current) return
      setPlaying(null)
      if (!ok) setError(VOICE_ERROR)
    } catch {
      if (tok !== seq.current) return
      setLoading(null)
      setPlaying(null)
      setError(VOICE_ERROR)
    }
  }

  // Every line goes through one serial loop, so two lines never fight over the element.
  function pump(): Promise<void> {
    if (!pumping.current) {
      pumping.current = (async () => {
        try { while (queue.current.length) await playOne(queue.current.shift()!) } finally { pumping.current = null }
      })()
    }
    return pumping.current
  }

  const play = (text: string): Promise<void> => {
    stop()
    queue.current.push(text)
    return pump()
  }

  useEffect(() => {
    if (!(enabled && available)) {
      if (mark.current !== null && queue.current.length) queue.current = []
      mark.current = null
      return
    }
    if (mark.current === null) { mark.current = messages.length; return }  // just switched on: the history stays silent
    const { texts, upTo } = nextToSpeak(messages, mark.current)
    mark.current = upTo
    if (texts.length) { queue.current.push(...texts); void pump() }
  }, [enabled, available, messages]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    stop()
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = null
  }, [stop])

  return { play, stop, playing, loading, error }
}
