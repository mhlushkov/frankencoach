import { useState } from 'react'
import { Frame } from '../lib/Frame'
import { addMember, dayLabel, useAccount, type Plan, type User } from '../lib/account'
import { Header } from '../Header'
import { useUi } from '../UiContext'

const PLAN_COLOR: Record<Plan, string> = { PRO: 'var(--fc-alive)', TRIAL: 'var(--fc-learn)', BASIC: 'var(--color-text-2)' }
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')

export function OwnerPage({ user }: { user: User }) {
  const { users, chats } = useAccount()
  const { state } = useUi()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState('')
  const [em, setEm] = useState('')
  const [err, setErr] = useState('')

  const members = users.filter((u) => !u.owner)
  const shown = members.filter((u) => (u.name + u.email).toLowerCase().includes(q.toLowerCase()))
  const analyzers = state.tools.filter((t) => t.kind === 'analyzer' && t.activity !== '*')
  const learned = analyzers.filter((t) => t.createdBy === 'agent').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const learnCost = learned.reduce((n, t) => n + (t.costUsd ?? 0), 0)
  const chatCount = (u: User) => u.baseChats + chats.filter((c) => c.userId === u.id).length

  function add() {
    if (!nm.trim() || !em.includes('@')) return setErr('Enter a name and a valid email.')
    const e = addMember(nm, em, 'TRIAL')
    if (e) return setErr(e)
    setNm(''); setEm(''); setErr(''); setAdding(false)
  }

  const kpis = [
    { k: 'Members', v: String(members.length), s: 'demo data, this browser', c: 'var(--color-text)' },
    { k: 'On a paid plan', v: String(members.filter((m) => m.plan !== 'TRIAL').length), s: 'billing is not connected', c: 'var(--fc-alive)' },
    { k: 'Learning new sports', v: `$${learnCost.toFixed(2)}`, s: 'paid by you, from the server', c: 'var(--fc-learn)' },
    { k: 'Sports known', v: String(new Set(analyzers.map((t) => t.activity)).size), s: `${learned.length} learned by the coach`, c: 'var(--color-text)' },
  ]

  return (
    <div className="col fill">
      <Header user={user} crumb="Owner dashboard" />
      <div className="owner">
        <div className="kpis">
          {kpis.map((k) => (
            <Frame key={k.k} className="kpi"><span className="muted t14">{k.k}</span><span className="kpi-v" style={{ color: k.c }}>{k.v}</span><span className="muted t135">{k.s}</span></Frame>
          ))}
        </div>
        <div className="owner-grid">
          <Frame className="card-pad col g12">
            <div className="row g14"><h3 className="h24">Members</h3>
              <input className="input push" style={{ width: 260 }} placeholder="Search by name or email" aria-label="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>+ Add member</button>
            </div>
            {adding && (
              <div className="row g10 wrap">
                <input className="input" style={{ width: 200 }} placeholder="Name" aria-label="Name" value={nm} onChange={(e) => setNm(e.target.value)} />
                <input className="input" style={{ width: 240 }} placeholder="Email" aria-label="Email" value={em} onChange={(e) => setEm(e.target.value)} />
                <button className="btn btn-secondary" onClick={add}>Add</button>
                {err && <span className="t14" style={{ color: 'var(--fc-fail)' }}>{err}</span>}
              </div>
            )}
            <table className="table">
              <thead><tr><th>Name</th><th>Plan</th><th>Chats</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {shown.map((m) => {
                  const mine = chats.filter((c) => c.userId === m.id).sort((a, b) => b.ts - a.ts)
                  return [
                    <tr key={m.id}>
                      <td><div className="col g2"><span>{m.name}</span><span className="muted t13">{m.email}</span></div></td>
                      <td style={{ color: PLAN_COLOR[m.plan] }}>{m.plan.charAt(0) + m.plan.slice(1).toLowerCase()}</td>
                      <td>{chatCount(m)}</td><td style={{ color: 'var(--color-text-2)' }}>{m.lastActive}</td>
                      <td style={{ textAlign: 'right' }}><a className="t14" onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? 'Hide history' : 'View history'}</a></td>
                    </tr>,
                    open === m.id && (
                      <tr key={m.id + 'h'}><td colSpan={5}>
                        {mine.length === 0 ? <span className="muted t14">No chats recorded in this browser.</span> : mine.map((c) => <div className="chat-row" key={c.id}><span className="t15 ellipsis">{c.title}</span><span className="muted t13">{c.sport} · {dayLabel(c.ts).toLowerCase()}</span></div>)}
                      </td></tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </Frame>
          <Frame className="card-pad col g12">
            <div className="col g4"><h3 className="h24">Sports learned</h3><span className="muted t14">You pay when a new sport is learned. Every member gets it.</span></div>
            {learned.length === 0 && <span className="muted t15">Nothing learned yet. The first new sport will show up here.</span>}
            {learned.map((t) => (
              <div className="learn-row" key={t.name}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{title(t.activity)}</span>
                <span className="h18" style={{ color: 'var(--fc-learn)' }}>{t.costUsd !== undefined ? `$${t.costUsd.toFixed(2)}` : '—'}</span>
                <span className="muted t13">{t.attempts ? `${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}` : 'learned by the coach'}</span>
                <span className="muted t13" style={{ textAlign: 'right' }}>{new Date(t.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </Frame>
        </div>
      </div>
    </div>
  )
}
