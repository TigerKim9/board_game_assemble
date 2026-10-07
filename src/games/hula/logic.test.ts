import { describe, expect, it } from 'vitest'
import { parseCards } from '../../cards'
import { mulberry32 } from '../../lib/random'
import type { Difficulty } from '../../lib/types'
import {
  aiAction,
  aiWantsThankYou,
  applyHula,
  attach,
  bestPartition,
  canTakeDiscard,
  canUseCard,
  claimThankYou,
  discardCard,
  drawCard,
  handPoints,
  isGameOver,
  isValidMeld,
  newGame,
  nextRound,
  passThankYou,
  register,
  takeDiscard,
  type HulaState,
} from './logic'

const P = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }))
const cs = parseCards
const I = (x: string) => cs(x).map((c) => c.id)
const i1 = (x: string) => cs(x)[0].id

/** 손패·더미를 직접 정한 상태 */
function rig(hands: string[], discardTop: string, deck = '2C 3C 4C 5C 6C 8C 9C TC'): HulaState {
  const s = newGame(P(hands.length), 3, 0, mulberry32(1))
  return { ...s, hands: hands.map(cs), discard: cs(discardTop), deck: cs(deck), melds: [], registered: hands.map(() => false) }
}

describe('melds', () => {
  it('validates runs, sets and sevens', () => {
    expect(isValidMeld(cs('3H 4H 5H'))).toBe(true)
    expect(isValidMeld(cs('AH 2H 3H'))).toBe(true)
    expect(isValidMeld(cs('QH KH AH'))).toBe(false) // A는 1로만
    expect(isValidMeld(cs('3H 4H 6H'))).toBe(false)
    expect(isValidMeld(cs('3H 4D 5H'))).toBe(false)
    expect(isValidMeld(cs('9H 9D 9S'))).toBe(true)
    expect(isValidMeld(cs('9H 9D 9S 9C'))).toBe(true)
    expect(isValidMeld(cs('9H 9D'))).toBe(false)
    expect(isValidMeld(cs('7H'))).toBe(true)
    expect(isValidMeld(cs('7H 7S'))).toBe(true)
    expect(isValidMeld(cs('7H 8H'))).toBe(true)
    expect(isValidMeld(cs('6H 7H'))).toBe(true)
    expect(isValidMeld(cs('8H 9H'))).toBe(false)
    expect(isValidMeld(cs('7H 8D'))).toBe(false)
  })

  it('best partition lays down the most points', () => {
    const hand = cs('9H 9D 9S 7C 2H 3H 4H KD')
    const part = bestPartition(hand)
    const used = part.flat().map((i) => hand[i].id).sort()
    expect(used).toEqual(I('2H 3H 4H 7C 9D 9H 9S').sort())
  })

  it('canUseCard: new meld with the card, or attach once registered', () => {
    const melds = [{ id: 1, owner: 1, cards: cs('5S 6S 7S') }]
    expect(canUseCard(cs('KH KD 2C'), cs('KS')[0], false, melds)).toBe(true)
    expect(canUseCard(cs('KH 2D 2C'), cs('8S')[0], false, melds)).toBe(false)
    expect(canUseCard(cs('KH 2D 2C'), cs('8S')[0], true, melds)).toBe(true)
    expect(canUseCard(cs('KH 2D 2C'), cs('7D')[0], false, [])).toBe(true) // 7은 혼자서도
  })
})

