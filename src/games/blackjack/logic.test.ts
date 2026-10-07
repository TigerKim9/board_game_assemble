import { describe, expect, it } from 'vitest'
import { parseCard, parseCards } from '../../cards/deck'
import {
  act,
  aiAction,
  aiBet,
  basicStrategy,
  canDouble,
  canSplit,
  dealerShouldHit,
  dealerStep,
  dealStep,
  handValue,
  isBlackjack,
  legalActions,
  newHand,
  newShoe,
  newTable,
  nextRound,
  seatNet,
  settle,
  startRound,
  totalLabel,
  type Table,
} from './logic'

const h = (s: string, bet = 100, split = false) => newHand(bet, parseCards(s), split)
const bs = (cards: string, up: string, canDouble = true, canSplit = true) =>
  basicStrategy(parseCards(cards), parseCard(up), { canDouble, canSplit })

describe('blackjack values', () => {
  it('counts aces as 1 or 11', () => {
    expect(handValue(parseCards('AS 6H'))).toEqual({ total: 17, soft: true })
    expect(handValue(parseCards('AS 6H 9D'))).toEqual({
      total: 16,
      soft: false,
    })
    expect(handValue(parseCards('AS AH 9D'))).toEqual({
      total: 21,
      soft: true,
    })
    expect(handValue(parseCards('KS QH'))).toEqual({ total: 20, soft: false })
    expect(totalLabel(parseCards('AS 6H'))).toBe('7/17')
  })
  it('recognises blackjack, but not after a split', () => {
    expect(isBlackjack(h('AS KD'))).toBe(true)
    expect(isBlackjack(h('AS KD', 100, true))).toBe(false)
    expect(isBlackjack(h('AS 5D 5C'))).toBe(false)
  })
  it('uses a 6-deck shoe', () => {
    expect(newShoe()).toHaveLength(312)
  })
})

describe('dealer', () => {
  it('stands on soft 17', () => {
    expect(dealerShouldHit(parseCards('AS 6H'))).toBe(false)
    expect(dealerShouldHit(parseCards('10S 6H'))).toBe(true)
    expect(dealerShouldHit(parseCards('10S 7H'))).toBe(false)
  })
})

describe('settlement', () => {
  it('pays blackjack 3:2', () => {
    expect(settle(h('AS KD'), parseCards('10S 9H'))).toEqual({
      outcome: 'blackjack',
      payout: 250,
    })
    expect(settle(h('AS KD', 10), parseCards('10S 9H')).payout).toBe(25)
  })
  it('pushes blackjack vs blackjack and loses to dealer blackjack', () => {
    expect(settle(h('AS KD'), parseCards('AH QS')).outcome).toBe('push')
    expect(settle(h('10S QD AH', 100), parseCards('AH QS'))).toEqual({
      outcome: 'lose',
      payout: 0,
    })
  })
  it('player bust loses even if dealer busts', () => {
    expect(settle(h('10S QD 5H'), parseCards('10H 6S 9C')).outcome).toBe('bust')
  })
  it('wins, pushes and loses normally', () => {
    expect(settle(h('10S 9D'), parseCards('10H 8S'))).toEqual({
      outcome: 'win',
      payout: 200,
    })
    expect(settle(h('10S 8D'), parseCards('10H 8S'))).toEqual({
      outcome: 'push',
      payout: 100,
    })
    expect(settle(h('10S 7D'), parseCards('10H 8S')).outcome).toBe('lose')
    expect(settle(h('10S 2D'), parseCards('10H 6S 9C')).outcome).toBe('win')
  })
})

describe('split / double', () => {
  it('allows split of equal values and limited hands', () => {
    expect(canSplit(h('8S 8D'), 1000, 1)).toBe(true)
    expect(canSplit(h('KS QD'), 1000, 1)).toBe(true)
    expect(canSplit(h('8S 9D'), 1000, 1)).toBe(false)
    expect(canSplit(h('8S 8D'), 50, 1)).toBe(false)
    expect(canSplit(h('8S 8D'), 1000, 4)).toBe(false)
  })
  it('doubles only on two cards with enough chips', () => {
    expect(canDouble(h('5S 6D'), 100)).toBe(true)
    expect(canDouble(h('5S 6D'), 99)).toBe(false)
    expect(canDouble(h('5S 2D 4C'), 1000)).toBe(false)
  })
})

