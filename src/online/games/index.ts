import type { OnlineGame } from '../engine'
import { gomoku } from './gomoku'
import { yacht } from './yacht'
import { liarsDice } from './liars-dice'
import { farkle } from './farkle'
import { zombieDice } from './zombie-dice'
import { noThanks } from './no-thanks'
import { cowDodge } from './cow-dodge'
import { connect4 } from './connect4'
import { othello } from './othello'
import { tictactoe } from './tictactoe'
import { checkers } from './checkers'
import { dotsBoxes } from './dots-boxes'
import { yut } from './yut'

/** All games playable online. Add new adapters here. */
export const ONLINE_GAMES: Record<string, OnlineGame<any, any, any>> = {
  [gomoku.id]: gomoku,
  [yacht.id]: yacht,
  [liarsDice.id]: liarsDice,
  [farkle.id]: farkle,
  [zombieDice.id]: zombieDice,
  [noThanks.id]: noThanks,
  [cowDodge.id]: cowDodge,
  [connect4.id]: connect4,
  [othello.id]: othello,
  [tictactoe.id]: tictactoe,
  [checkers.id]: checkers,
  [dotsBoxes.id]: dotsBoxes,
  [yut.id]: yut,
}
