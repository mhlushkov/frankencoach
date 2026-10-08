import { useMemo } from 'react'
import type { ToolManifest } from '../../../../contracts/types'
import { sportName } from '../lib/text'

export function SportsFooter({ tools, learning, onForget }: { tools: ToolManifest[]; learning?: string; onForget?: (name: string) => void }) {
  const sports = useMemo(() => {
    const m = new Map<string, { activity: string; fresh: boolean; tools: string[] }>()
    for (const t of tools) {
      if (t.kind !== 'analyzer' || t.activity === '*') continue
      const e = m.get(t.activity) ?? { activity: t.activity, fresh: false, tools: [] }
      e.fresh ||= t.createdBy === 'agent' && Date.now() - Date.parse(t.createdAt) < 24 * 3600 * 1000
      e.tools.push(t.name)
      m.set(t.activity, e)
    }
    return [...m.values()]
  }, [tools])
  const growing = learning && !sports.some((s) => s.activity === learning) ? learning : undefined

  return (
    <footer className="sports">
      <div className="col g4" style={{ width: 200, flex: 'none' }}>
        <span className="zone">SPORTS WE KNOW</span><span className="muted t12">shared by every member</span>
      </div>
      {sports.length === 0 && !growing && <span className="muted t15">None yet. Show me one and I'll learn it.</span>}
      <div className="sports-list">
        {sports.map((s) => (
          <div key={s.activity} className={`blueprint sport ${s.fresh ? 'fresh' : ''}`} title={onForget ? 'double-click to forget (demo)' : undefined} onDoubleClick={() => onForget && s.tools.forEach(onForget)}>
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <span className="sport-name">{sportName(s.activity)}</span>
            <span className="t13" style={{ color: s.fresh ? 'var(--fc-alive)' : 'var(--fc-human)' }}>{s.fresh ? 'New today, for everyone' : 'Ready'}</span>
          </div>
        ))}
        {growing && (
          <div className="blueprint sport learning">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <span className="sport-name">{sportName(growing)}</span><span className="t13" style={{ color: 'var(--fc-learn)' }}>Learning now…</span>
          </div>
        )}
      </div>
    </footer>
  )
}
