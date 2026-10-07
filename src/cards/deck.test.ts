import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../lib/random'
import { cardLabel, cardNameKo, createDeck, deal, parseCard, rankValue, shuffleDeck, sortCards } from './deck'

describe('deck', () => {
  it('creates 52 unique cards', () => {
    const d = createDeck()
    expect(d).toHaveLength(52)
    expect(new Set(d.map((c) => c.id)).size).toBe(52)
  })
  it('supports multiple decks, jokers and suit restrictions with unique ids', () => {
    const d = createDeck({ decks: 6, jokers: 2 })
    expect(d).toHaveLength(6 * 54)
    expect(new Set(d.map((c) => c.id)).size).toBe(d.length)
    const spider = createDeck({ decks: 2, suits: ['S'] })
    expect(spider).toHaveLength(104)
    expect(spider.every((c) => c.suit === 'S')).toBe(true)
    expect(new Set(spider.map((c) => c.id)).size).toBe(104)
  })
  it('shuffles reproducibly with a seed', () => {
    const a = shuffleDeck(createDeck(), mulberry32(7)).map((c) => c.id)
    const b = shuffleDeck(createDeck(), mulberry32(7)).map((c) => c.id)
    expect(a).toEqual(b)
    expect(a).not.toEqual(createDeck().map((c) => c.id))
  })
  it('deals round-robin', () => {
    const { hands, rest } = deal(createDeck(), 4, 5)
    expect(hands.map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(hands[1][0].id).toBe('S2')
    expect(rest).toHaveLength(32)
  })
  it('labels and parses', () => {
    expect(cardLabel(parseCard('AS'))).toBe('♠A')
    expect(cardNameKo(parseCard('10h'))).toBe('하트 10')
    expect(parseCard('TD').rank).toBe(10)
    expect(rankValue(1, true)).toBe(14)
    expect(() => parseCard('ZZ')).toThrow()
  })
  it('sorts', () => {
    const s = sortCards([parseCard('KH'), parseCard('2S'), parseCard('AH')], {
      aceHigh: true,
    })
    expect(s.map((c) => c.id)).toEqual(['S2', 'H13', 'H1'])
  })
})
