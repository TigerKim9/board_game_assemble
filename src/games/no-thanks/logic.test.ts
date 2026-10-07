import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiShouldTake, cardPoints, isOver, newGame, pass, runs, score, scores, startingChips, take, type NTState } from './logic'

describe('no-thanks rules', () => {
  it('deals 24 cards with 9 removed', () => {
    const s = newGame(4, mulberry32(1))
    expect(s.deck.length + 1).toBe(24)
    expect(s.removed.length).toBe(9)
    expect(new Set([...s.deck, s.card, ...s.removed]).size).toBe(33)
    expect(s.chips).toEqual([11, 11, 11, 11])
  })
  it('gives fewer chips to big groups', () => {
    expect(startingChips(5)).toBe(11)
    expect(startingChips(6)).toBe(9)
    expect(startingChips(7)).toBe(7)
  })
  it('scores lowest card of each run minus chips', () => {
    expect(cardPoints([20, 21, 22, 30, 5])).toBe(55)
    expect(cardPoints([])).toBe(0)
    expect(score([10, 11], 4)).toBe(6)
    expect(runs([7, 5, 6, 10])).toEqual([[5, 6, 7], [10]])
  })
  it('pass moves a chip to the pot and turn advances', () => {
    const s = newGame(3, mulberry32(2))
    const p = pass(s)
    expect(p.pot).toBe(1)
    expect(p.chips[0]).toBe(10)
    expect(p.turn).toBe(1)
  })
  it('cannot pass without chips', () => {
    const s: NTState = { ...newGame(3, mulberry32(3)), chips: [0, 5, 5] }
    expect(pass(s)).toBe(s)
  })
  it('take gives card and pot and keeps the turn', () => {
    let s = newGame(3, mulberry32(4))
    s = pass(pass(s))
    const card = s.card
    const t = take(s)
    expect(t.turn).toBe(2)
    expect(t.hands[2]).toEqual([card])
    expect(t.chips[2]).toBe(11 + 2)
    expect(t.pot).toBe(0)
  })
  it('game ends when deck runs out', () => {
    let s = newGame(3, mulberry32(5))
    let guard = 0
    while (!isOver(s) && guard++ < 1000) s = take(s)
    expect(isOver(s)).toBe(true)
    expect(s.hands[0].length).toBe(24)
    expect(scores(s)[1]).toBe(-11)
  })
})

describe('no-thanks AI', () => {
  const base = (over: Partial<NTState>): NTState => ({ ...newGame(4, mulberry32(9)), ...over })
  it('must take when out of chips', () => {
    expect(aiShouldTake(base({ card: 35, chips: [0, 5, 5, 5] }), 'normal')).toBe(true)
  })
  it('passes on a big lonely card with an empty pot', () => {
    expect(aiShouldTake(base({ card: 33, pot: 0, hands: [[5], [], [], []] }), 'hard')).toBe(false)
    expect(aiShouldTake(base({ card: 33, pot: 0, hands: [[5], [], [], []] }), 'normal', () => 0.5)).toBe(false)
  })
  it('takes a card extending its run when others want it too', () => {
    const s = base({ card: 21, pot: 0, hands: [[20], [22], [], []] })
    expect(aiShouldTake(s, 'hard')).toBe(true)
  })
  it('takes when the pot pays for the card', () => {
    expect(aiShouldTake(base({ card: 12, pot: 11, hands: [[], [], [], []] }), 'hard')).toBe(true)
  })
  it('a full AI game terminates', () => {
    const rng = mulberry32(11)
    let s = newGame(5, rng)
    let steps = 0
    while (!isOver(s) && steps++ < 5000) s = aiShouldTake(s, 'hard', rng) ? take(s) : pass(s)
    expect(isOver(s)).toBe(true)
    const total = s.chips.reduce((a, b) => a + b, 0)
    expect(total).toBe(55)
  })
})
