import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { DONE, OFF } from '../../games/yut/logic'
import { YUT_PIECES, yut as G } from './yut'

describe('online yut', () => {
  it('bots finish games for 2~4 players', () => {
    for (let n = 2; n <= 4; n++)
      for (let seed = 1; seed <= 8; seed++) {
        const rng = mulberry32(seed * 7 + n)
        let s = G.setup(n, rng)
        for (let k = 0; k < 3000 && G.toAct(s).length; k++) {
          const seat = G.toAct(s)[0]
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          expect(s.g.pieces.length).toBe(n * YUT_PIECES)
        }
        expect(G.toAct(s)).toEqual([])
        const r = G.result(s)!
        expect(r.scores![r.winners[0]]).toBe(YUT_PIECES)
        expect(s.events.length).toBeGreaterThan(0)
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(3)
    let s = G.setup(2, rng)
    expect(() => G.apply(s, 1, { type: 'throw' }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { type: 'move', throwIndex: 0, piece: 0 }, rng)).toThrow('던지')
    expect(() => G.apply(s, 0, { type: 'nope' } as never, rng)).toThrow()
    // Throw until seat 0 has a move to make.
    while (s.g.turn !== 0 || s.g.canThrow) {
      const seat = G.toAct(s)[0]
      s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
    }
    expect(() => G.apply(s, 0, { type: 'throw' }, rng)).toThrow('먼저')
    expect(() => G.apply(s, 0, { type: 'move', throwIndex: 0, piece: YUT_PIECES }, rng)).toThrow('내 말')
    expect(() => G.apply(s, 0, { type: 'move', throwIndex: 9, piece: 0 }, rng)).toThrow()
    if (s.g.pending[0] !== 'backdo') {
      const next = G.apply(s, 0, { type: 'move', throwIndex: 0, piece: 0 }, rng)
      expect(next.g.pieces[0].pos).not.toBe(OFF)
      expect(next.g.pieces[0].pos).not.toBe(DONE)
    }
  })
  it('uses the given rng for throws', () => {
    const a = G.apply(G.setup(2, mulberry32(1)), 0, { type: 'throw' }, mulberry32(5))
    const b = G.apply(G.setup(2, mulberry32(1)), 0, { type: 'throw' }, mulberry32(5))
    expect(a.sticks).toEqual(b.sticks)
    expect(a.throwNo).toBe(1)
  })
})
