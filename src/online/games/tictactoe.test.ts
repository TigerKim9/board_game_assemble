import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { tictactoe as G } from './tictactoe'

describe('online tictactoe', () => {
  it('bots finish games', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed)
      let s = G.setup(2, rng)
      for (let n = 0; n < 9 && G.toAct(s).length; n++) {
        const seat = G.toAct(s)[0]
        s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
      }
      expect(G.toAct(s)).toEqual([])
      expect(G.result(s)).not.toBeNull()
    }
  })
  it('rejects illegal actions and detects wins', () => {
    const rng = mulberry32(1)
    let s = G.setup(2, rng)
    expect(() => G.apply(s, 1, { cell: 0 }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { cell: 9 }, rng)).toThrow()
    s = G.apply(s, 0, { cell: 0 }, rng)
    expect(() => G.apply(s, 1, { cell: 0 }, rng)).toThrow('이미')
    for (const [seat, cell] of [[1, 3], [0, 1], [1, 4], [0, 2]]) s = G.apply(s, seat, { cell }, rng)
    expect(G.result(s)!.winners).toEqual([0])
    expect(() => G.apply(s, 1, { cell: 8 }, rng)).toThrow()
  })
})
