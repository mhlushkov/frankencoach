import { useEffect, useReducer, useState } from 'react'
import { getTools, health as getHealth, type Health } from '../core/api/client'
import { initialState, reducer } from '../core/state'
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/base.css'
import './ui.css'
import { UiContext } from './UiContext'
import { useAccount } from './lib/account'
import { go, useRoute } from './lib/route'
import { CoachScreen } from './coach/CoachScreen'
import { AuthPage } from './pages/AuthPage'
import { BodyPage } from './pages/BodyPage'
import { AccountPage } from './pages/AccountPage'
import { OwnerPage } from './pages/OwnerPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ConsentPage } from './pages/ConsentPage'
import { hasConsent } from './lib/consent'

export function Shell() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [health, setHealth] = useState<Health>()
  const route = useRoute()
  const { user } = useAccount()

  // Poll /tools so "Sports we know" restores itself after a server restart.
  useEffect(() => {
    let alive = true
    const tick = () => {
      getHealth().then((h) => alive && setHealth(h)).catch(() => {})
      getTools().then((tools) => alive && dispatch({ type: 'toolsLoaded', tools })).catch(() => {})
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const isAuthRoute = route === 'signin' || route === 'signup'
  useEffect(() => {
    if (route === 'privacy') return
    if (!user && !isAuthRoute) go('signin')
    else if (user && isAuthRoute) go('coach')
    else if (user && route === 'owner' && !user.owner) go('coach')
  }, [user, route, isAuthRoute])

  let page
  if (route === 'privacy') page = <PrivacyPage />
  else if (!user) page = <AuthPage mode={route === 'signup' ? 'signup' : 'signin'} />
  else if (!hasConsent(user)) page = <ConsentPage user={user} />
  else if (route === 'body') page = <BodyPage user={user} />
  else if (route === 'account') page = <AccountPage user={user} />
  else if (route === 'owner' && user.owner) page = <OwnerPage user={user} />
  else page = <CoachScreen user={user} />

  return <UiContext.Provider value={{ state, dispatch, health }}>{page}</UiContext.Provider>
}
