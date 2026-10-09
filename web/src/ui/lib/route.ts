import { useSyncExternalStore } from 'react'

// Hash routes (no router dependency allowed): #/signin #/signup #/body #/account #/owner #/privacy, anything else = coach.
export type Route = 'signin' | 'signup' | 'body' | 'account' | 'owner' | 'privacy' | 'coach'
const ROUTES: Route[] = ['signin', 'signup', 'body', 'account', 'owner', 'privacy']
const get = (): Route => { const h = location.hash.replace(/^#\/?/, ''); return (ROUTES as string[]).includes(h) ? (h as Route) : 'coach' }
const subscribe = (f: () => void) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }
export const useRoute = () => useSyncExternalStore(subscribe, get)
export const go = (r: Route) => { location.hash = r === 'coach' ? '#/' : `#/${r}` }
