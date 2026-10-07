import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  ANTE,
  SEOTDA_IDS,
  aiAction,
  applyAction,
  betCap,
  evaluate,
  handStrength,
  legalActions,
  settle,
  showdown,
  startHand,
  type SPlayer,
} from './logic'

// id 도우미: (월, 0=광/열끗 | 1=띠)
const c = (m: number, s: 0 | 1 = 1) => (m - 1) * 4 + s

describe('seotda hands', () => {
  it('uses 20 cards', () => {
    expect(SEOTDA_IDS).toHaveLength(20)
  })
  it('ranks gwangttaeng and ttaeng', () => {
    expect(evaluate([c(3, 0), c(8, 0)]).name).toBe('38광땡')
    expect(evaluate([c(1, 0), c(8, 0)]).name).toBe('18광땡')
    expect(evaluate([c(1, 0), c(3, 0)]).name).toBe('13광땡')
    expect(evaluate([c(1, 0), c(3, 1)]).name).toBe('4끗')
    expect(evaluate([c(10, 0), c(10, 1)]).name).toBe('장땡')
    expect(evaluate([c(1, 0), c(1, 1)]).name).toBe('삥땡')
    expect(evaluate([c(5, 0), c(5, 1)]).name).toBe('5땡')
    expect(evaluate([c(3, 0), c(8, 0)]).score).toBeGreaterThan(evaluate([c(1, 0), c(8, 0)]).score)
    expect(evaluate([c(1, 0), c(8, 0)]).score).toBeGreaterThan(evaluate([c(10, 0), c(10, 1)]).score)
  })
  it('ranks middle hands in order', () => {
    const names = [
      [1, 2],
      [1, 4],
      [1, 9],
      [1, 10],
      [4, 10],
      [4, 6],
    ].map(([a, b]) => evaluate([c(a), c(b)]))
    expect(names.map((h) => h.name)).toEqual(['알리', '독사', '구삥', '장삥', '장사', '세륙'])
    for (let i = 1; i < names.length; i++) expect(names[i - 1].score).toBeGreaterThan(names[i].score)
    expect(evaluate([c(4), c(6)]).score).toBeGreaterThan(evaluate([c(2), c(7)]).score) // 세륙 > 갑오
  })
  it('counts kkeut', () => {
    expect(evaluate([c(2), c(7)]).name).toBe('갑오')
    expect(evaluate([c(2), c(8)]).name).toBe('망통')
    expect(evaluate([c(3), c(5)]).name).toBe('8끗')
  })
  it('detects specials', () => {
    expect(evaluate([c(3, 0), c(7, 0)]).special).toBe('ttaengjabi')
    expect(evaluate([c(3, 1), c(7, 0)]).special).toBeUndefined()
    expect(evaluate([c(4, 0), c(7, 0)]).special).toBe('amhaeng')
    expect(evaluate([c(4, 1), c(9, 0)]).special).toBe('gusa')
    expect(evaluate([c(4, 0), c(9, 0)]).special).toBe('mgusa')
  })
})

describe('seotda showdown', () => {
  it('higher hand wins, ties split', () => {
    expect(showdown([{ seat: 0, cards: [c(2), c(7)] }, { seat: 1, cards: [c(3), c(5)] }])).toEqual({ kind: 'win', winners: [0] })
    const r = showdown([{ seat: 0, cards: [c(2, 0), c(7, 1)] }, { seat: 1, cards: [c(3), c(6)] }])
    expect(r).toEqual({ kind: 'win', winners: [0, 1] })
  })
  it('ttaengjabi catches 1~9 ttaeng but not jangttaeng', () => {
    const tj = { seat: 0, cards: [c(3, 0), c(7, 0)] }
    expect(showdown([tj, { seat: 1, cards: [c(9, 0), c(9, 1)] }])).toMatchObject({ kind: 'win', winners: [0] })
    expect(showdown([tj, { seat: 1, cards: [c(10, 0), c(10, 1)] }])).toMatchObject({ kind: 'win', winners: [1] })
    // 땡이 없으면 망통
    expect(showdown([tj, { seat: 1, cards: [c(2), c(4)] }])).toMatchObject({ kind: 'win', winners: [1] })
  })
  it('amhaeng catches 13/18 gwangttaeng but not 38', () => {
    const am = { seat: 0, cards: [c(4, 0), c(7, 0)] }
    expect(showdown([am, { seat: 1, cards: [c(1, 0), c(8, 0)] }])).toMatchObject({ winners: [0] })
    expect(showdown([am, { seat: 1, cards: [c(3, 0), c(8, 0)] }])).toMatchObject({ winners: [1] })
  })
  it('gusa forces redeal against weak hands', () => {
    const gusa = { seat: 0, cards: [c(4, 1), c(9, 0)] }
    expect(showdown([gusa, { seat: 1, cards: [c(1), c(2)] }]).kind).toBe('redeal')
    expect(showdown([gusa, { seat: 1, cards: [c(2, 0), c(2, 1)] }])).toMatchObject({ winners: [1] })
    const mg = { seat: 0, cards: [c(4, 0), c(9, 0)] }
    expect(showdown([mg, { seat: 1, cards: [c(10, 0), c(10, 1)] }]).kind).toBe('redeal')
    expect(showdown([mg, { seat: 1, cards: [c(1, 0), c(3, 0)] }])).toMatchObject({ winners: [1] })
  })
})

