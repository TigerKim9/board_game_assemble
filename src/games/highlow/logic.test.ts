import { describe, expect, it } from 'vitest'
import { parseCard, parseCards } from '../../cards/deck'
import { mulberry32 } from '../../lib/random'
import { aiGuess, aiShouldStop, bestGuess, flip, judge, newShoe, odds, TARGET } from './logic'

describe('high-low rules', () => {
  it('judges with ace high', () => {
    expect(judge('higher', parseCard('7S'), parseCard('9H'))).toBe('right')
    expect(judge('lower', parseCard('7S'), parseCard('9H'))).toBe('wrong')
    expect(judge('higher', parseCard('KS'), parseCard('AH'))).toBe('right')
    expect(judge('lower', parseCard('2S'), parseCard('AH'))).toBe('wrong')
    expect(judge('lower', parseCard('7S'), parseCard('7D'))).toBe('same')
  })
  it('flips through the deck and reshuffles the other 51 cards', () => {
    let s = newShoe(mulberry32(1))
    expect(s.deck).toHaveLength(51)
    for (let i = 0; i < 51; i++) s = flip(s, mulberry32(i)).shoe
    expect(s.deck).toHaveLength(0)
    const r = flip(s, mulberry32(99))
    expect(r.reshuffled).toBe(true)
    expect(r.shoe.deck).toHaveLength(50)
    expect(r.card.id).not.toBe(s.current.id)
    expect(r.shoe.seen).toHaveLength(2)
  })
  it('counts odds from the remaining cards', () => {
    expect(odds(parseCards('2S 3S KS AS 8D'), parseCard('8H'))).toEqual({
      higher: 2,
      lower: 2,
      same: 1,
    })
  })
})

describe('high-low AI', () => {
  it('guesses the likelier direction', () => {
    expect(bestGuess([], parseCard('3S'), false).guess).toBe('higher')
    expect(bestGuess([], parseCard('QS'), false).guess).toBe('lower')
    // a counting AI notices only high cards are left
    const deck = parseCards('KS KH AS AD 3C')
    expect(bestGuess(deck, parseCard('QS'), true).guess).toBe('higher')
    expect(aiGuess(deck, parseCard('QS'), 'hard')).toBe('higher')
    expect(aiGuess(deck, parseCard('QS'), 'normal')).toBe('lower')
  })
  it('banks sensibly', () => {
    expect(aiShouldStop(0, 0, 0.1, 'hard')).toBe(false)
    expect(aiShouldStop(2, TARGET - 2, 0.99, 'normal')).toBe(true)
    expect(aiShouldStop(3, 0, 0.9, 'easy')).toBe(true)
    expect(aiShouldStop(1, 0, 0.9, 'hard')).toBe(false)
    expect(aiShouldStop(5, 0, 0.6, 'hard')).toBe(true)
  })
})
