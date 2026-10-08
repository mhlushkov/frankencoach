import { useSyncExternalStore } from 'react'

// No accounts backend exists (contracts have no auth/profile/history). Members, sessions and chat history are
// demo data kept in this browser's localStorage. Passwords are never stored.
export type Plan = 'BASIC' | 'PRO' | 'TRIAL'
export interface Body { height: string; weight: string; age: string; restingHr: string; side: 'Left' | 'Right' | 'Not sure'; injuries: string; goals: string[] }
export interface User { id: string; name: string; email: string; plan: Plan; owner?: boolean; since: string; baseChats: number; lastActive: string; body?: Body }
export interface Chat { id: string; userId: string; title: string; sport: string; ts: number }

const K = { users: 'fc.users', session: 'fc.session', chats: 'fc.chats' }

const SEED: User[] = [
  { id: 'anna', name: 'Anna Petrova', email: 'anna.petrova@mail.com', plan: 'PRO', since: 'March 2026', baseChats: 23, lastActive: 'Today', body: { height: '1.68 m', weight: '58 kg', age: '31', restingHr: '52 bpm', side: 'Right', injuries: 'Right shoulder', goals: ['Get faster', 'Avoid injuries'] } },
  { id: 'marco', name: 'Marco Rossi', email: 'marco.r@mail.com', plan: 'PRO', since: 'April 2026', baseChats: 41, lastActive: 'Today', body: { height: '1.82 m', weight: '84 kg', age: '38', restingHr: '', side: 'Right', injuries: '', goals: ['Better technique'] } },
  { id: 'lena', name: 'Lena Fischer', email: 'lena.f@mail.com', plan: 'BASIC', since: 'October 2026', baseChats: 0, lastActive: 'Today' },
  { id: 'sam', name: 'Sam Okafor', email: 'sam.okafor@mail.com', plan: 'PRO', since: 'May 2026', baseChats: 17, lastActive: 'Yesterday' },
  { id: 'julia', name: 'Julia Novak', email: 'julia.n@mail.com', plan: 'BASIC', since: 'June 2026', baseChats: 6, lastActive: 'Oct 4' },
  { id: 'tom', name: 'Tom Berger', email: 'tom.berger@mail.com', plan: 'TRIAL', since: 'October 2026', baseChats: 2, lastActive: 'Oct 1' },
  { id: 'daniel', name: 'Daniel Kim', email: 'owner@frankencoach.app', plan: 'PRO', owner: true, since: 'January 2026', baseChats: 0, lastActive: 'Today' },
]

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: state lives for this tab only */ }
}

interface Snap { users: User[]; session: string | null; chats: Chat[] }
let snap: Snap = { users: read(K.users, SEED), session: read<string | null>(K.session, null), chats: read(K.chats, []) }
const subs = new Set<() => void>()
function set(next: Partial<Snap>) {
  snap = { ...snap, ...next }
  if (next.users) write(K.users, snap.users)
  if (next.session !== undefined) write(K.session, snap.session)
  if (next.chats) write(K.chats, snap.chats)
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export function useAccount() {
  const s = useSyncExternalStore(subscribe, () => snap)
  const user = s.users.find((u) => u.id === s.session) ?? null
  return { ...s, user, myChats: s.chats.filter((c) => c.userId === user?.id).sort((a, b) => b.ts - a.ts) }
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

export function signIn(email: string): User | null {
  const u = snap.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
  if (u) set({ session: u.id })
  return u ?? null
}
export function signUp(name: string, email: string): User | { error: string } {
  if (snap.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) return { error: 'That email already has an account.' }
  const u: User = { id: 'u' + Date.now().toString(36), name: name.trim(), email: email.trim(), plan: 'BASIC', since: new Date().toLocaleString('en', { month: 'long', year: 'numeric' }), baseChats: 0, lastActive: 'Today' }
  set({ users: [...snap.users, u], session: u.id })
  return u
}
export function addMember(name: string, email: string, plan: Plan): string | null {
  if (snap.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) return 'That email is already a member.'
  const u: User = { id: 'u' + Date.now().toString(36), name: name.trim(), email: email.trim(), plan, since: new Date().toLocaleString('en', { month: 'long', year: 'numeric' }), baseChats: 0, lastActive: 'Never' }
  set({ users: [...snap.users, u] })
  return null
}
export const signOut = () => set({ session: null })
export function saveBody(userId: string, body: Body) { set({ users: snap.users.map((u) => (u.id === userId ? { ...u, body } : u)) }) }
export function addChat(userId: string, title: string, sport: string) {
  const chat: Chat = { id: 'c' + Date.now().toString(36), userId, title, sport, ts: Date.now() }
  set({ chats: [...snap.chats, chat] })
}

export function bodySummary(b?: Body): string {
  if (!b) return 'Not set yet'
  const parts = [b.height, b.weight, b.age && `${b.age} years`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Not set yet'
}

export function dayLabel(ts: number): string {
  const d = new Date(ts), now = new Date()
  const day = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000)
  const diff = day(now) - day(d)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'YESTERDAY'
  return d.toLocaleString('en', { month: 'short', day: 'numeric' }).toUpperCase()
}
