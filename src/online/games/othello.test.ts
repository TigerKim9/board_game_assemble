import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { counts } from '../../games/othello/logic'
import { othello as G } from './othello'

describe('online othello', () => {
  it('bots finish games', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const rng = mulberry32(seed)
      let s = G.setup(2, rng)
      for (let n = 0; n < 80 && G.toAct(s).length; n++) {
        const seat = G.toAct(s)[0]
        s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
      }
      expect(G.toAct(s)).toEqual([])
      const r = G.result(s)!
      expect(r.scores).toEqual(counts(s.board))
    }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(1)
    const s = G.setup(2, rng)
    expect(() => G.apply(s, 1, { cell: 19 }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { cell: 0 }, rng)).toThrow('둘 수 없')
    expect(() => G.apply(s, 0, { cell: 27 }, rng)).toThrow()
    expect(() => G.apply(s, 0, { cell: 64 }, rng)).toThrow()
    expect(G.apply(s, 0, { cell: 19 }, rng).turn).toBe(1)
  })
})
