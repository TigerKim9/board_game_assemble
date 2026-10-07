import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { makeCard, parseCards, type Card } from '../../cards/deck'
import {
  BUST_LIMIT,
  advance,
  aiMove,
  attackPower,
  canPlay,
  catchOne,
  declare,
  drawTurn,
  newGame,
  play,
  ranking,
  type OCState,
} from './logic'

const id = (t: string) => parseCards(t)[0].id
const JKB = makeCard('S', 0)
const JKR = makeCard('H', 0)

function setup(hands: Card[][], topCard: Card, extra: Partial<OCState> = {}): OCState {
  const base = newGame(hands.map((_, i) => `P${i}`), [], mulberry32(1))
  return {
    ...base,
    hands,
    pile: parseCards('3C 4C 5C 6C 8C 9C 10C 3D 4D 5D 6D 8D 9D 10D 3H 4H 5H'),
    discard: [topCard],
    suit: topCard.rank === 0 ? null : topCard.suit,
    turn: 0,
    dir: 1,
    attack: 0,
    log: [],
    ...extra,
  }
}

describe('onecard deal', () => {
  it('deals 7 cards (6 for 5+ players) and flips a non-joker', () => {
    const s = newGame(['a', 'b', 'c'], [0], mulberry32(3))
    expect(s.hands.every((h) => h.length === 7)).toBe(true)
    expect(s.discard[0].rank).not.toBe(0)
    expect(s.pile.length + 21 + 1).toBe(54)
    const s6 = newGame(['a', 'b', 'c', 'd', 'e', 'f'], [0], mulberry32(3))
    expect(s6.hands[0].length).toBe(6)
  })
})

describe('onecard matching', () => {
  it('matches suit or rank, jokers anywhere', () => {
    const s = setup([parseCards('5H 9S 9D'), parseCards('3C')], parseCards('9H')[0])
    const [h5, s9, d9] = s.hands[0]
    expect(canPlay(s, h5)).toBe(true)
    expect(canPlay(s, s9)).toBe(true)
    expect(canPlay(s, d9)).toBe(true)
    expect(canPlay(s, parseCards('4C')[0])).toBe(false)
    expect(canPlay(s, JKB)).toBe(true)
  })
  it('after a joker anything goes', () => {
    const s = setup([parseCards('4C')], JKR)
    expect(canPlay(s, s.hands[0][0])).toBe(true)
  })
})

describe('onecard attacks', () => {
  it('attack power values', () => {
    expect(attackPower(parseCards('2H')[0])).toBe(2)
    expect(attackPower(parseCards('AH')[0])).toBe(3)
    expect(attackPower(parseCards('AS')[0])).toBe(5)
    expect(attackPower(JKB)).toBe(5)
    expect(attackPower(JKR)).toBe(7)
    expect(attackPower(parseCards('KH')[0])).toBe(0)
  })
  it('defence needs equal or stronger attack card matching suit or rank', () => {
    const s = setup([parseCards('2H AH 2C AC 5H'), []], parseCards('AH')[0], { attack: 3 })
    const t = { ...s, discard: parseCards('AD') }
    const [h2, hA, c2, cA, h5] = s.hands[0]
    expect(canPlay(t, h2)).toBe(false) // weaker
    expect(canPlay(t, hA)).toBe(true) // rank match, equal
    expect(canPlay(t, c2)).toBe(false)
    expect(canPlay(t, cA)).toBe(true)
    expect(canPlay(t, h5)).toBe(false)
    expect(canPlay(t, JKB)).toBe(true)
    const on2 = { ...s, attack: 2, discard: parseCards('2H') }
    expect(canPlay(on2, hA)).toBe(true) // suit match, stronger
    expect(canPlay(on2, c2)).toBe(true) // rank match
    expect(canPlay(on2, cA)).toBe(false) // nothing matches
  })
  it('only the colour joker beats the black joker', () => {
    const s = setup([[JKR, parseCards('AS')[0]], []], JKB, { attack: 5 })
    expect(canPlay(s, JKR)).toBe(true)
    expect(canPlay(s, s.hands[0][1])).toBe(false)
    const s2 = { ...s, discard: [JKR], attack: 7 }
    expect(canPlay(s2, JKB)).toBe(false)
  })
  it('attacks stack and the victim takes them all', () => {
    let s = setup([parseCards('2H 5D 6D'), parseCards('2C 8S'), parseCards('9S 9C')], parseCards('7H')[0])
    s = play(s, 0, id('2H'))
    expect(s.attack).toBe(2)
    expect(s.turn).toBe(1)
    s = play(s, 1, id('2C'))
    expect(s.attack).toBe(4)
    expect(s.turn).toBe(2)
    s = drawTurn(s, 2)
    expect(s.hands[2].length).toBe(6)
    expect(s.attack).toBe(0)
    expect(s.turn).toBe(0)
  })
})

