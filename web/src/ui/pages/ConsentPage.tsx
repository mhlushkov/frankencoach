import { useState } from 'react'
import { Frame, Logo } from '../lib/Frame'
import { deleteAccount, recordConsent, signOut, type User } from '../lib/account'
import { consentError, makeConsent } from '../lib/consent'
import { ConsentFields } from '../lib/ConsentFields'

// Shown to a signed-in member who has not agreed to the current privacy notice (accounts made before consent
// existed, or after the notice changed). The coach stays closed until they agree, sign out or delete the account.
export function ConsentPage({ user }: { user: User }) {
  const [consent, setConsent] = useState({ notice: false, health: false })
  const [error, setError] = useState('')
  const agree = () => {
    const why = consentError(consent)
    if (why) return setError(why)
    recordConsent(user.id, makeConsent())
  }
  return (
    <div className="col fill">
      <header className="topbar"><div className="brand"><Logo /><span className="brand-name">FrankenCoach</span></div></header>
      <div className="privacy col g18">
        <h1 className="h36">Before we go on, {user.name.split(' ')[0]}</h1>
        <p className="lede2">I process your body and movement data, which the law treats as health data. I need your explicit consent first.</p>
        <ConsentFields value={consent} onChange={setConsent} />
        {error && <span className="t14" role="alert" style={{ color: 'var(--fc-fail)' }}>{error}</span>}
        <Frame className="btn-frame"><button className="btn btn-primary btn-lg block" type="button" onClick={agree}>Agree and continue</button></Frame>
        <div className="row g18 t14"><button className="btn" type="button" onClick={signOut}>Sign out</button><button className="btn" type="button" onClick={() => deleteAccount(user.id)}>Delete my account and data</button></div>
      </div>
    </div>
  )
}
