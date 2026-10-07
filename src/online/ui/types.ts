import type { GameResult } from '../engine'
import type { SeatInfo } from '../protocol'

/** Props every online game screen receives. */
export interface OnlineGameProps<V = unknown, A = unknown> {
  view: V
  /** My seat, or null when spectating. */
  seat: number | null
  toAct: number[]
  result: GameResult | null
  seats: SeatInfo[]
  /** Send an action to the server. */
  act: (action: A) => void
}