describe('onecard specials', () => {
  it('J skips, Q reverses, K plays again, 7 changes suit', () => {
    let s = setup([parseCards('JH 5D 6D'), parseCards('8S 8D'), parseCards('9S 9C')], parseCards('3H')[0])
    s = play(s, 0, id('JH'))
    expect(s.turn).toBe(2)
    s = setup([parseCards('QH 5D 6D'), parseCards('8S 8D'), parseCards('9S 9C')], parseCards('3H')[0])
    s = play(s, 0, id('QH'))
    expect(s.dir).toBe(-1)
    expect(s.turn).toBe(2)
    s = setup([parseCards('KH 5D 6D'), parseCards('8S 8D')], parseCards('3H')[0])
    s = play(s, 0, id('KH'))
    expect(s.turn).toBe(0)
    s = setup([parseCards('7H 5D 6D'), parseCards('8S 8D')], parseCards('3H')[0])
    s = play(s, 0, id('7H'), 'C')
    expect(s.suit).toBe('C')
    expect(canPlay(s, parseCards('2C')[0])).toBe(true)
    expect(canPlay(s, parseCards('2H')[0])).toBe(false)
  })
  it('rejects illegal plays and out-of-turn plays', () => {
    const s = setup([parseCards('5D 6D'), parseCards('8S')], parseCards('3H')[0])
    expect(play(s, 0, id('5D'))).toBe(s)
    expect(play(s, 1, id('8S'))).toBe(s)
  })
})

describe('onecard declaring', () => {
  it('leaving one card undeclared makes you vulnerable; a catch costs 1 card', () => {
    let s = setup([parseCards('5H 6H'), parseCards('8S 8D 4S')], parseCards('3H')[0])
    s = play(s, 0, id('5H'))
    expect(s.vulnerable).toBe(0)
    s = catchOne(s, 1)
    expect(s.hands[0].length).toBe(2)
    expect(s.vulnerable).toBe(null)
  })
  it('declaring in time (before or after) is safe', () => {
    let s = setup([parseCards('5H 6H'), parseCards('8S 8D 4S')], parseCards('3H')[0])
    s = declare(s, 0)
    expect(s.predeclared[0]).toBe(true)
    s = play(s, 0, id('5H'))
    expect(s.vulnerable).toBe(null)
    let t = setup([parseCards('5H 6H'), parseCards('8S 8D 4S')], parseCards('3H')[0])
    t = play(t, 0, id('5H'))
    t = declare(t, 0)
    expect(t.vulnerable).toBe(null)
    expect(catchOne(t, 1)).toBe(t)
  })
})

describe('onecard ending', () => {
  it('first to empty finishes; game ends when one player remains', () => {
    let s = setup([parseCards('5H'), parseCards('8S 8D')], parseCards('3H')[0])
    s = play(s, 0, id('5H'))
    expect(s.done).toEqual([0])
    expect(s.over).toBe(true)
    expect(ranking(s)).toEqual([0, 1])
  })
  it('ends early when every watched (human) seat is finished', () => {
    let s = setup([parseCards('5H'), parseCards('8S 8D'), parseCards('8C')], parseCards('3H')[0], { watch: [0] })
    s = play(s, 0, id('5H'))
    expect(s.over).toBe(true)
    expect(ranking(s)).toEqual([0, 2, 1])
  })
  it('busts at the hand limit', () => {
    const big = parseCards('3S 4S 5S 6S 8S 9S 10S 3C 4C 5C 6C 8C 9C 10C 3D 4D 5D 6D')
    let s = setup([big, parseCards('8H'), parseCards('9H')], parseCards('2H')[0], { attack: 2 })
    s = drawTurn(s, 0)
    expect(s.busted).toEqual([0])
    expect(s.hands[0]).toEqual([])
    expect(big.length + 2).toBeGreaterThanOrEqual(BUST_LIMIT)
    expect(s.turn).toBe(1)
  })
  it('advance skips finished players', () => {
    const s = setup([[], [], [], []], parseCards('3H')[0], { done: [1] })
    expect(advance(s, 0, 1)).toBe(2)
    expect(advance(s, 2, -1)).toBe(0)
  })
})

describe('onecard AI', () => {
  it('defends with the weakest card that works', () => {
    const s = setup([[JKR, ...parseCards('2H AH')], parseCards('3C')], parseCards('2D')[0], { attack: 2 })
    const m = aiMove(s, 0, 'hard', mulberry32(2))
    expect(m).toMatchObject({ type: 'play', cardId: 'H2' })
  })
  it('draws when nothing is playable', () => {
    const s = setup([parseCards('4C 5C'), parseCards('3C')], parseCards('9H')[0])
    expect(aiMove(s, 0, 'normal').type).toBe('draw')
  })
  it('attacks a player about to win', () => {
    const s = setup([parseCards('2H 5H 6H'), parseCards('3C')], parseCards('9H')[0])
    const m = aiMove(s, 0, 'hard', mulberry32(5))
    expect(m).toMatchObject({ type: 'play', cardId: 'H2' })
  })
  it('AI-only games always finish', () => {
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 15; seed++) {
        const rng = mulberry32(seed)
        let s = newGame(['a', 'b', 'c', 'd', 'e'], [], rng)
        let steps = 0
        while (!s.over && steps < 3000) {
          const m = aiMove(s, s.turn, diff, rng)
          s = m.type === 'draw' ? drawTurn(s, s.turn, rng) : play(s, s.turn, m.cardId, m.suit, m.declare)
          steps++
        }
        expect(s.over).toBe(true)
        const total = s.hands.flat().length + s.pile.length + s.discard.length
        expect(total).toBe(54)
      }
    }
  })
})
