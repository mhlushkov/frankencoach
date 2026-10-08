import type { Landmarks } from '../../../../contracts/types'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (hash: string) => `fc:lm:${hash}`

// localStorage `fc:lm:<hash>`; any storage error (private mode, quota) → in-memory Map.
export function createLandmarkCache(store: Store | undefined = globalThis.localStorage) {
  const mem = new Map<string, Landmarks>()
  return {
    get(hash: string): Landmarks | undefined {
      if (mem.has(hash)) return mem.get(hash)
      try {
        const raw = store?.getItem(key(hash))
        return raw ? (JSON.parse(raw) as Landmarks) : undefined
      } catch {
        return undefined
      }
    },
    set(hash: string, l: Landmarks): void {
      try {
        if (!store) throw new Error('no storage')
        store.setItem(key(hash), JSON.stringify(l))
      } catch {
        mem.set(hash, l)
      }
    },
    remove(hash: string): void {
      mem.delete(hash)
      try { store?.removeItem(key(hash)) } catch { /* ignore */ }
    },
  }
}

export const landmarkCache = createLandmarkCache()
