import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  MEANINGS,
  SLOTS,
  adjacent,
  allPairs,
  bestPair,
  canRemove,
  cleared,
  completedMonths,
  newFortune,
  removePair,
  summary,
  type FortuneState,
} from './logic'

describe('hwatu fortune', () => {
  it('lays out 16 cards', () => {
    const s = newFortune(mulberry32(1))
    expect(s.board).toHaveLength(SLOTS)
    expect(s.deck).toHaveLength(32)
  })
  it('adjacency includes diagonals but not wraparound', () => {
    expect(adjacent(0, 1)).toBe(true)
    expect(adjacent(0, 5)).toBe(true)
    expect(adjacent(0, 4)).toBe(true)
    expect(adjacent(3, 4)).toBe(false)
    expect(adjacent(0, 2)).toBe(false)
  })
  it('removes adjacent same-month pairs and refills by sliding', () => {
    const board = [0, 1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 5, 9, 13]
    const s: FortuneState = { board, deck: [2, 3], removed: [] }
    expect(canRemove(s, 0, 1)).toBe(true)
    expect(canRemove(s, 0, 2)).toBe(false)
    const t = removePair(s, 0, 1)
    expect(t.removed).toEqual([0, 1])
    expect(t.board.slice(0, 3)).toEqual([4, 8, 12])
    expect(t.board.slice(-2)).toEqual([2, 3])
    expect(removePair(s, 0, 2)).toBe(s)
  })
  it('leaves empty slots when the deck runs out', () => {
    const s: FortuneState = { board: [0, 1, ...Array(14).fill(null)], deck: [], removed: [] }
    const t = removePair(s, 0, 1)
    expect(t.board.every((c) => c === null)).toBe(true)
  })
  it('tracks fully removed months', () => {
    expect(completedMonths([0, 1, 4, 2, 3])).toEqual([1])
    expect(completedMonths([0, 1])).toEqual([])
  })
  it('auto-play terminates and conserves cards', () => {
    let clears = 0
    for (let k = 0; k < 40; k++) {
      let s = newFortune(mulberry32(k))
      let p = bestPair(s)
      while (p) {
        s = removePair(s, p[0], p[1])
        p = bestPair(s)
      }
      expect(allPairs(s)).toHaveLength(0)
      const left = s.board.filter((c) => c != null).length + s.deck.length
      expect(left + s.removed.length).toBe(48)
      if (cleared(s)) clears++
    }
    expect(clears).toBeGreaterThanOrEqual(0)
  })
  it('has 12 meanings and summaries', () => {
    expect(MEANINGS.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(summary(0, false).title).toContain('평온')
    expect(summary(12, true).title).toContain('운수대통')
  })
})
