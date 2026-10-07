import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { farkle as G } from './farkle'

describe('online farkle', () => {
  it('bots finish games for 2~6 players', () => {
    for (let n = 2; n <= 6; n++)
      for (let seed = 1; seed <= 6; seed++) {
        const rng = mulberry32(seed * 13 + n)
        let s = G.setup(n, rng)
        let steps = 0
        while (!G.result(s)) {
          const [seat] = G.toAct(s)
          expect(['start', 'choose']).toContain(s.g.phase)
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          if (++steps > 20000) throw new Error('stuck')
        }
        const r = G.result(s)!
        expect(r.winners.length).toBeGreaterThan(0)
        expect(Math.max(...s.g.scores)).toBeGreaterThanOrEqual(5000)
        expect(G.toAct(s)).toEqual([])
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(5)
    const s = G.setup(2, rng)
    expect(() => G.apply(s, 1, { type: 'roll' }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { type: 'keep', idx: [0], bank: true }, rng)).toThrow('굴려')
    let t = G.apply(s, 0, { type: 'roll' }, rng)
    // find a non-farkle roll
    let guard = 0
    while (t.g.phase !== 'choose' || t.g.turn !== 0) {
      t = G.apply(t, t.g.turn, G.bot!(t, t.g.turn, rng), rng)
      if (++guard > 1000) throw new Error('no choose')
    }
    expect(() => G.apply(t, 0, { type: 'roll' }, rng)).toThrow()
    expect(() => G.apply(t, 0, { type: 'keep', idx: [], bank: true }, rng)).toThrow()
    expect(() => G.apply(t, 0, { type: 'keep', idx: [0, 0], bank: true }, rng)).toThrow()
    expect(() => G.apply(t, 0, { type: 'keep', idx: [99], bank: true }, rng)).toThrow()
    const bad = t.g.dice.findIndex((d) => d !== 1 && d !== 5 && t.g.dice.filter((x) => x === d).length < 3)
    if (bad >= 0) expect(() => G.apply(t, 0, { type: 'keep', idx: [bad], bank: true }, rng)).toThrow('점수')
    const good = G.bot!(t, 0, rng) as { type: 'keep'; idx: number[] }
    const before = t.g.scores[0] + t.g.turnTotal
    const u = G.apply(t, 0, { type: 'keep', idx: good.idx, bank: true }, rng)
    expect(u.g.scores[0]).toBeGreaterThan(before)
    expect(u.event?.kind === 'bank' || u.event?.kind === 'final').toBe(true)
    expect(u.g.turn).toBe(1)
  })
})
