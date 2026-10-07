import type { OnlineGame } from '../engine'
import { gomoku } from './gomoku'
import { holdem } from './holdem'
import { sevenpoker } from './sevenpoker'
import { hula } from './hula'
import { yacht } from './yacht'
import { liarsDice } from './liars-dice'
import { farkle } from './farkle'
import { zombieDice } from './zombie-dice'
import { noThanks } from './no-thanks'
import { cowDodge } from './cow-dodge'
import { matgo } from './matgo'
import { gostop } from './gostop'
import { seotda } from './seotda'
import { minhwatu } from './minhwatu'
import { connect4 } from './connect4'
import { othello } from './othello'
import { tictactoe } from './tictactoe'
import { checkers } from './checkers'
import { dotsBoxes } from './dots-boxes'
import { yut } from './yut'

/** All games playable online. Add new adapters here. */
export const ONLINE_GAMES: Record<string, OnlineGame<any, any, any>> = {
  [gomoku.id]: gomoku,
  [holdem.id]: holdem,
  [sevenpoker.id]: sevenpoker,
  [hula.id]: hula,
  [yacht.id]: yacht,
  [liarsDice.id]: liarsDice,
  [farkle.id]: farkle,
  [zombieDice.id]: zombieDice,
  [noThanks.id]: noThanks,
  [cowDodge.id]: cowDodge,
  [matgo.id]: matgo,
  [gostop.id]: gostop,
  [seotda.id]: seotda,
  [minhwatu.id]: minhwatu,
  [connect4.id]: connect4,
  [othello.id]: othello,
  [tictactoe.id]: tictactoe,
  [checkers.id]: checkers,
  [dotsBoxes.id]: dotsBoxes,
  [yut.id]: yut,
}
