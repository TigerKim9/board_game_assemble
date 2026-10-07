import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiAgreesStar, aiDelay, dealHands, maxLevel, newGame, nextLevel, play, topCard, useStar, type TState } from './logic'

const at = (hands: number[][], over: Partial<TState> = {}): TState => ({
  ...newGame(hands.length, mulberry32(1)),
  hands,
  ...over,
})

describe('telepathy rules', () => {
  it('level count depends on players', () => {
    expect(maxLevel(2)).toBe(12)
    expect(maxLevel(3)).toBe(10)
    expect(maxLevel(4)).toBe(8)
  })
  it('deals level-many unique cards', () => {
    const h = dealHands(4, 8, mulberry32(2))
    expect(h.every((x) => x.length === 8)).toBe(true)
    expect(new Set(h.flat()).size).toBe(32)
    expect(h[0]).toEqual([...h[0]].sort((a, b) => a - b))
  })
  it('playing in order is fine', () => {
    let s = at([[10, 40], [20]], { level: 2 })
    s = play(s, 0).state
    expect(topCard(s)).toBe(10)
    const r = play(s, 1)
    expect(r.mistake).toBeNull()
    expect(r.state.lives).toBe(2)
  })
  it('a mistake costs a life and discards lower cards', () => {
    const s = at([[10, 40], [20, 30], [5]], { level: 2 })
    const r = play(s, 1)
    expect(r.mistake?.lower).toEqual([
      { player: 0, card: 10 },
      { player: 2, card: 5 },
    ])
    expect(r.state.lives).toBe(2)
    expect(r.state.hands).toEqual([[40], [30], []])
    expect(r.state.discarded).toEqual([10, 5])
  })
  it('clearing a level gives its reward', () => {
    const s = at([[10], []], { level: 2, stars: 1 })
    const r = play(s, 0).state
    expect(r.status).toBe('clear')
    expect(r.reward).toBe('star')
    expect(r.stars).toBe(2)
    const n = nextLevel(r, mulberry32(3))
    expect(n.level).toBe(3)
    expect(n.hands.every((h) => h.length === 3)).toBe(true)
    expect(n.status).toBe('playing')
  })
  it('clearing the final level wins', () => {
    const s = at([[10], []], { level: 12 })
    expect(play(s, 0).state.status).toBe('won')
  })
  it('losing the last life ends the game', () => {
    const s = at([[10], [20]], { lives: 1 })
    expect(play(s, 1).state.status).toBe('lost')
  })
  it('a star discards everyone’s lowest card', () => {
    const s = at([[10, 50], [20], []], { level: 2, stars: 1 })
    const r = useStar(s)
    expect(r.thrown.map((t) => t.card)).toEqual([10, 20])
    expect(r.state.hands).toEqual([[50], [], []])
    expect(r.state.stars).toBe(0)
    expect(useStar(r.state).state).toBe(r.state)
  })
})

describe('telepathy AI', () => {
  it('waits longer for bigger gaps', () => {
    const rng = mulberry32(4)
    let small = 0
    let big = 0
    for (let i = 0; i < 100; i++) {
      small += aiDelay(15, 5, 'normal', rng)
      big += aiDelay(70, 5, 'normal', rng)
    }
    expect(small).toBeLessThan(big)
  })
  it('plays quickly right above the top card', () => {
    expect(aiDelay(11, 10, 'hard', mulberry32(5))).toBeLessThan(700)
  })
  it('hard is steadier than easy', () => {
    const spread = (d: 'easy' | 'hard') => {
      const rng = mulberry32(6)
      const xs = Array.from({ length: 300 }, () => aiDelay(60, 10, d, rng))
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length
      return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
    }
    expect(spread('hard')).toBeLessThan(spread('easy'))
  })
  it('refuses a star when about to play', () => {
    expect(aiAgreesStar(12, 10)).toBe(false)
    expect(aiAgreesStar(60, 10)).toBe(true)
    expect(aiAgreesStar(undefined, 10)).toBe(true)
  })
})
