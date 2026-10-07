import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { OnlineGameProps } from './types'

// Screens are lazy-loaded so the online page stays small.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ONLINE_UI: Record<string, LazyExoticComponent<ComponentType<OnlineGameProps<any, any>>>> = {
  gomoku: lazy(() => import('./gomoku')),
  holdem: lazy(() => import('./holdem')),
  sevenpoker: lazy(() => import('./sevenpoker')),
  hula: lazy(() => import('./hula')),
  yacht: lazy(() => import('./yacht')),
  'liars-dice': lazy(() => import('./liars-dice')),
  farkle: lazy(() => import('./farkle')),
  'zombie-dice': lazy(() => import('./zombie-dice')),
  'no-thanks': lazy(() => import('./no-thanks')),
  'cow-dodge': lazy(() => import('./cow-dodge')),
  matgo: lazy(() => import('./matgo')),
  gostop: lazy(() => import('./gostop')),
  seotda: lazy(() => import('./seotda')),
  minhwatu: lazy(() => import('./minhwatu')),
  connect4: lazy(() => import('./connect4')),
  othello: lazy(() => import('./othello')),
  tictactoe: lazy(() => import('./tictactoe')),
  checkers: lazy(() => import('./checkers')),
  'dots-boxes': lazy(() => import('./dots-boxes')),
  yut: lazy(() => import('./yut')),
}
