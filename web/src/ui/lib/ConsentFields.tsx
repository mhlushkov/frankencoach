import type { ConsentChoice } from './consent'

// The two separate, unticked boxes GDPR asks for: the notice, and explicit consent for health data (Art. 9(2)(a)).
export function ConsentFields({ value, onChange }: { value: ConsentChoice; onChange: (v: ConsentChoice) => void }) {
  return (
    <div className="col g10">
      <label className="consent t14">
        <input type="checkbox" checked={value.notice} onChange={(e) => onChange({ ...value, notice: e.target.checked })} />
        <span>I have read the <a href="#/privacy" target="_blank" rel="noreferrer">privacy notice</a>.</span>
      </label>
      <label className="consent t14">
        <input type="checkbox" checked={value.health} onChange={(e) => onChange({ ...value, health: e.target.checked })} />
        <span>I agree that FrankenCoach processes my body and movement data (videos, pose, heart rate, my body profile) to coach me, and sends up to 3 still frames, workout data and measurements to Anthropic (Claude), and coach text to ElevenLabs when I use voice. I can withdraw by deleting my account.</span>
      </label>
    </div>
  )
}
