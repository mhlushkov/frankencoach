import { Logo } from '../lib/Frame'
import { CONSENT_VERSION } from '../lib/consent'

// Public page (no sign-in needed). Every line must match what the code does; change CONSENT_VERSION when it changes.
export function PrivacyPage() {
  return (
    <div className="col fill" style={{ overflow: 'auto' }}>
      <header className="topbar"><a className="brand" href="#/"><Logo /><span className="brand-name">FrankenCoach</span></a></header>
      <article className="privacy col g14 t15" style={{ color: 'var(--color-text-2)' }}>
        <h1 className="h36" style={{ color: 'var(--color-text)' }}>Privacy notice</h1>
        <span className="muted t14">Version {CONSENT_VERSION}. Hackathon build, not a production service.</span>

        <h2 className="h24">What I collect</h2>
        <ul>
          <li>Account: your name and email. Your password is never stored.</li>
          <li>Body profile: height, weight, age, resting heart rate, stronger side, injuries, goals. This is health data.</li>
          <li>Workouts you show me: video clips and watch or app exports, and the pose points I read from a clip.</li>
          <li>Your chat titles and the questions you type.</li>
        </ul>

        <h2 className="h24">Where it goes</h2>
        <ul>
          <li>Your account, body profile and chat list stay in this browser (localStorage). They are not sent to any server.</li>
          <li>Pose is read from your video inside the browser. The full video is not uploaded: only the pose points and up to 3 small still frames (256 px) go to our server, and a watch or app export goes as text (up to 1 MB).</li>
          <li>To name the sport and coach you, our server sends those frames, the first lines of an export, the measurements it computes and your question to Anthropic (Claude), as our processor.</li>
          <li>When you press Listen or turn on Read aloud, the coach's text is sent to ElevenLabs to make the voice. Your own data is not.</li>
          <li>The server keeps a cache of model answers and voice files, and a log of steps, token counts and costs, so repeated requests are free. They contain no name or email.</li>
        </ul>

        <h2 className="h24">Why, and on what basis</h2>
        <p>Only to coach you. Legal basis: your explicit consent (GDPR Art. 6(1)(a) and Art. 9(2)(a)), given when you create the account. No ads, no selling, no profiling for anyone else.</p>

        <h2 className="h24">How long</h2>
        <p>Browser data stays until you delete your account or clear site data. Server cache and logs are deleted after the event.</p>

        <h2 className="h24">Your rights</h2>
        <ul>
          <li>See and correct your data: Account page, "Edit".</li>
          <li>Withdraw consent and erase your data: Account page, "Delete my account and data". It takes effect at once.</li>
          <li>Ask what we hold about you, or complain: write to the team, or to your data protection authority.</li>
        </ul>

        <h2 className="h24">Who we are</h2>
        <p>Maksym Hlushkov and Anastasiia Hlushkova, team FrankenCoach, Agents 0.0.7 hackathon, Prague.</p>
      </article>
    </div>
  )
}
