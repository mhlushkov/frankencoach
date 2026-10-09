import { expect, test } from 'bun:test'
import { CONSENT_VERSION, consentError, hasConsent, makeConsent } from './consent'

test('both boxes are required, the privacy notice first', () => {
  expect(consentError({ notice: false, health: false })).toContain('privacy notice')
  expect(consentError({ notice: false, health: true })).toContain('privacy notice')
  expect(consentError({ notice: true, health: false })).toContain('body and movement data')
  expect(consentError({ notice: true, health: true })).toBeNull()
})

test('consent counts only for the current version', () => {
  expect(hasConsent(null)).toBe(false)
  expect(hasConsent({})).toBe(false)
  expect(hasConsent({ consent: { version: '2000-01-01', at: '2000-01-01T00:00:00.000Z' } })).toBe(false)
  expect(hasConsent({ consent: makeConsent() })).toBe(true)
})

test('the record keeps the version and the moment of agreement', () => {
  const c = makeConsent(new Date('2026-10-09T03:00:00Z'))
  expect(c).toEqual({ version: CONSENT_VERSION, at: '2026-10-09T03:00:00.000Z' })
})
