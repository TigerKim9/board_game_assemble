import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { makeCard, parseCards, type Card } from '../../cards/deck'
import { aiPick, drawFrom, newGame, nextWithCards, ranking, removePairs, targetOf, type OMState } from './logic'

const JK = makeCard('S', 0)

function setup(hands: Card[][], turn = 0): OMState {
  const base = newGame(hands.map((_, i) => `P${i}`), hands.map(() => false), mulberry32(1))
  return { ...base, hands, turn, out: [], over: false, loser: null, pairs: 0, lastPair: null, log: [] }
}

describe('oldmaid pairs', () => {
  it('removes pairs of equal rank, keeps the joker and odd cards', () => {
    const r = removePairs([...parseCards('7H 7S 7D 9C KH KD'), JK])
    expect(r.removed.length).toBe(4)
    expect(r.kept.map((c) => c.rank).sort()).toEqual([0, 7, 9])
  })
  it('deals all 53 cards and nobody holds a pair afterwards', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const s = newGame(Array.from({ length: n }, (_, i) => `p${i}`), Array(n).fill(true), mulberry32(n))
      const total = s.hands.flat().length + s.pairs * 2
      expect(total).toBe(53)
      for (const h of s.hands) expect(removePairs(h).removed.length).toBe(0)
      expect(s.hands.flat().filter((c) => c.rank === 0).length).toBe(1)
    }
  })
})

describe('oldmaid drawing', () => {
  it('draws from the next player with cards and discards a made pair', () => {
    let s = setup([parseCards('7H 9C'), parseCards('7S 4D'), [JK, ...parseCards('4C')]])
    expect(targetOf(s, 0)).toBe(1)
    s = drawFrom(s, 0, 0) // takes 7S → pair with 7H
    expect(s.hands[0].map((c) => c.id)).toEqual(['C9'])
    expect(s.pairs).toBe(1)
    expect(s.turn).toBe(1)
  })
  it('skips escaped players and ends with the joker holder', () => {
    let s = setup([parseCards('7H'), [], [JK, ...parseCards('7S')]])
    expect(nextWithCards(s, 0)).toBe(2)
    s = drawFrom(s, 0, 1) // 7S → pair, player 0 escapes
    expect(s.out).toContain(0)
    expect(s.over).toBe(true)
    expect(s.loser).toBe(2)
    expect(ranking(s).at(-1)).toBe(2)
  })
  it('rejects out-of-turn draws', () => {
    const s = setup([parseCards('7H'), parseCards('8H 9H')])
    expect(drawFrom(s, 1, 0)).toBe(s)
    expect(drawFrom(s, 0, 5)).toBe(s)
  })
  it('random AI games always end with exactly one loser holding the joker', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed)
      const n = 2 + (seed % 5)
      let s = newGame(Array.from({ length: n }, (_, i) => `p${i}`), Array(n).fill(true), rng)
      let steps = 0
      while (!s.over && steps < 2000) {
        s = drawFrom(s, s.turn, aiPick(s, s.turn, rng), rng)
        steps++
      }
      expect(s.over).toBe(true)
      expect(s.loser).not.toBeNull()
      expect(s.hands[s.loser!]).toHaveLength(1)
      expect(s.hands[s.loser!][0].rank).toBe(0)
      expect(ranking(s)).toHaveLength(n)
    }
  })
})
