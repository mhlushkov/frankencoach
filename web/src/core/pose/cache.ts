import type { Landmarks } from '../../../../contracts/types'
import type { Person } from './people'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// localStorage `<prefix><hash>`; any storage error (private mode, quota) → in-memory Map.
export function createCache<T>(prefix: string, store: Store | undefined = globalThis.localStorage) {
  const key = (hash: string) => `${prefix}${hash}`
  const mem = new Map<string, T>()
  return {
    get(hash: string): T | undefined {
      if (mem.has(hash)) return mem.get(hash)
      try {
        const raw = store?.getItem(key(hash))
        return raw ? (JSON.parse(raw) as T) : undefined
      } catch {
        return undefined
      }
    },
    set(hash: string, v: T): void {
      try {
        if (!store) throw new Error('no storage')
        store.setItem(key(hash), JSON.stringify(v))
      } catch {
        mem.set(hash, v)
      }
    },
    remove(hash: string): void {
      mem.delete(hash)
      try { store?.removeItem(key(hash)) } catch { /* ignore */ }
    },
  }
}

export function createLandmarkCache(store?: Store) {
  return createCache<Landmarks>('fc:lm:', store)
}

/** Every tracked person of a clip; `none` holds the all-null Landmarks when nobody was found. */
export interface PoseEntry { people: Person[]; none?: Landmarks }

// v2: multi-person entries. Old `fc:lm:<hash>` single-person entries are deliberately not read any more.
export const POSE_CACHE_PREFIX = 'fc:pose:v2:'
export function createPoseCache(store?: Store) {
  return createCache<PoseEntry>(POSE_CACHE_PREFIX, store)
}

export const poseCache = createPoseCache()
