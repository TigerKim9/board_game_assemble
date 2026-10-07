import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { targetOf } from '../../games/oldmaid/logic'
import { oldmaid } from './oldmaid'
import { runBots } from './onecard-testutil'

describe('online 도둑잡기', () => {
  it('bots play full games for 2~6 players; exactly the joker is left', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 15; seed++) {
        const { state } = runBots(oldmaid, n, mulberry32(seed * 7 + n), {
          onStep: (s) => {
            const held = s.hands.flat().length
            expect(held + s.pairs * 2).toBe(53)
          },
        })
        expect(state.loser).not.toBeNull()
        expect(state.hands[state.loser!]).toHaveLength(1)
        expect(state.hands[state.loser!][0].rank).toBe(0)
        const r = oldmaid.result(state)!
        expect(r.winners).not.toContain(state.loser)
        expect(r.winners).toHaveLength(n - 1)
        expect(oldmaid.view(state, null).jokerCard?.rank).toBe(0)
      }
    }
  })

  it('rejects illegal actions', () => {
    const s = oldmaid.setup(3, mulberry32(4))
    const other = (s.turn + 1) % 3
    expect(() => oldmaid.apply(s, other, { index: 0 }, mulberry32(1))).toThrow('차례')
    const from = targetOf(s, s.turn)
    expect(() => oldmaid.apply(s, s.turn, { index: s.hands[from].length }, mulberry32(1))).toThrow()
    expect(() => oldmaid.apply(s, s.turn, { index: 0.5 }, mulberry32(1))).toThrow()
    expect(() => oldmaid.apply(s, s.turn, {} as never, mulberry32(1))).toThrow()
  })

  it('view hides other hands and the drawn card from bystanders', () => {
    let s = oldmaid.setup(3, mulberry32(8))
    const json = JSON.stringify(oldmaid.view(s, 0))
    for (const c of s.hands[1]) expect(json).not.toContain(`"${c.id}"`)
    // Play until a non-pairing draw happens and check who sees the card.
    const rng = mulberry32(2)
    for (let k = 0; k < 60 && !s.over; k++) {
      s = oldmaid.apply(s, s.turn, oldmaid.bot!(s, s.turn, rng), rng)
      if (s.last && !s.last.paired) {
        const bystander = [0, 1, 2].find((i) => i !== s.last!.by && i !== s.last!.from)!
        expect(oldmaid.view(s, s.last.by).last?.card).toEqual(s.last.card)
        expect(oldmaid.view(s, s.last.from).last?.card).toEqual(s.last.card)
        expect(oldmaid.view(s, bystander).last?.card).toBeUndefined()
        expect(oldmaid.view(s, null).last?.card).toBeUndefined()
        return
      }
    }
  })
})
