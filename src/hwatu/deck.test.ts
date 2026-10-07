import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../lib/random'
import {
  CARDS,
  CHEONGDAN_IDS,
  CHODAN_IDS,
  GODORI_IDS,
  GWANG_IDS,
  HONGDAN_IDS,
  cardsOfMonth,
  getCard,
  groupByKind,
  isDoublePi,
  monthOf,
  newDeck,
  newDeckIds,
  piCount,
  sameMonth,
} from './deck'

describe('hwatu deck', () => {
  it('has 48 cards, 4 per month, id = (month-1)*4+slot', () => {
    expect(CARDS).toHaveLength(48)
    for (let m = 1; m <= 12; m++) expect(cardsOfMonth(m as 1)).toHaveLength(4)
    CARDS.forEach((c, i) => {
      expect(c.id).toBe(i)
      expect(monthOf(c.id)).toBe(c.month)
      expect(c.id).toBe((c.month - 1) * 4 + c.slot)
    })
  })
  it('has the standard composition', () => {
    const g = groupByKind(CARDS)
    expect(g.gwang).toHaveLength(5)
    expect(g.yeol).toHaveLength(9)
    expect(g.tti).toHaveLength(10)
    expect(g.pi).toHaveLength(24)
    expect(piCount(CARDS)).toBe(26)
    expect(GWANG_IDS.map(monthOf)).toEqual([1, 3, 8, 11, 12])
    expect(GODORI_IDS.map(monthOf)).toEqual([2, 4, 8])
    expect(HONGDAN_IDS.map(monthOf)).toEqual([1, 2, 3])
    expect(CHEONGDAN_IDS.map(monthOf)).toEqual([6, 9, 10])
    expect(CHODAN_IDS.map(monthOf)).toEqual([4, 5, 7])
  })
  it('marks special cards', () => {
    expect(getCard(44).isBiGwang).toBe(true)
    expect(getCard(44).label).toBe('12월 비광')
    expect(getCard(0).isBiGwang).toBe(false)
    expect(isDoublePi(41)).toBe(true) // 11월 쌍피
    expect(isDoublePi(47)).toBe(true) // 12월 쌍피
    expect(isDoublePi(42)).toBe(false)
    expect(getCard(32).isGukjin).toBe(true)
    expect(getCard(46).ribbon).toBe('plain')
    expect(piCount([32, 34], { gukjinAsPi: true })).toBe(3)
    expect(piCount([32, 34])).toBe(1)
    expect(sameMonth(0, 3)).toBe(true)
    expect(sameMonth(3, 4)).toBe(false)
  })
  it('shuffles deterministically with a seed', () => {
    const a = newDeckIds(mulberry32(1))
    expect(a.slice().sort((x, y) => x - y)).toEqual(CARDS.map((c) => c.id))
    expect(newDeckIds(mulberry32(1))).toEqual(a)
    expect(newDeck(mulberry32(2))).toHaveLength(48)
  })
  it('throws on bad id', () => {
    expect(() => getCard(48)).toThrow()
  })
})
