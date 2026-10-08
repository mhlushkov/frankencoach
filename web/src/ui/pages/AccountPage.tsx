import { Frame } from '../lib/Frame'
import { dayLabel, useAccount, type User } from '../lib/account'
import { Header } from '../Header'

const USES: Record<string, string> = {
  Height: 'Used for squat depth and running stride',
  Weight: 'Used for cycling power and diving',
  Age: 'Used to judge safe heart rate',
  'Resting heart rate': 'Used to tell how hard you worked',
  'Stronger side': 'Used to spot uneven movement',
  Injuries: 'I avoid advice that could make it worse',
}

export function AccountPage({ user }: { user: User }) {
  const { myChats } = useAccount()
  const b = user.body
  const rows = [
    ['Height', b?.height], ['Weight', b?.weight], ['Age', b?.age], ['Resting heart rate', b?.restingHr],
    ['Stronger side', b?.side], ['Injuries', b?.injuries],
  ] as const
  return (
    <div className="col fill">
      <Header user={user} crumb="Account" />
      <div className="account-grid">
        <nav className="side-nav">
          <a className="muted" href="#/">← Back to coach</a>
          <span className="on">Profile &amp; body</span>
          <span>Plan &amp; billing</span>
          <span>Chat history</span>
        </nav>
        <div className="account-main">
          <Frame className="card-pad col g18">
            <div className="row baseline"><h3 className="h24">Your body</h3><span className="muted t14 push">only you can see this</span></div>
            <div className="col">
              {rows.map(([k, v]) => (
                <div className="body-row" key={k}>
                  <span className="t15" style={{ color: 'var(--color-text-2)' }}>{k}</span>
                  <span className="h19">{v || '—'}</span>
                  <span className="muted t135">{USES[k]}</span>
                  <a className="t14" href="#/body">Edit</a>
                </div>
              ))}
            </div>
          </Frame>
          <div className="col g28">
            <Frame className="card-pad col g14">
              <h3 className="h24">Profile</h3>
              <div className="kv t15"><span className="muted">Name</span><span>{user.name}</span><span className="muted">Email</span><span>{user.email}</span><span className="muted">Member since</span><span>{user.since}</span></div>
            </Frame>
            <Frame className="card-pad col g14" style={{ borderColor: 'rgba(57,255,136,.4)' }}>
              <div className="row baseline g12"><h3 className="h24">Your plan</h3><span className="badge" style={{ color: 'var(--fc-alive)', borderColor: 'var(--fc-alive)' }}>{user.plan}</span></div>
              <div className="col g6 t15" style={{ color: 'var(--color-text-2)' }}><span>✓ Every sport, including new ones</span><span>✓ Full chat history</span></div>
              <span className="muted t14">Learning new sports never costs you extra. Billing is not connected in this build.</span>
            </Frame>
            <Frame className="card-pad col g10">
              <h3 className="h24">Recent chats</h3>
              {myChats.length === 0 && <span className="muted t15">Your chats will show up here.</span>}
              {myChats.slice(0, 6).map((c) => (
                <div className="chat-row" key={c.id}><span className="t15 ellipsis">{c.title}</span><span className="muted t13">{c.sport} · {dayLabel(c.ts).toLowerCase()}</span></div>
              ))}
            </Frame>
          </div>
        </div>
      </div>
    </div>
  )
}
