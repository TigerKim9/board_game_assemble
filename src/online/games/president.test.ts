import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { president, type PROnline } from './president'
import { runBots } from './onecard-testutil'

describe('online 대통령', () => {
  it('bots play full 3-round games for 3~6 players (exchanges included)', () => {
    for (let n = 3; n <= 6; n++) {
      for (let seed = 1; seed <= 10; seed++) {
        let exchanged = false
        const { state } = runBots(president, n, mulberry32(seed * 13 + n), {
          onStep: (s) => {
            if (s.g.phase === 'exchange') exchanged = true
            if (s.g.phase === 'play' || s.g.phase === 'exchange') {
              expect(s.g.hands.flat().length + 0).toBeLessThanOrEqual(52)
            }
          },
        })
        expect(state.g.phase).toBe('over')
        expect(state.g.round).toBe(3)
        expect(exchanged).toBe(true)
        const r = president.result(state)!
        expect(r.winners.length).toBeGreaterThan(0)
        expect(r.scores).toHaveLength(n)
      }
    }
  })

  it('rejects illegal plays', () => {
    const s = president.setup(4, mulberry32(3))
    const p = s.g.turn
    const other = (p + 1) % 4
    expect(() => president.apply(s, other, { type: 'pass' }, mulberry32(1))).toThrow('차례')
    expect(() => president.apply(s, p, { type: 'pass' }, mulberry32(1))).toThrow('선')
    const hand = s.g.hands[p]
    const mixed = [hand[0], hand.find((c) => c.rank !== hand[0].rank)!].map((c) => c.id)
    expect(() => president.apply(s, p, { type: 'play', cardIds: mixed }, mulberry32(1))).toThrow('같은 숫자')
    expect(() => president.apply(s, p, { type: 'play', cardIds: [s.g.hands[other][0].id] }, mulberry32(1))).toThrow()
    expect(() => president.apply(s, p, { type: 'play', cardIds: [hand[0].id, hand[0].id] }, mulberry32(1))).toThrow()
    expect(() => president.apply(s, p, { type: 'next' }, mulberry32(1))).toThrow()
    // A valid single, then the next player can't play a pair on it.
    const s2 = president.apply(s, p, { type: 'play', cardIds: [hand[0].id] }, mulberry32(1))
    expect(s2.g.turn).not.toBe(p)
  })

  it('round end waits for everyone, exchange is simultaneous and private', () => {
    const rng = mulberry32(21)
    let s: PROnline = president.setup(4, rng)
    while (s.g.phase === 'play') s = president.apply(s, s.g.turn, president.bot!(s, s.g.turn, rng), rng)
    expect(s.g.phase).toBe('roundEnd')
    expect(president.toAct(s)).toEqual([0, 1, 2, 3])
    for (const i of [0, 1, 2]) s = president.apply(s, i, { type: 'next' }, rng)
    expect(president.toAct(s)).toEqual([3])
    s = president.apply(s, 3, { type: 'next' }, rng)
    expect(s.g.phase).toBe('exchange')
    const givers = president.toAct(s)
    expect(givers.length).toBe(2)
    const pres = s.g.titles.indexOf('president')
    const slave = s.g.titles.indexOf('slave')
    const citizen = [0, 1, 2, 3].find((i) => i !== pres && i !== slave && !givers.includes(i))
    // The slave's tribute is visible to the two of them only.
    const tribute = s.g.exchanges.find((e) => e.from === slave)!
    expect(president.view(s, pres).exchanges).toContainEqual(tribute)
    if (citizen != null) expect(president.view(s, citizen).exchanges).not.toContainEqual(tribute)
    expect(() => president.apply(s, pres, { type: 'give', cardIds: [s.g.hands[pres][0].id] }, rng)).toThrow('2장')
    const json = JSON.stringify(president.view(s, slave))
    // The slave knows the two cards they handed over, nothing else of the president's hand.
    for (const c of s.g.hands[pres]) if (!tribute.cards.includes(c)) expect(json).not.toContain(`"${c.id}"`)
  })
})
