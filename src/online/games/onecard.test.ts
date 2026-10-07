import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { canPlay } from '../../games/onecard/logic'
import { onecard, type OCOnline } from './onecard'
import { runBots } from './onecard-testutil'

const total = (s: OCOnline) => s.g.hands.flat().length + s.g.pile.length + s.g.discard.length

describe('online 원카드', () => {
  it('bots play full games for 2~6 players, conserving all 54 cards', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 12; seed++) {
        const rng = mulberry32(seed * 31 + n)
        const { state } = runBots(onecard, n, rng, {
          // Pick a random seat among those allowed (the 원카드 race).
          pick: (who) => who[Math.floor(rng() * who.length)],
          onStep: (s) => expect(total(s)).toBe(54),
        })
        expect(state.g.over).toBe(true)
        expect(onecard.result(state)!.winners).toHaveLength(1)
      }
    }
  })

  it('rejects illegal actions', () => {
    const s = onecard.setup(3, mulberry32(5))
    const other = (s.g.turn + 1) % 3
    expect(() => onecard.apply(s, other, { type: 'draw' }, mulberry32(1))).toThrow('차례')
    expect(() => onecard.apply(s, s.g.turn, { type: 'play', cardId: 'nope' }, mulberry32(1))).toThrow()
    const unplayable = s.g.hands[s.g.turn].find((c) => !canPlay(s.g, c))
    if (unplayable) expect(() => onecard.apply(s, s.g.turn, { type: 'play', cardId: unplayable.id }, mulberry32(1))).toThrow()
    expect(() => onecard.apply(s, s.g.turn, { type: 'catch' }, mulberry32(1))).toThrow()
    expect(() => onecard.apply(s, other, { type: 'pass' }, mulberry32(1))).toThrow()
    expect(() => onecard.apply(s, s.g.turn, { type: 'zap' } as never, mulberry32(1))).toThrow()
  })

  it('opens a 원카드 race: others may catch, the vulnerable seat may declare', () => {
    const s0 = onecard.setup(3, mulberry32(9))
    const s: OCOnline = { ...s0, g: { ...s0.g, vulnerable: 1, turn: 2 } }
    expect(onecard.toAct(s).sort()).toEqual([0, 1, 2])
    const caught = onecard.apply(s, 0, { type: 'catch' }, mulberry32(2))
    expect(caught.g.hands[1].length).toBe(s.g.hands[1].length + 1)
    expect(caught.g.vulnerable).toBeNull()
    expect(onecard.toAct(caught)).toEqual([2])
    const declared = onecard.apply(s, 1, { type: 'declare' }, mulberry32(2))
    expect(declared.g.vulnerable).toBeNull()
    expect(() => onecard.apply(s, 1, { type: 'catch' }, mulberry32(2))).toThrow()
    const passed = onecard.apply(s, 0, { type: 'pass' }, mulberry32(2))
    expect(onecard.toAct(passed).sort()).toEqual([1, 2])
  })

  it('view hides other hands and the pile', () => {
    const s = onecard.setup(4, mulberry32(3))
    const v = onecard.view(s, 0)
    const json = JSON.stringify(v)
    for (const c of s.g.hands[1]) expect(json).not.toContain(`"${c.id}"`)
    for (const c of s.g.pile) expect(json).not.toContain(`"${c.id}"`)
    expect(v.hand).toEqual(s.g.hands[0])
    expect(v.counts).toEqual([7, 7, 7, 7])
    const spec = JSON.stringify(onecard.view(s, null))
    for (const c of s.g.hands[0]) expect(spec).not.toContain(`"${c.id}"`)
  })
})
