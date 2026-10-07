import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { SIZES, aiFirst, aiSecond, allMatched, fade, isMatch, makeDeck, observe, pairCounts, pairsFor } from './logic'

describe('memory deck', () => {
  it('builds pairs for every grid size', () => {
    for (const s of SIZES) {
      const deck = makeDeck(pairsFor(s), mulberry32(1))
      expect(deck.length).toBe(s.cols * s.rows)
      const counts: Record<string, number> = {}
      for (const c of deck) counts[c.face] = (counts[c.face] ?? 0) + 1
      expect(Object.values(counts).every((n) => n === 2)).toBe(true)
    }
  })
  it('detects matches and completion', () => {
    const deck = makeDeck(2, mulberry32(2))
    const a = 0
    const b = deck.findIndex((c, i) => i !== a && c.face === deck[a].face)
    expect(isMatch(deck, a, b)).toBe(true)
    expect(isMatch(deck, a, a)).toBe(false)
    expect(allMatched(deck)).toBe(false)
    const done = deck.map((c) => ({ ...c, matched: true, owner: 0 }))
    expect(allMatched(done)).toBe(true)
    expect(pairCounts(done, 2)).toEqual([2, 0])
  })
})

describe('memory AI', () => {
  it('uses a known pair first', () => {
    const deck = makeDeck(4, mulberry32(3))
    const a = 1
    const b = deck.findIndex((c, i) => i !== a && c.face === deck[a].face)
    let mem = observe({}, a, deck[a].face, 'hard')
    mem = observe(mem, b, deck[b].face, 'hard')
    const first = aiFirst(deck, mem)
    expect([a, b]).toContain(first)
    expect(aiSecond(deck, mem, first)).toBe(first === a ? b : a)
  })
  it('explores unknown cards when nothing is known', () => {
    const deck = makeDeck(3, mulberry32(4))
    const mem = observe({}, 0, deck[0].face, 'hard')
    for (let i = 0; i < 20; i++) expect(aiFirst(deck, mem)).not.toBe(0)
  })
  it('hard never forgets, easy forgets sometimes', () => {
    const deck = makeDeck(8, mulberry32(5))
    let mem = {}
    for (let i = 0; i < 16; i++) mem = observe(mem, i, deck[i].face, 'hard')
    expect(Object.keys(fade(mem, deck, 'hard')).length).toBe(16)
    const rng = mulberry32(6)
    let easy = {}
    for (let i = 0; i < 16; i++) easy = observe(easy, i, deck[i].face, 'easy', rng)
    expect(Object.keys(easy).length).toBeLessThan(16)
  })
  it('drops matched cards from memory', () => {
    const deck = makeDeck(2, mulberry32(7)).map((c, i) => (i === 0 ? { ...c, matched: true } : c))
    const mem = { 0: deck[0].face, 1: deck[1].face }
    expect(Object.keys(fade(mem, deck, 'hard'))).toEqual(['1'])
  })
})
