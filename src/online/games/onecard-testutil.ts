// Test helper for the online card-game adapters: plays a whole game with bots through the adapter
// exactly like the server does (toAct → bot → apply), checking view() on the way.
import type { OnlineGame, Rng } from '../engine'

export function runBots<S, A, V>(
  game: OnlineGame<S, A, V>,
  n: number,
  rng: Rng,
  opts: { maxSteps?: number; pick?: (toAct: number[]) => number; onStep?: (s: S) => void } = {},
): { state: S; steps: number } {
  let s = game.setup(n, rng)
  let steps = 0
  const max = opts.maxSteps ?? 20000
  while (!game.result(s)) {
    const who = game.toAct(s)
    if (who.length === 0) throw new Error(`${game.id}: nobody to act but no result`)
    const seat = opts.pick ? opts.pick(who) : who[0]
    s = game.apply(s, seat, game.bot!(s, seat, rng), rng)
    opts.onStep?.(s)
    if (++steps > max) throw new Error(`${game.id}: too many steps`)
  }
  return { state: s, steps }
}
