import { createContext, useContext, type Dispatch } from 'react'
import type { Action, AppState } from '../../../contracts/types'
import type { Health } from '../core/api/client'

export interface Ui { state: AppState; dispatch: Dispatch<Action>; health?: Health }
export const UiContext = createContext<Ui | null>(null)
export function useUi(): Ui {
  const v = useContext(UiContext)
  if (!v) throw new Error('UiContext missing')
  return v
}