const mk = (n: number, chips = 1000): SPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true, chips, bet: 0, folded: false, inHand: true, cards: [] }))

describe('seotda betting', () => {
  it('antes and deals one card', () => {
    const t = startHand(mk(3), 0, 0, 1, mulberry32(1))
    expect(t.pot).toBe(3 * ANTE)
    expect(t.players.every((p) => p.cards.length === 1)).toBe(true)
    expect(t.turn).toBe(0)
  })
  it('everyone checks → second card → showdown', () => {
    let t = startHand(mk(3), 0, 0, 1, mulberry32(2))
    for (let k = 0; k < 3; k++) t = applyAction(t, 'call')
    expect(t.phase).toBe('bet2')
    expect(t.players.every((p) => p.cards.length === 2)).toBe(true)
    for (let k = 0; k < 3; k++) t = applyAction(t, 'call')
    expect(t.phase).toBe('showdown')
    expect(t.result).toBeDefined()
  })
  it('raise reopens action; folds end the hand', () => {
    let t = startHand(mk(2), 0, 0, 1, mulberry32(3))
    t = applyAction(t, 'half') // P0 raises
    expect(t.turn).toBe(1)
    t = applyAction(t, 'die')
    expect(t.phase).toBe('showdown')
    expect(t.result).toMatchObject({ kind: 'win', winners: [0] })
    const s = settle(t)
    expect(s.players[0].chips).toBe(1000 + ANTE)
  })
  it('caps bets at the shortest stack and limits raises', () => {
    const ps = mk(2)
    ps[0].chips = 30
    let t = startHand(ps, 1, 0, 1, mulberry32(4))
    expect(betCap(t)).toBe(30)
    t = applyAction(t, 'half')
    expect(t.currentBet).toBeLessThanOrEqual(30)
    let guard = 0
    while (t.phase === 'bet1' && guard++ < 20) t = applyAction(t, legalActions(t, t.turn).includes('half') ? 'half' : 'call')
    expect(t.players.every((p) => p.chips >= 0)).toBe(true)
  })
  it('chips are conserved across random AI hands', () => {
    const rng = mulberry32(9)
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      let players = mk(4, 200)
      let carry = 0
      for (let h = 0; h < 30; h++) {
        let t = startHand(players, h % 4, carry, h, rng)
        if (t.players.filter((p) => p.inHand).length < 2) break
        let guard = 0
        while (t.phase !== 'showdown' && guard++ < 200) t = applyAction(t, aiAction(t, t.turn, diff, rng))
        expect(t.phase).toBe('showdown')
        const s = settle(t)
        players = s.players
        carry = s.carry
        expect(players.reduce((a, p) => a + p.chips, 0) + carry).toBe(800)
      }
    }
  })
  it('AI strength ordering', () => {
    expect(handStrength([c(3, 0), c(8, 0)])).toBeGreaterThan(0.99)
    expect(handStrength([c(2), c(8)])).toBeLessThan(0.15)
  })
  it('strong AI rarely folds a top hand', () => {
    let t = startHand(mk(2), 0, 0, 1, mulberry32(5))
    t = applyAction(applyAction(t, 'call'), 'call')
    t.players[t.turn].cards = [c(3, 0), c(8, 0)]
    for (let k = 0; k < 20; k++) expect(aiAction(t, t.turn, 'hard', mulberry32(k))).not.toBe('die')
  })
})
