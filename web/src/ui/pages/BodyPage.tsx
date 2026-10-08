import { useState } from 'react'
import { Frame, Logo } from '../lib/Frame'
import { go } from '../lib/route'
import { saveBody, type Body, type User } from '../lib/account'

const GOALS = ['Get faster', 'Better technique', 'Avoid injuries', 'Lose weight', 'Build strength']
const SIDES: Body['side'][] = ['Left', 'Right', 'Not sure']

export function BodyPage({ user }: { user: User }) {
  const [b, setB] = useState<Body>(user.body ?? { height: '', weight: '', age: '', restingHr: '', side: 'Right', injuries: '', goals: [] })
  const set = <K extends keyof Body>(k: K, v: Body[K]) => setB((x) => ({ ...x, [k]: v }))
  const toggle = (g: string) => set('goals', b.goals.includes(g) ? b.goals.filter((x) => x !== g) : [...b.goals, g])
  const save = () => { saveBody(user.id, b); go('coach') }

  return (
    <div className="col fill">
      <header className="topbar">
        <div className="brand"><Logo /><span className="brand-name">FrankenCoach</span></div>
        <div className="topbar-right g28 t15">
          <span style={{ color: 'var(--fc-alive)' }}>✓ Account</span><span style={{ fontWeight: 500 }}>2 · About you</span>
        </div>
      </header>
      <div className="body-grid">
        <div className="col g26">
          <div className="col g8"><h1 className="h44">Tell me about yourself</h1><p className="lede2">This helps me give advice that fits your body. You can change it any time.</p></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="h">Height</label><input id="h" className="input lg" placeholder="e.g. 1.74 m" value={b.height} onChange={(e) => set('height', e.target.value)} /></div>
            <div className="field"><label htmlFor="w">Weight</label><input id="w" className="input lg" placeholder="e.g. 66 kg" value={b.weight} onChange={(e) => set('weight', e.target.value)} /></div>
            <div className="field"><label htmlFor="a">Age</label><input id="a" className="input lg" inputMode="numeric" value={b.age} onChange={(e) => set('age', e.target.value)} /></div>
            <div className="field"><label htmlFor="r">Resting heart rate <span className="opt">(optional)</span></label><input id="r" className="input lg" placeholder="e.g. 60" value={b.restingHr} onChange={(e) => set('restingHr', e.target.value)} /></div>
            <div className="field span2"><label>Stronger side</label>
              <div className="seg" role="radiogroup">{SIDES.map((s) => <label key={s} className="seg-opt"><input type="radio" name="side" checked={b.side === s} onChange={() => set('side', s)} />{s}</label>)}</div>
            </div>
            <div className="field span3"><label htmlFor="i">Any injuries or pain I should know about? <span className="opt">(optional)</span></label><textarea id="i" className="input" value={b.injuries} onChange={(e) => set('injuries', e.target.value)} /></div>
            <div className="field span3"><label>What do you want to get better at?</label>
              <div className="row g10 wrap">{GOALS.map((g) => <button key={g} type="button" className={`chip ${b.goals.includes(g) ? 'on' : ''}`} aria-pressed={b.goals.includes(g)} onClick={() => toggle(g)}>{g}</button>)}</div>
            </div>
          </div>
          <div className="row g12" style={{ marginTop: 4 }}>
            <button className="btn btn-secondary btn-lg" onClick={() => go('coach')}>Back</button>
            <Frame className="btn-frame"><button className="btn btn-primary btn-lg" onClick={save}>Continue</button></Frame>
            <a className="t15" style={{ alignSelf: 'center', marginLeft: 8 }} href="#/" onClick={() => go('coach')}>Skip for now</a>
          </div>
        </div>
        <Frame className="aside-card col g16">
          <h3 className="h22">How I use this</h3>
          <div className="col g14 t15 use-list">
            <span><b>Height</b> to judge squat depth and running stride</span>
            <span><b>Weight</b> for cycling power and climbing</span>
            <span><b>Age and heart rate</b> to tell if you're pushing too hard</span>
            <span><b>Injuries</b> so I don't suggest anything that could hurt</span>
          </div>
          <span className="muted t14">Only you can see this. It's never shared with other members.</span>
        </Frame>
      </div>
    </div>
  )
}
