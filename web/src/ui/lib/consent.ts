// GDPR consent for sign-up. Body and movement data are health data (GDPR Art. 9), so processing needs explicit
// consent, asked separately from the privacy notice. Bump VERSION when PrivacyPage changes what we do with data:
// members who agreed to an older version are asked again before they can use the coach.
export const CONSENT_VERSION = '2026-10-09'

export interface Consent { version: string; at: string }
export interface ConsentChoice { notice: boolean; health: boolean }

export function consentError(c: ConsentChoice): string | null {
  if (!c.notice) return 'Please read and accept the privacy notice to continue.'
  if (!c.health) return 'I need your consent to process your body and movement data. Without it I cannot coach you.'
  return null
}

export const hasConsent = (u: { consent?: Consent } | null | undefined): boolean => u?.consent?.version === CONSENT_VERSION

export const makeConsent = (now = new Date()): Consent => ({ version: CONSENT_VERSION, at: now.toISOString() })
