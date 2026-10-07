import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { legalMoves, pieceCounts } from '../../games/checkers/logic'
import { checkers as G } from './checkers'

describe('online checkers', () => {
  it('bots finish games', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const rng = mulberry32(seed)
      let s = G.setup(2, rng)
      for (let n = 0; n < 400 && G.toAct(s).length; n++) {
        const seat = G.toAct(s)[0]
        s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
        const [a, b] = pieceCounts(s.board)
        expect(a).toBeLessThanOrEqual(12)
        expect(b).toBeLessThanOrEqual(12)
      }
      expect(G.toAct(s)).toEqual([])
      expect(G.result(s)).not.toBeNull()
    }
  }, 30000)
  it('rejects illegal actions', () => {
    const rng = mulberry32(1)
    const s = G.setup(2, rng)
    const m = legalMoves(s.board, 0)[0]
    expect(() => G.apply(s, 1, { path: m.path }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { path: [m.path[0], m.path[0] - 16] }, rng)).toThrow('움직일 수 없')
    expect(() => G.apply(s, 0, { path: [] }, rng)).toThrow()
    expect(() => G.apply(s, 0, {} as never, rng)).toThrow()
    expect(G.apply(s, 0, { path: m.path }, rng).turn).toBe(1)
  })
})
