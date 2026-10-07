import { describe, expect, it } from 'vitest'
import { parseCards } from './deck'
import { bestHand, compareHands, describeHand, evaluate5, winners } from './poker'

const ev = (s: string) => evaluate5(parseCards(s))
const best = (s: string) => bestHand(parseCards(s))

describe('poker categories', () => {
  it('names every category in Korean', () => {
    expect(ev('AS KD 7H 4C 2S').name).toBe('하이 카드')
    expect(ev('AS AD 7H 4C 2S').name).toBe('원페어')
    expect(ev('AS AD 7H 7C 2S').name).toBe('투페어')
    expect(ev('7S 7D 7H 4C 2S').name).toBe('트리플')
    expect(ev('5S 6D 7H 8C 9S').name).toBe('스트레이트')
    expect(ev('2H 9H JH 4H KH').name).toBe('플러시')
    expect(ev('7S 7D 7H 4C 4S').name).toBe('풀하우스')
    expect(ev('7S 7D 7H 7C 4S').name).toBe('포카드')
    expect(ev('5H 6H 7H 8H 9H').name).toBe('스트레이트 플러시')
    expect(ev('10S JS QS KS AS').name).toBe('로열 스트레이트 플러시')
  })
  it('handles the wheel (A-2-3-4-5) as the lowest straight', () => {
    const wheel = ev('AS 2D 3H 4C 5S')
    expect(wheel.name).toBe('스트레이트')
    expect(wheel.ranks).toEqual([5])
    expect(describeHand(wheel)).toBe('백 스트레이트')
    expect(compareHands(ev('2S 3D 4H 5C 6S'), wheel)).toBeGreaterThan(0)
    expect(ev('QS KD AH 2C 3S').name).toBe('하이 카드') // no wrap-around
  })
  it('orders cards with groups first', () => {
    const h = ev('4C 7S 4S 7D 7H')
    expect(h.cards.map((c) => c.rank)).toEqual([7, 7, 7, 4, 4])
  })
})

describe('poker comparison', () => {
  it('compares by category first', () => {
    expect(compareHands(ev('2H 3H 4H 5H 7H'), ev('AS AD AH KC KS'))).toBeLessThan(0)
  })
  it('breaks ties with kickers', () => {
    expect(compareHands(ev('AS AD 9H 4C 2S'), ev('AH AC 8H 7C 6S'))).toBeGreaterThan(0)
    expect(compareHands(ev('KS KD 2H 2C 9S'), ev('KH KC 3H 3C 2S'))).toBeLessThan(0)
    expect(compareHands(ev('AS KD 7H 4C 2S'), ev('AH KC 7D 4S 2H'))).toBe(0)
  })
  it('full house compares trips first', () => {
    expect(compareHands(ev('3S 3D 3H 2C 2S'), ev('2H 2C 2D AC AS'))).toBeGreaterThan(0)
  })
})

describe('best of 7', () => {
  it('finds a flush hidden in 7 cards', () => {
    const h = best('2H 9H JH 4H KH KS KD')
    expect(h.name).toBe('플러시')
    expect(h.cards).toHaveLength(5)
  })
  it('prefers full house over flush', () => {
    expect(best('2H 9H JH 4H KH KS KD 2S').name).toBe('풀하우스') // also flush, but K K K 2 2 wins
  })
  it('picks the best straight', () => {
    const h = best('4S 5D 6H 7C 8S 9D 2C')
    expect(h.name).toBe('스트레이트')
    expect(h.ranks).toEqual([9])
  })
  it('finds a royal', () => {
    expect(best('10S JS QS KS AS AD AH').name).toBe('로열 스트레이트 플러시')
  })
  it('works with 5 and 6 cards', () => {
    expect(best('AS AD AH KC KS').name).toBe('풀하우스')
    expect(best('AS AD AH KC 2S 2D').name).toBe('풀하우스')
  })
  it('returns all tied winners', () => {
    const board = '2S 3D 8H 9C KS'
    expect(winners([parseCards(`${board} AS AD`), parseCards(`${board} AH AC`), parseCards(`${board} 4C 5C`)])).toEqual(
      [0, 1],
    )
  })
})