describe('turn flow', () => {
  it('deals 7 each and flips one discard', () => {
    const s = newGame(P(4), 3, 2, mulberry32(2))
    expect(s.hands.every((h) => h.length === 7)).toBe(true)
    expect(s.discard.length).toBe(1)
    expect(s.deck.length).toBe(52 - 28 - 1)
    expect(s.turn).toBe(2)
    expect(s.round).toBe(1)
  })

  it('discard can only be taken when it can be used right away, and must be used', () => {
    let s = rig(['QH QD 2C 3D 5S 9C JD', 'AS 2S 3S 4D 5D 6D 8H'], 'KH')
    expect(canTakeDiscard(s)).toBe(false)
    s = rig(['QH QD 2C 3D 5S 9C JD', 'AS 2S 3S 4D 5D 6D 8H'], 'QS')
    expect(canTakeDiscard(s)).toBe(true)
    s = takeDiscard(s)
    expect(s.mustUse).toBe(i1('QS'))
    expect(discardCard(s, i1('2C'))).toBe(s) // 아직 써야 함
    s = register(s, I('QH QD QS'))
    expect(s.mustUse).toBeNull()
    expect(s.registered[0]).toBe(true)
    s = discardCard(s, i1('2C'))
    expect(s.phase).toBe('draw')
    expect(s.turn).toBe(1)
  })

  it('attach only after registering', () => {
    let s = rig(['7H 8H 2C 3D 5S 9C JD', 'AS 2S 3S 4D 5D 6D 8D'], 'KC')
    s = { ...s, melds: [{ id: 9, owner: 1, cards: cs('4C 5C 6C') }] }
    s = drawCard(s) // 2C 뽑음
    expect(attach(s, i1('3D'), 9)).toBe(s)
    s = register(s, I('7H 8H'))
    expect(s.registered[0]).toBe(true)
    s = { ...s, hands: [[...s.hands[0], ...cs('3C')], s.hands[1]] }
    s = attach(s, i1('3C'), 9)
    expect(s.melds.find((m) => m.id === 9)!.cards.map((c) => c.id)).toEqual(I('3C 4C 5C 6C'))
  })

  it('going out in one turn without prior registration is 훌라 (double penalty)', () => {
    let s = rig(['3H 4H 5H 9S 9D 9C', 'KS KD 2S 4D 5D 6D 8H'], 'JC', 'TH')
    s = drawCard(s) // TH
    s = register(s, I('3H 4H 5H'))
    s = register(s, I('9S 9D 9C'))
    s = discardCard(s, i1('TH'))
    expect(s.phase).toBe('roundEnd')
    expect(s.result!.hula).toBe(true)
    expect(s.result!.winner).toBe(0)
    const pts = handPoints(cs('KS KD 2S 4D 5D 6D 8H'))
    expect(s.result!.penalties).toEqual([0, pts * 2])
    expect(s.scores).toEqual([0, pts * 2])
  })

  it('going out after an earlier registration is a normal win', () => {
    let s = rig(['3H 4H 5H 9S', 'KS 2D'], 'JC', 'TH 2H')
    s = drawCard(s)
    s = register(s, I('3H 4H 5H'))
    s = discardCard(s, i1('TH'))
    s = { ...s, turn: 0, phase: 'draw' }
    s = drawCard(s) // 2H
    s = attach(s, i1('2H'), s.melds[0].id)
    s = discardCard(s, i1('9S'))
    expect(s.result!.hula).toBe(false)
    expect(s.result!.penalties).toEqual([0, 15])
  })

  it('empty deck → stop: lowest hand wins', () => {
    let s = rig(['KH QD', 'AS 2S', 'TD 3C'], 'JC', '')
    s = drawCard(s)
    expect(s.phase).toBe('roundEnd')
    expect(s.result!.reason).toBe('stop')
    expect(s.result!.winners).toEqual([1])
    expect(s.result!.penalties).toEqual([25, 0, 13])
  })
})

