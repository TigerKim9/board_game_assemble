import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { IllegalAction } from '../engine'
import { minhwatu, type MinhwatuMatch } from './minhwatu'

const cardsOf = (m: MinhwatuMatch) => {
  const g = m.g
  const out = [...g.floor, ...g.deck, ...g.players.flatMap((p) => [...p.hand, ...p.captured])]
  if (g.phase.kind === 'chooseHand' || g.phase.kind === 'chooseFlip') out.push(g.phase.card)
  return out.sort((a, b) => a - b)
}
const ALL = Array.from({ length: 48 }, (_, i) => i)

describe('minhwatu online', () => {
  it('bots play whole matches for 2 and 3 players', () => {
    for (const n of [2, 3]) {
      for (let seed = 1; seed <= 20; seed++) {
        const rng = mulberry32(seed * 7 + n)
        let s = minhwatu.setup(n, rng)
        let steps = 0
        while (minhwatu.toAct(s).length && steps++ < 3000) {
          const seat = minhwatu.toAct(s)[0]
          s = minhwatu.apply(s, seat, minhwatu.bot!(s, seat, rng), rng)
          expect(cardsOf(s)).toEqual(ALL)
        }
        expect(s.stage).toBe('matchOver')
        expect(s.history).toHaveLength(s.rounds)
        // 한 판 점수 합은 언제나 240 + 약 보너스
        for (const h of s.history) expect(h.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(240)
        expect(minhwatu.result(s)).not.toBeNull()
      }
    }
  })

  it('hides other hands and the deck', () => {
    const rng = mulberry32(4)
    const s = minhwatu.setup(3, rng)
    const v = minhwatu.view(s, 1)
    expect(v.g.players[1].hand).toEqual(s.g.players[1].hand)
    expect(v.g.players[0].hand).toEqual([])
    expect(v.g.players[2].hand).toEqual([])
    expect(v.g.deck).toEqual([])
    expect(v.handCounts).toEqual([7, 7, 7])
    expect(v.deckCount).toBe(s.g.deck.length)
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.g.players[0].hand))
    expect(minhwatu.view(s, null).g.players.every((p) => p.hand.length === 0)).toBe(true)
  })

  it('rejects illegal actions', () => {
    const rng = mulberry32(8)
    const s = minhwatu.setup(2, rng)
    const turn = s.g.turn
    const other = 1 - turn
    expect(() => minhwatu.apply(s, other, { type: 'play', card: s.g.players[other].hand[0] }, rng)).toThrow(IllegalAction)
    expect(() => minhwatu.apply(s, turn, { type: 'play', card: s.g.players[other].hand[0] }, rng)).toThrow('손에 없는')
    expect(() => minhwatu.apply(s, turn, { type: 'choose', card: s.g.floor[0] }, rng)).toThrow(IllegalAction)
    expect(() => minhwatu.apply(s, turn, { type: 'next' }, rng)).toThrow(IllegalAction)
    const next = minhwatu.apply(s, turn, { type: 'play', card: s.g.players[turn].hand[0] }, rng)
    expect(next.g.players[turn].hand).toHaveLength(9)
  })
})
