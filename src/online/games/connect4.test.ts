import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { connect4 as G } from './connect4'

function playOut(seed: number) {
  const rng = mulberry32(seed)
  let s = G.setup(2, rng)
  for (let n = 0; n < 100 && G.toAct(s).length; n++) {
    const seat = G.toAct(s)[0]
    s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
  }
  return s
}

describe('online connect4', () => {
  it('bots finish games', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = playOut(seed)
      expect(G.toAct(s)).toEqual([])
      expect(G.result(s)).not.toBeNull()
    }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(1)
    let s = G.setup(2, rng)
    expect(() => G.apply(s, 1, { col: 3 }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { col: 7 }, rng)).toThrow()
    expect(() => G.apply(s, 0, { col: 1.5 }, rng)).toThrow()
    expect(() => G.apply(s, 0, null as never, rng)).toThrow()
    for (let i = 0; i < 6; i++) s = G.apply(s, s.turn, { col: 0 }, rng)
    expect(() => G.apply(s, s.turn, { col: 0 }, rng)).toThrow('가득')
    expect(G.view(s, null)).toEqual(s)
  })
})
