import { useState, type FormEvent } from 'react'
import { Frame, Logo } from '../lib/Frame'
import { go } from '../lib/route'
import { signIn, signUp } from '../lib/account'
import { consentError, makeConsent } from '../lib/consent'
import { ConsentFields } from '../lib/ConsentFields'

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [consent, setConsent] = useState({ notice: false, health: false })
  const isIn = mode === 'signin'

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) return setError('Enter a valid email.')
    if (!password) return setError('Enter a password.')
    if (isIn) {
      if (!signIn(email)) setError('No account with that email. Try Create account.')
      else go('coach')
    } else {
      if (!name.trim()) return setError('Enter your name.')
      const why = consentError(consent)
      if (why) return setError(why)
      const r = signUp(name, email, makeConsent())
      if ('error' in r) setError(r.error)
      else go('body')
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero grid-bg">
        <div className="row g14"><Logo size={36} /><span className="h-brand">FrankenCoach</span></div>
        <div className="col g20" style={{ maxWidth: 620 }}>
          <h1 className="hero">The coach that learns any sport you show it.</h1>
          <p className="lede">Upload a video or a workout from your watch. If it's a sport I haven't seen, I learn it, and from then on every member can use it.</p>
          <ol className="auth-steps">
            <li><span className="how-n">1</span><span>Show me a workout.</span></li>
            <li><span className="how-n">2</span><span>I name the sport, or learn it live.</span></li>
            <li><span className="how-n">3</span><span>I coach you, and the next member gets it free.</span></li>
          </ol>
        </div>
        <div className="row g28 muted t15"><span>Any sport</span><span>·</span><span>Learns once, for everyone</span><span>·</span><span>Asks before learning</span></div>
      </div>
      <div className="auth-form">
        <div className="tabs">
          <a className={isIn ? 'on' : ''} href="#/signin">Sign in</a>
          <a className={!isIn ? 'on' : ''} href="#/signup">Create account</a>
        </div>
        <form className="col g18" onSubmit={submit} noValidate>
          {isIn ? <h2 className="h36">Welcome back</h2> : (
            <div className="col g6"><span className="muted t14">Step 1 of 3</span><h2 className="h36">Create your account</h2></div>
          )}
          {!isIn && <div className="field"><label htmlFor="n">Your name</label><input id="n" className="input lg" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>}
          <div className="field"><label htmlFor="e">Email</label><input id="e" className="input lg" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label htmlFor="p">Password</label><input id="p" className="input lg" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isIn ? 'current-password' : 'new-password'} /></div>
          {!isIn && <ConsentFields value={consent} onChange={setConsent} />}
          {error && <span className="t14" role="alert" style={{ color: 'var(--fc-fail)' }}>{error}</span>}
          <Frame className="btn-frame"><button className="btn btn-primary btn-lg block" type="submit">{isIn ? 'Sign in' : 'Continue'}</button></Frame>
          <span className="muted t15 center">{isIn ? <>New here? <a href="#/signup">Create an account</a></> : <>Already a member? <a href="#/signin">Sign in</a></>}</span>
          <span className="muted t13 center">Demo accounts live in this browser only. Try owner@frankencoach.app or anna.petrova@mail.com.</span>
        </form>
      </div>
    </div>
  )
}
