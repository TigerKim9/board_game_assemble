import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { dotsBoxes as G } from './dots-boxes'

describe('online dots-boxes', () => {
  it('bots finish games for 2~4 players', () => {
    for (let n = 2; n <= 4; n++)
      for (let seed = 1; seed <= 4; seed++) {
        const rng = mulberry32(seed * 10 + n)
        let s = G.setup(n, rng)
        for (let k = 0; k < 200 && G.toAct(s).length; k++) {
          const seat = G.toAct(s)[0]
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
        }
        expect(G.toAct(s)).toEqual([])
        const r = G.result(s)!
        expect(r.scores!.length).toBe(n)
        expect(r.scores!.reduce((a, b) => a + b, 0)).toBe(s.n * s.n)
      }
  }, 30000)
  it('rejects illegal actions', () => {
    const rng = mulberry32(1)
    let s = G.setup(3, rng)
    expect(s.n).toBe(5)
    expect(() => G.apply(s, 1, { edge: 0 }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { edge: -1 }, rng)).toThrow()
    expect(() => G.apply(s, 0, { edge: 9999 }, rng)).toThrow()
    s = G.apply(s, 0, { edge: 0 }, rng)
    expect(s.turn).toBe(1)
    expect(() => G.apply(s, 1, { edge: 0 }, rng)).toThrow('이미')
  })
})