describe('땡큐', () => {
  it('offers the discard to non-next players who can use it, in turn order', () => {
    // P0 버림 → P1은 다음 사람(제외), P2·P3 후보
    let s = rig(['QS 2C 3D 5S 9C JD AH', 'KH 2D 4S 6C 8C TS JH', '4D 5H QH QD 6S 9D 2S', 'JS KS 4C 8D 9H TH KC'], 'AC', 'KD')
    s = drawCard(s) // KD
    s = discardCard(s, i1('QS'))
    expect(s.phase).toBe('thankyou')
    expect(s.thankQueue).toEqual([2, 3])
    s = passThankYou(s)
    expect(s.thankQueue).toEqual([3])
    s = claimThankYou(s, 3)
    expect(s.turn).toBe(3)
    expect(s.mustUse).toBe(i1('QS'))
    s = register(s, I('JS QS KS'))
    expect(s.melds.length).toBe(1)
    expect(s.registered[3]).toBe(true)
  })

  it('claimer continues the turn and play passes to their left', () => {
    let s = rig(['QS 2C 3D 5S 9C JD AH', 'KH 2D 4S 6C 8C TS JH', '4D 5H QH QD 6S 9D 2S', '3S 4C 8D 9H TH KC AD'], 'AC', 'KD')
    s = drawCard(s)
    s = discardCard(s, i1('QS'))
    expect(s.thankQueue).toEqual([2])
    s = claimThankYou(s, 2)
    s = register(s, I('QH QD QS'))
    s = discardCard(s, i1('2S'))
    expect(s.turn === 3 || s.phase === 'thankyou').toBe(true)
    if (s.phase === 'thankyou') s = passThankYou(s)
    expect(s.turn).toBe(3)
  })

  it('passing on everyone gives the turn to the player after the discarder', () => {
    let s = rig(['QS 2C 3D 5S 9C JD AH', 'KH 2D 4S 6C 8C TS JH', '4D 5H QH QD 6S 9D 2S'], 'AC', 'KD')
    s = drawCard(s)
    s = discardCard(s, i1('QS'))
    expect(s.thankQueue).toEqual([2])
    s = passThankYou(s)
    expect(s.phase).toBe('draw')
    expect(s.turn).toBe(1)
  })
})

describe('AI', () => {
  const play = (s: HulaState, d: Difficulty, rng: () => number) => {
    let guard = 0
    while (s.phase !== 'roundEnd' && guard++ < 2000) {
      if (s.phase === 'thankyou') {
        const seat = s.thankQueue[0]
        s = aiWantsThankYou(s, seat, d, rng) ? claimThankYou(s, seat) : passThankYou(s)
        continue
      }
      const before = s
      s = applyHula(s, aiAction(s, d, rng))
      expect(s).not.toBe(before) // AI 행동은 항상 유효
    }
    expect(guard).toBeLessThan(2000)
    return s
  }

  it('AI-only games finish every round and keep 52 cards in play', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (const n of [2, 3, 4]) {
        const rng = mulberry32(n * 17 + d.length)
        let s = newGame(P(n), 3, 0, rng)
        for (;;) {
          s = play(s, d, rng)
          const total = s.hands.flat().length + s.deck.length + s.discard.length + s.melds.reduce((a, m) => a + m.cards.length, 0)
          expect(total).toBe(52)
          if (isGameOver(s)) break
          s = nextRound(s, rng)
        }
        expect(s.round).toBe(3)
      }
    }
  })

  it('AI takes a discard that completes a set and lays it down', () => {
    const s = rig(['QH QD 2C 3D 5S 9C JD', 'AS 2S 3S 4D 5D 6D 8H'], 'QS')
    const a = aiAction(s, 'hard', mulberry32(3))
    expect(a.type).toBe('take')
    const t = takeDiscard(s)
    const b = aiAction(t, 'hard', mulberry32(3))
    expect(b).toEqual({ type: 'register', ids: expect.arrayContaining(I('QH QD QS')) })
  })

  it('AI goes out when it can', () => {
    let s = rig(['3H 4H 5H 9S 9D 9C', 'KS KD 2S 4D 5D 6D 8H'], 'JC', 'TH')
    s = play({ ...s, players: s.players }, 'normal', mulberry32(4))
    expect(s.result!.winner).toBe(0)
  })

  it('hard AI beats easy AI on average', () => {
    const rng = mulberry32(5)
    let hard = 0
    let easy = 0
    for (let g = 0; g < 30; g++) {
      let s = newGame(P(2), 1, g % 2, rng)
      let guard = 0
      while (s.phase !== 'roundEnd' && guard++ < 2000) {
        const d: Difficulty = (s.phase === 'thankyou' ? s.thankQueue[0] : s.turn) === 0 ? 'hard' : 'easy'
        if (s.phase === 'thankyou') s = passThankYou(s)
        else s = applyHula(s, aiAction(s, d, rng))
      }
      hard += s.scores[0]
      easy += s.scores[1]
    }
    expect(hard).toBeLessThan(easy)
  })
})


