import type { OnlineGame } from '../engine'
import { gomoku } from './gomoku'

/** All games playable online. Add new adapters here. */
export const ONLINE_GAMES: Record<string, OnlineGame<any, any, any>> = {
  [gomoku.id]: gomoku,
}
