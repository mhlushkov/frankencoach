import { Badge, Logo } from './lib/Frame'
import { initials, signOut, type User } from './lib/account'
import { go } from './lib/route'

const PLAN_COLOR = { PRO: 'var(--fc-alive)', BASIC: 'var(--fc-human)', TRIAL: 'var(--fc-learn)' }

export function Header({ user, crumb, tagline }: { user: User; crumb?: string; tagline?: string }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/" onClick={() => go('coach')}>
        <Logo /><span className="brand-name">FrankenCoach</span>
      </a>
      {tagline && <span className="muted t15">{tagline}</span>}
      {crumb && <span className="muted t15">{crumb}</span>}
      <div className="topbar-right">
        {user.owner && <a className="t14" href="#/owner">Owner dashboard</a>}
        <Badge label={user.owner ? 'OWNER' : user.plan} color={user.owner ? 'var(--fc-learn)' : PLAN_COLOR[user.plan]} />
        <div className="avatar">{initials(user.name)}</div>
        <a className="t15 user-name" href="#/account" style={{ color: 'var(--color-text)' }}>{user.name}</a>
        <button className="btn btn-secondary t14" style={{ padding: '4px 10px' }} onClick={signOut}>Sign out</button>
      </div>
    </header>
  )
}