describe('basic strategy', () => {
  it('splits aces and eights, never tens or fives', () => {
    expect(bs('AS AD', '10H')).toBe('split')
    expect(bs('8S 8D', 'AH')).toBe('split')
    expect(bs('10S KD', '6H')).toBe('stand')
    expect(bs('5S 5D', '6H')).toBe('double')
  })
  it('plays hard totals', () => {
    expect(bs('10S 6D', '6H')).toBe('stand')
    expect(bs('10S 6D', '7H')).toBe('hit')
    expect(bs('10S 2D', '3H')).toBe('hit')
    expect(bs('10S 2D', '4H')).toBe('stand')
    expect(bs('6S 5D', '10H')).toBe('double')
    expect(bs('6S 5D', 'AH')).toBe('hit')
    expect(bs('6S 5D', '10H', false)).toBe('hit')
    expect(bs('10S 7D', 'AH')).toBe('stand')
  })
  it('plays soft totals', () => {
    expect(bs('AS 7D', '5H')).toBe('double')
    expect(bs('AS 7D', '5H', false)).toBe('stand')
    expect(bs('AS 7D', '9H')).toBe('hit')
    expect(bs('AS 7D', '7H')).toBe('stand')
    expect(bs('AS 2D', '4H')).toBe('hit')
    expect(bs('AS 8D', '6H')).toBe('double')
  })
  it('bets sensibly', () => {
    expect(aiBet(1000)).toBe(50)
    expect(aiBet(15)).toBe(10)
    expect(aiBet(100000)).toBe(200)
  })
})

describe('table flow', () => {
  const stacked = (order: string, rest = 200) => {
    const t = newTable([
      { name: '나', isAI: false, chips: 1000 },
      { name: '컴퓨터 A', isAI: true, chips: 1000 },
    ])
    // pad the shoe so no reshuffle happens
    t.shoe = [...parseCards(order), ...newShoe().slice(0, rest)]
    t.seats[0].bet = 100
    return t
  }
  const dealAll = (t: Table) => {
    t = startRound(t)
    while (t.phase === 'dealing') t = dealStep(t)
    return t
  }
  it('deals two cards each and plays a simple round', () => {
    // order: me, AI, dealer, me, AI, dealer(hole)
    let t = dealAll(stacked('10S 9H 7D 8C 8H 10C KD 5S'))
    expect(t.seats[0].chips).toBe(900)
    expect(t.seats[0].hands[0].cards).toHaveLength(2)
    expect(t.phase).toBe('play')
    expect(t.turn).toEqual({ seat: 0, hand: 0 })
    t = act(t, 'stand') // 18
    expect(t.turn).toEqual({ seat: 1, hand: 0 })
    while (t.phase === 'play') t = act(t, aiAction(t)) // AI 17 vs 7 → stand
    expect(t.phase).toBe('dealer')
    while (t.phase === 'dealer') t = dealerStep(t) // dealer 17 → 7+10=17 stands
    expect(t.phase).toBe('done')
    expect(t.seats[0].hands[0].outcome).toBe('win')
    expect(t.seats[0].chips).toBe(1100)
    expect(seatNet(t.seats[0])).toBe(100)
    const n = nextRound(t)
    expect(n.phase).toBe('bet')
    expect(n.seats[0].bet).toBe(100)
  })
  it('settles immediately on dealer blackjack', () => {
    const t = dealAll(stacked('10S 9H AD 8C 8H KC'))
    expect(t.phase).toBe('done')
    expect(t.seats[0].hands[0].outcome).toBe('lose')
    expect(t.seats[0].chips).toBe(900)
  })
  it('splits and doubles with correct chip accounting', () => {
    let t = dealAll(stacked('8S 9H 6D 8C 8H 10C 3S 2D 10H'))
    expect(legalActions(t)).toContain('split')
    t = act(t, 'split')
    expect(t.seats[0].hands).toHaveLength(2)
    expect(t.seats[0].chips).toBe(800)
    // first split hand 8♠+3♠ = 11 → double
    t = act(t, 'double')
    expect(t.seats[0].hands[0].bet).toBe(200)
    expect(t.seats[0].chips).toBe(700)
    expect(t.turn).toEqual({ seat: 0, hand: 1 })
  })
  it('pays a natural 3:2 and skips the turn', () => {
    const t = dealAll(stacked('AS 9H 7D KC 8H 10C'))
    expect(t.seats[0].hands[0].done).toBe(true)
    expect(t.turn?.seat).toBe(1)
  })
})
