import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import type { OnlineGame } from '../engine'
import { yacht } from './yacht'

function playOut<S, A>(g: OnlineGame<S, A>, n: number, seed: number, maxSteps = 5000) {
  const rng = mulberry32(seed)
  let s = g.setup(n, rng)
  let steps = 0
  while (!g.result(s)) {
    const seats = g.toAct(s)
    expect(seats.length).toBeGreaterThan(0)
    const seat = seats[0]
    s = g.apply(s, seat, g.bot!(s, seat, rng), rng)
    if (++steps > maxSteps) throw new Error('game did not finish')
  }
  expect(g.toAct(s)).toEqual([])
  return s
}

describe('online yacht', () => {
  it('bots finish games for 2~4 players', () => {
    for (let n = 2; n <= 4; n++)
      for (let seed = 1; seed <= 3; seed++) {
        const s = playOut(yacht, n, seed * 7 + n)
        const r = yacht.result(s)!
        expect(r.winners.length).toBeGreaterThan(0)
        expect(r.scores).toHaveLength(n)
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(1)
    const s = yacht.setup(2, rng)
    expect(() => yacht.apply(s, 1, { type: 'roll' }, rng)).toThrow('차례')
    expect(() => yacht.apply(s, 0, { type: 'score', cat: 'yacht' }, rng)).toThrow('굴려')
    let t = yacht.apply(s, 0, { type: 'roll' }, rng)
    expect(t.rollsLeft).toBe(2)
    expect(() => yacht.apply(t, 0, { type: 'score', cat: 'nope' as never }, rng)).toThrow()
    expect(() => yacht.apply(t, 0, { type: 'roll', held: [true, true] }, rng)).toThrow()
    expect(() => yacht.apply(t, 0, { type: 'roll', held: [true, true, true, true, true] }, rng)).toThrow()
    const keep = [true, false, true, false, false]
    const u = yacht.apply(t, 0, { type: 'roll', held: keep }, rng)
    expect(u.dice[0]).toBe(t.dice[0])
    expect(u.dice[2]).toBe(t.dice[2])
    t = yacht.apply(u, 0, { type: 'roll' }, rng)
    expect(() => yacht.apply(t, 0, { type: 'roll' }, rng)).toThrow()
    const sum = t.dice.reduce((a, b) => a + b, 0)
    t = yacht.apply(t, 0, { type: 'score', cat: 'choice' }, rng)
    expect(t.turn).toBe(1)
    expect(t.scores[0].choice).toBe(sum)
    expect(() => yacht.apply(t, 1, { type: 'roll', held: [true, false, false, false, false] }, rng)).not.toThrow()
    expect(() => yacht.apply(t, 0, { type: 'roll' }, rng)).toThrow()
  })
})
