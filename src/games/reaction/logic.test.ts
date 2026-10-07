import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  aiReaction,
  average,
  cardDuration,
  colorRun,
  colorScore,
  isMatch,
  makeCard,
  matchWinner,
  randomDelay,
  rating,
  roundWinner,
} from './logic'

describe('reaction basics', () => {
  it('random delay stays in range', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 200; i++) {
      const d = randomDelay(rng)
      expect(d).toBeGreaterThanOrEqual(1500)
      expect(d).toBeLessThanOrEqual(4500)
    }
  })
  it('averages and rates', () => {
    expect(average([200, 300])).toBe(250)
    expect(average([])).toBe(0)
    expect(rating(180)).toContain('번개')
    expect(rating(600)).toContain('졸린')
  })
  it('earliest non-fouled tap wins', () => {
    const taps = [
      { player: 0, at: 300 },
      { player: 1, at: 250 },
      { player: 2, at: 400 },
    ]
    expect(roundWinner(taps, [false, false, false])).toBe(1)
    expect(roundWinner(taps, [false, true, false])).toBe(0)
    expect(roundWinner([], [false])).toBeNull()
  })
  it('match ends at the target score', () => {
    expect(matchWinner([2, 3, 1], 3)).toBe(1)
    expect(matchWinner([2, 2], 3)).toBeNull()
  })
})

describe('reaction colour mode', () => {
  it('makes matching and non-matching cards', () => {
    const rng = mulberry32(2)
    for (let i = 0; i < 100; i++) {
      expect(isMatch(makeCard(true, rng))).toBe(true)
      expect(isMatch(makeCard(false, rng))).toBe(false)
    }
  })
  it('solo run has matches but never two in a row, and starts with a decoy', () => {
    const run = colorRun(mulberry32(3))
    expect(run.length).toBe(20)
    expect(isMatch(run[0])).toBe(false)
    const matches = run.filter(isMatch).length
    expect(matches).toBeGreaterThanOrEqual(4)
    for (let i = 1; i < run.length; i++) expect(isMatch(run[i]) && isMatch(run[i - 1])).toBe(false)
    for (let i = 1; i < run.length; i++) expect(run[i]).not.toEqual(run[i - 1])
  })
  it('cards speed up but stay readable', () => {
    expect(cardDuration(0)).toBeGreaterThan(cardDuration(15))
    expect(cardDuration(100)).toBe(700)
  })
  it('scores hits, fouls and misses', () => {
    expect(colorScore({ hits: 0, misses: 3, fouls: 2, times: [] })).toBe(0)
    expect(colorScore({ hits: 2, misses: 0, fouls: 0, times: [900, 900] })).toBe(200)
    expect(colorScore({ hits: 1, misses: 0, fouls: 0, times: [300] })).toBe(200)
  })
})

describe('reaction AI', () => {
  it('harder AI is faster', () => {
    const rng = mulberry32(4)
    const avg = (d: 'easy' | 'normal' | 'hard') =>
      average(Array.from({ length: 50 }, () => aiReaction(d, 'signal', rng)))
    expect(avg('hard')).toBeLessThan(avg('normal'))
    expect(avg('normal')).toBeLessThan(avg('easy'))
    expect(aiReaction('hard', 'color', () => 0)).toBeGreaterThan(aiReaction('hard', 'signal', () => 0))
  })
})
