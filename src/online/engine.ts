// Server-authoritative online game definition. Shared by the Node server and the web client.
// The server owns the full state; each client only ever receives `view(state, seat)`,
// so hidden information (other players' hands, the deck) never leaves the server.

export type Rng = () => number

export interface GameResult {
  /** Winning seats (empty for a draw). */
  winners: number[]
  /** Short Korean summary shown on the result screen, e.g. "흑 5목 완성". */
  summary?: string
  /** Optional per-seat score line. */
  scores?: number[]
}

export interface OnlineGame<S = unknown, A = unknown, V = unknown> {
  id: string
  name: string
  emoji: string
  minPlayers: number
  maxPlayers: number
  /** Whether empty seats may be filled by bots. */
  bots: boolean
  setup(numPlayers: number, rng: Rng): S
  /** Seats allowed to send an action right now (usually one). Empty when the game is over. */
  toAct(state: S): number[]
  /** Apply an action. Throw an Error with a Korean message when the action is illegal. */
  apply(state: S, seat: number, action: A, rng: Rng): S
  /** What `seat` may see. `null` = spectator. Must strip hidden information. */
  view(state: S, seat: number | null): V
  result(state: S): GameResult | null
  /** Bot move for `seat` (required when `bots` is true). */
  bot?(state: S, seat: number, rng: Rng): A
}

export class IllegalAction extends Error {}

export function assertLegal(cond: unknown, message: string): asserts cond {
  if (!cond) throw new IllegalAction(message)
}
