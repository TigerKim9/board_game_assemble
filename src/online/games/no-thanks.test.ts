import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { noThanks as G } from './no-thanks'

describe('online no thanks', () => {
  it('bots finish games for 3~7 players; chips and cards are conserved', () => {
    for (let n = 3; n <= 7; n++)
      for (let seed = 1; seed <= 6; seed++) {
        const rng = mulberry32(seed * 23 + n)
        let s = G.setup(n, rng)
        const chips0 = s.nt.chips.reduce((a, b) => a + b, 0)
        let steps = 0
        while (!G.result(s)) {
          const [seat] = G.toAct(s)
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          expect(s.nt.chips.reduce((a, b) => a + b, 0) + s.nt.pot).toBe(chips0)
          if (++steps > 5000) throw new Error('stuck')
        }
        expect(s.nt.hands.flat()).toHaveLength(24)
        expect(G.result(s)!.winners.length).toBeGreaterThan(0)
        expect(G.view(s, 0).removed).toHaveLength(9)
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(4)
    let s = G.setup(3, rng)
    expect(() => G.apply(s, 1, { type: 'take' }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { type: 'x' } as never, rng)).toThrow()
    s = { ...s, nt: { ...s.nt, chips: [0, 11, 11] } }
    expect(() => G.apply(s, 0, { type: 'pass' }, rng)).toThrow('칩')
    const t = G.apply(s, 0, { type: 'take' }, rng)
    expect(t.nt.hands[0]).toHaveLength(1)
    expect(t.nt.turn).toBe(0)
  })
  it('view hides the deck order and removed cards', () => {
    const s = G.setup(4, mulberry32(8))
    for (const seat of [0, null]) {
      const v = G.view(s, seat)
      expect(v.removed).toEqual([])
      const json = JSON.stringify(v)
      expect(json).not.toContain('"deck"')
      expect(json).not.toContain(JSON.stringify(s.nt.removed))
    }
  })
})
