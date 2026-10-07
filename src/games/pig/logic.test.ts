import { describe, expect, it } from 'vitest'
import { aiShouldRoll, applyRoll, endBust, hold, newGame, startRoll } from './logic'

const two = [
  { name: 'A', isAI: false },
  { name: 'B', isAI: true },
]

describe('pig rules', () => {
  it('accumulates rolls and banks on hold', () => {
    let s = newGame(two)
    s = applyRoll(startRoll(s), 5)
    s = applyRoll(startRoll(s), 6)
    expect(s.turnTotal).toBe(11)
    s = hold(s)
    expect(s.scores).toEqual([11, 0])
    expect(s.turn).toBe(1)
    expect(s.turnTotal).toBe(0)
  })
  it('rolling a 1 loses the turn total', () => {
    let s = newGame(two)
    s = applyRoll(s, 4)
    s = applyRoll(s, 1)
    expect(s.bust).toBe(true)
    expect(s.turnTotal).toBe(0)
    s = endBust(s)
    expect(s.scores).toEqual([0, 0])
    expect(s.turn).toBe(1)
  })
  it('wins at 100', () => {
    let s = { ...newGame(two), scores: [96, 0] }
    s = applyRoll(s, 4)
    s = hold(s)
    expect(s.winner).toBe(0)
    expect(s.turns[0]).toBe(1)
  })
  it('cannot hold with zero', () => {
    const s = newGame(two)
    expect(hold(s)).toBe(s)
  })
})

describe('pig AI', () => {
  it('always rolls at the start of a turn', () => {
    expect(aiShouldRoll(0, 0, 0, 'easy')).toBe(true)
  })
  it('holds when it can win', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) expect(aiShouldRoll(10, 95, 99, d)).toBe(false)
  })
  it('normal holds at 20', () => {
    expect(aiShouldRoll(19, 0, 0, 'normal')).toBe(true)
    expect(aiShouldRoll(20, 0, 0, 'normal')).toBe(false)
  })
  it('hard pushes when an opponent is close to winning', () => {
    expect(aiShouldRoll(30, 20, 90, 'hard')).toBe(true)
    expect(aiShouldRoll(25, 20, 20, 'hard')).toBe(false)
  })
  it('easy is more timid than hard', () => {
    expect(aiShouldRoll(13, 0, 0, 'easy', () => 0.9)).toBe(false)
    expect(aiShouldRoll(13, 0, 0, 'hard')).toBe(true)
  })
})
