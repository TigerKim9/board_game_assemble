import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { OnlineGameProps } from './types'

// Screens are lazy-loaded so the online page stays small.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ONLINE_UI: Record<string, LazyExoticComponent<ComponentType<OnlineGameProps<any, any>>>> = {
  gomoku: lazy(() => import('./gomoku')),
}
