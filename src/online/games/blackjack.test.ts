import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { MIN_BET, START_CHIPS } from '../../games/blackjack/logic'
import { ROUNDS, blackjack, type BJOnline } from './blackjack'
import { runBots } from './onecard-testutil'

/** Chips at the table + chips riding on hands = constant while no round has been settled. */
const staked = (s: BJOnline) => s.t.seats.reduce((a, x) => a + x.chips + x.hands.reduce((b, h) => b + (h.payout == null ? h.bet : 0), 0), 0)

describe('online 블랙잭', () => {
  it('bots play whole matches for 1~5 players', () => {
    for (let n = 1; n <= 5; n++) {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = mulberry32(seed * 3 + n)
        let before = n * START_CHIPS
        const { state } = runBots(blackjack, n, rng, {
          pick: (who) => who[Math.floor(rng() * who.length)],
          onStep: (s) => {
            if (s.t.phase === 'play') expect(staked(s)).toBe(before)
            if (s.t.phase === 'bet') before = s.t.seats.reduce((a, x) => a + x.chips, 0)
            for (const x of s.t.seats) expect(x.chips).toBeGreaterThanOrEqual(0)
          },
        })
        expect(state.over).toBe(true)
        expect(state.round).toBeLessThanOrEqual(ROUNDS)
        const r = blackjack.result(state)!
        expect(r.scores).toHaveLength(n)
        expect(r.winners.length).toBeGreaterThan(0)
      }
    }
  })

  it('bets are simultaneous, validated and hidden; the hole card is hidden', () => {
    const rng = mulberry32(11)
    let s = blackjack.setup(3, rng)
    expect(blackjack.toAct(s)).toEqual([0, 1, 2])
    expect(() => blackjack.apply(s, 0, { type: 'bet', amount: MIN_BET - 1 }, rng)).toThrow('최소')
    expect(() => blackjack.apply(s, 0, { type: 'bet', amount: START_CHIPS + 10 }, rng)).toThrow('칩')
    expect(() => blackjack.apply(s, 0, { type: 'act', action: 'hit' }, rng)).toThrow()
    s = blackjack.apply(s, 1, { type: 'bet', amount: 120 }, rng)
    expect(blackjack.toAct(s)).toEqual([0, 2])
    expect(blackjack.view(s, 0).seats[1].bet).toBe(0)
    expect(blackjack.view(s, 1).seats[1].bet).toBe(120)
    expect(() => blackjack.apply(s, 1, { type: 'bet', amount: 50 }, rng)).toThrow('차례')
    s = blackjack.apply(s, 0, { type: 'bet', amount: 50 }, rng)
    s = blackjack.apply(s, 2, { type: 'bet', amount: 30 }, rng)
    expect(s.t.phase === 'play' || s.t.phase === 'done').toBe(true)
    if (s.t.phase === 'play') {
      const v = blackjack.view(s, 0)
      expect(v.dealer).toHaveLength(1)
      expect(v.dealerHidden).toBe(1)
      const hole = s.t.dealer[1]
      const json = JSON.stringify(v)
      expect(json).not.toContain(`"${hole.id}"`) // might coincide with a shown card id in a 6-deck shoe only if same id
      expect(json).not.toContain('"shoe"')
      expect(v.seats[1].bet).toBe(120)
      const turn = s.t.turn!.seat
      expect(() => blackjack.apply(s, (turn + 1) % 3, { type: 'act', action: 'stand' }, rng)).toThrow('차례')
    }
  })
})
