import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { zombieDice as G } from './zombie-dice'

describe('online zombie dice', () => {
  it('bots finish games for 2~8 players with 13 dice conserved', () => {
    for (let n = 2; n <= 8; n++)
      for (let seed = 1; seed <= 5; seed++) {
        const rng = mulberry32(seed * 17 + n)
        let s = G.setup(n, rng)
        let steps = 0
        while (!G.result(s)) {
          const [seat] = G.toAct(s)
          expect(['start', 'decide']).toContain(s.z.phase)
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          const z = s.z
          expect(z.cup.length + z.hand.filter((d) => d.face === 'feet').length + z.shots.length + z.brainDice.length).toBe(13)
          if (++steps > 20000) throw new Error('stuck')
        }
        expect(G.result(s)!.winners.length).toBeGreaterThan(0)
        expect(Math.max(...s.z.scores)).toBeGreaterThanOrEqual(13)
        expect(G.toAct(s)).toEqual([])
      }
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(2)
    const s = G.setup(3, rng)
    expect(() => G.apply(s, 1, { type: 'roll' }, rng)).toThrow('차례')
    expect(() => G.apply(s, 0, { type: 'stop' }, rng)).toThrow('뇌')
    expect(() => G.apply(s, 0, { type: 'x' } as never, rng)).toThrow()
    const t = G.apply(s, 0, { type: 'roll' }, rng)
    expect(t.rollNo).toBe(1)
    if (t.z.turn === 0 && t.z.brains > 0) {
      const u = G.apply(t, 0, { type: 'stop' }, rng)
      expect(u.z.scores[0]).toBe(t.z.brains)
      expect(u.z.turn).toBe(1)
    }
  })
  it('view carries no player names or internal log', () => {
    const s = G.setup(2, mulberry32(1))
    const v = G.view(s, 0) as unknown as Record<string, unknown>
    expect(v.players).toBeUndefined()
  })
})
