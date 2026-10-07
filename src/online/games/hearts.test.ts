import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { TARGET } from '../../games/hearts/logic'
import { hearts, type HOnline } from './hearts'
import { runBots } from './onecard-testutil'

describe('online 하트', () => {
  it('bots play full games to 100 points', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed)
      const { state } = runBots(hearts, 4, rng, {
        pick: (who) => who[Math.floor(rng() * who.length)],
        onStep: (s) => {
          if (s.g.phase === 'play') expect(s.g.hands.flat().length + s.g.played.length).toBe(52)
        },
      })
      expect(state.g.phase).toBe('over')
      expect(Math.max(...state.g.scores)).toBeGreaterThanOrEqual(TARGET)
      const r = hearts.result(state)!
      expect(r.winners.every((w) => state.g.scores[w] === Math.min(...state.g.scores))).toBe(true)
    }
  })

  it('passing is simultaneous and secret; illegal actions are rejected', () => {
    const rng = mulberry32(4)
    let s: HOnline = hearts.setup(4, rng)
    expect(hearts.toAct(s)).toEqual([0, 1, 2, 3])
    const ids = s.g.hands[2].slice(0, 3).map((c) => c.id)
    expect(() => hearts.apply(s, 2, { type: 'pass', ids: ids.slice(0, 2) }, rng)).toThrow('3장')
    expect(() => hearts.apply(s, 2, { type: 'pass', ids: [ids[0], ids[0], ids[1]] }, rng)).toThrow()
    expect(() => hearts.apply(s, 2, { type: 'pass', ids: [s.g.hands[1][0].id, ids[1], ids[2]] }, rng)).toThrow()
    expect(() => hearts.apply(s, 2, { type: 'play', id: ids[0] }, rng)).toThrow()
    s = hearts.apply(s, 2, { type: 'pass', ids }, rng)
    expect(hearts.toAct(s)).toEqual([0, 1, 3])
    expect(() => hearts.apply(s, 2, { type: 'pass', ids }, rng)).toThrow('차례')
    const v0 = hearts.view(s, 0)
    expect(v0.passDone).toEqual([false, false, true, false])
    expect(v0.myPass).toBeNull()
    const json = JSON.stringify(v0)
    for (const c of s.g.hands[2]) expect(json).not.toContain(`"${c.id}"`)
    expect(hearts.view(s, 2).myPass).toEqual(ids)
    for (const i of [0, 1, 3]) s = hearts.apply(s, i, hearts.bot!(s, i, rng), rng)
    expect(s.g.phase).toBe('play')
    // ♣2 must lead.
    const lead = s.g.turn
    const notClub2 = s.g.hands[lead].find((c) => !(c.suit === 'C' && c.rank === 2))!
    expect(() => hearts.apply(s, lead, { type: 'play', id: notClub2.id }, rng)).toThrow('♣2')
    // received cards are private
    const left = (lead + 2) % 4
    const recv = s.g.received[lead]
    const vj = JSON.stringify(hearts.view(s, left))
    for (const c of recv) if (!s.g.hands[left].some((x) => x.id === c.id)) expect(vj).not.toContain(`"${c.id}"`)
  })

  it('a full trick is collected at once and kept as lastTrick', () => {
    const rng = mulberry32(6)
    let s: HOnline = hearts.setup(4, rng)
    while (s.g.phase === 'pass') {
      const i = hearts.toAct(s)[0]
      s = hearts.apply(s, i, hearts.bot!(s, i, rng), rng)
    }
    for (let k = 0; k < 4; k++) s = hearts.apply(s, s.g.turn, hearts.bot!(s, s.g.turn, rng), rng)
    expect(s.g.trick).toHaveLength(0)
    expect(s.g.trickNo).toBe(1)
    expect(s.g.lastTrick?.plays).toHaveLength(4)
    expect(hearts.toAct(s)).toEqual([s.g.lastTrick!.winner])
  })
})
