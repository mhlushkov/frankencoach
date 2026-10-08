// Minimal typing so `tsc -b` (vite/client types only) accepts the pure tests in web/src/core.
declare module 'bun:test' {
  interface Matchers {
    toBe(v: unknown): void
    toEqual(v: unknown): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeGreaterThan(n: number): void
    toBeLessThanOrEqual(n: number): void
    toContain(v: unknown): void
    toHaveLength(n: number): void
    not: Matchers
  }
  export function test(name: string, fn: () => unknown): void
  export function describe(name: string, fn: () => void): void
  export function expect(v: unknown): Matchers
}
