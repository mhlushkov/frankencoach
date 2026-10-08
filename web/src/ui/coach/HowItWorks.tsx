import { useSyncExternalStore } from 'react'
import { Badge, Frame } from '../lib/Frame'
import { read, write } from '../lib/account'

// First-visit explainer. Lives only in this browser: "Got it" is remembered in localStorage (fc.onboarded),
// "Show me again later" only for this tab session. Never touches AppState.
const KEY = 'fc.onboarded'
const LATER = 'fc.onboarded.later'

export const shouldShowOnboarding = (messagesCount: number, stored: string | null): boolean => messagesCount === 0 && stored !== '1'

function readLater(): boolean {
  try { return sessionStorage.getItem(LATER) === '1' } catch { return false }
}
function writeLater() {
  try { sessionStorage.setItem(LATER, '1') } catch { /* private mode: remembered in memory below */ }
}

interface Snap { stored: string | null; later: boolean; forced: boolean }
let snap: Snap = { stored: (() => { const v = read<unknown>(KEY, null); return v == null ? null : String(v) })(), later: readLater(), forced: false }
const subs = new Set<() => void>()
const set = (next: Partial<Snap>) => { snap = { ...snap, ...next }; subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** Header link: show the panel for this visit, even when the conversation is not empty. */
export const openHowItWorks = () => set({ forced: true })
function gotIt() { write(KEY, 1); set({ stored: '1', forced: false }) }
function later() { writeLater(); set({ later: true, forced: false }) }

export function useHowItWorks(messagesCount: number): boolean {
  const s = useSyncExternalStore(subscribe, () => snap)
  return s.forced || (!s.later && shouldShowOnboarding(messagesCount, s.stored))
}

const STEPS: [string, string][] = [
  ['Show me a workout.', 'A video of you, or a file from your watch (csv, gpx, tcx).'],
  ['I name the sport.', "GOT IT means I recognised it. If I can't, I say so instead of guessing."],
  ["If it's new to me, I learn it.", 'I write my own analysis tool, test it, and install it. You see every attempt and what it cost. Say Yes, learn it, or Not now.'],
  ['Then I coach you.', "Numbers from your own movement, then advice. Every sport I learn is free for the next member: that's the Sports we know bar at the bottom."],
]

const LEGEND: [string, string, string][] = [
  ['WAITING', 'var(--fc-human)', 'ready for a workout'],
  ['WATCHING', 'var(--color-text)', 'looking at it now'],
  ['QUESTION / LEARNING', 'var(--fc-learn)', 'learning a new sport'],
  ['DONE', 'var(--fc-alive)', 'advice is ready'],
  ["CAN'T USE", 'var(--fc-fail)', 'try another one'],
]

export function HowItWorks() {
  return (
    <div className="how-wrap">
      <Frame className="how">
        <span className="zone">HOW THIS WORKS</span>
        <ol className="how-steps">
          {STEPS.map(([line, more], i) => (
            <li key={line}>
              <span className="how-n">{i + 1}</span>
              <div className="col g2"><span className="t15">{line}</span><span className="muted t14">{more}</span></div>
            </li>
          ))}
        </ol>
        <div className="how-legend">
          {LEGEND.map(([label, color, meaning]) => (
            <span key={label} className="row g6 t13 muted"><Badge label={label} color={color} />{meaning}</span>
          ))}
        </div>
        <div className="row g14 wrap">
          <Frame className="btn-frame"><button className="btn btn-primary" onClick={gotIt}>Got it</button></Frame>
          <button className="how-later t14" onClick={later}>Show me again later</button>
        </div>
      </Frame>
    </div>
  )
}
