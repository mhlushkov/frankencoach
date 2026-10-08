import { expect, test } from 'bun:test'
import { shouldShowOnboarding } from './HowItWorks'

test('first visit with an empty conversation shows the panel', () => {
  expect(shouldShowOnboarding(0, null)).toBe(true)
  expect(shouldShowOnboarding(0, '')).toBe(true)
})

test('"Got it" (fc.onboarded = "1") hides it for good', () => {
  expect(shouldShowOnboarding(0, '1')).toBe(false)
})

test('once the conversation has messages it stays out of the way', () => {
  expect(shouldShowOnboarding(1, null)).toBe(false)
  expect(shouldShowOnboarding(4, '1')).toBe(false)
})

test('any other stored value counts as not onboarded', () => {
  expect(shouldShowOnboarding(0, '0')).toBe(true)
  expect(shouldShowOnboarding(0, 'true')).toBe(true)
})
