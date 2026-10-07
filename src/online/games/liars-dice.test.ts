import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { liarsDice as G } from './liars-dice'

describe('online liars dice', () => {
  it('bots finish games for 2~6 players and dice only ever decrease', () => {
    for (let n = 2; n <= 6; n++)
      for (let seed = 1; seed <= 8; seed++) {
        const rng = mulberry32(seed * 31 + n)
        let s = G.setup(n, rng)
        let steps = 0
        while (!G.result(s)) {
          const [seat] = G.toAct(s)
          const before = s.g.hands.reduce((a, h) => a + h.length, 0)
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          const after = s.g.hands.reduce((a, h) => a + h.length, 0)
          expect(after === before || after === before - 1).toBe(true)
          if (++steps > 5000) throw new Error('stuck')
        }
        const r = G.result(s)!
        expect(r.winners).toHaveLength(1)
        expect(s.g.hands.filter((h) => h.length > 0)).toHaveLength(1)
        expect(G.toAct(s)).toEqual([])
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(3)
    const s = G.setup(3, rng)
    expect(() => G.apply(s, 1, { type: 'bid', bid: { qty: 1, face: 2 } }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { type: 'challenge' }, rng)).toThrow()
    expect(() => G.apply(s, 0, { type: 'bid', bid: { qty: 1, face: 1 } }, rng)).toThrow('만능')
    expect(() => G.apply(s, 0, { type: 'bid', bid: { qty: 16, face: 3 } }, rng)).toThrow()
    expect(() => G.apply(s, 0, { type: 'bid', bid: { qty: 0, face: 3 } }, rng)).toThrow()
    expect(() => G.apply(s, 0, { type: 'bid', bid: { qty: 1.5, face: 3 } }, rng)).toThrow()
    expect(() => G.apply(s, 0, { type: 'nope' } as never, rng)).toThrow()
    const t = G.apply(s, 0, { type: 'bid', bid: { qty: 3, face: 4 } }, rng)
    expect(t.g.turn).toBe(1)
    expect(() => G.apply(t, 1, { type: 'bid', bid: { qty: 3, face: 3 } }, rng)).toThrow('높게')
    const u = G.apply(t, 1, { type: 'challenge' }, rng)
    expect(u.last?.hands.map((h) => h.length)).toEqual([5, 5, 5])
    expect(u.g.hands.reduce((a, h) => a + h.length, 0)).toBe(14)
    expect(u.g.bids).toEqual([])
  })
  it('view hides other players dice', () => {
    const rng = mulberry32(9)
    const s = G.setup(3, rng)
    const v0 = G.view(s, 0)
    expect(v0.mine).toEqual(s.g.hands[0])
    expect(v0.counts).toEqual([5, 5, 5])
    const json = JSON.stringify(v0)
    expect(json).not.toContain(JSON.stringify(s.g.hands[1]))
    expect(json).not.toContain('hands')
    const spec = G.view(s, null)
    expect(spec.mine).toBeNull()
    expect(JSON.stringify(spec)).not.toContain('hands')
  })
})
