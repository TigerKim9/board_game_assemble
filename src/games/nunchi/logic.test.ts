import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { COLLISION_MS, aiDelay, aiStillCalls, call, canCall, newRound, nextNumber, rankPenalties, remaining, tick } from './logic'

describe('nunchi calls', () => {
  it('a lone call claims the number after the window', () => {
    let s = newRound(4)
    s = call(s, 2, 1000)
    expect(nextNumber(s)).toBe(1)
    s = tick(s, 1000 + COLLISION_MS + 1)
    expect(s.called).toEqual([2])
    expect(nextNumber(s)).toBe(2)
    expect(canCall(s, 2)).toBe(false)
  })
  it('two calls within the window collide and both lose', () => {
    let s = newRound(4)
    s = call(s, 0, 1000)
    s = call(s, 3, 1000 + COLLISION_MS - 50)
    s = tick(s, 3000)
    expect(s.losers).toEqual([0, 3])
    expect(s.reason).toBe('collision')
  })
  it('the last one standing loses', () => {
    let s = newRound(3)
    s = tick(call(s, 1, 0), 700)
    s = tick(call(s, 0, 2000), 2700)
    expect(s.losers).toEqual([2])
    expect(s.reason).toBe('last')
    expect(remaining(s)).toEqual([2])
  })
  it('a call after an expired window settles the previous one first', () => {
    let s = newRound(4)
    s = call(s, 0, 0)
    s = call(s, 1, COLLISION_MS + 100)
    expect(s.called).toEqual([0])
    expect(s.window?.players).toEqual([1])
  })
  it('ignores calls after the round is over or repeated calls', () => {
    let s = newRound(3)
    s = call(s, 0, 0)
    expect(call(s, 0, 10)).toBe(s)
    s = tick(call(s, 1, 100), 2000)
    expect(call(s, 2, 2100)).toBe(s)
  })
})

describe('nunchi AI', () => {
  it('delays are positive and get shorter as players run out', () => {
    const rng = mulberry32(1)
    let many = 0
    let few = 0
    for (let i = 0; i < 400; i++) {
      many += aiDelay(9, 10, 'normal', rng)
      few += aiDelay(2, 10, 'normal', rng)
    }
    expect(few).toBeLessThan(many)
    expect(aiDelay(3, 5, 'hard', rng)).toBeGreaterThan(0)
  })
  it('hard AI usually holds back after hearing a call', () => {
    const rng = mulberry32(2)
    const s = call(newRound(5), 0, 0)
    let calls = 0
    for (let i = 0; i < 200; i++) if (aiStillCalls(s, 500, 'hard', rng)) calls++
    expect(calls).toBeLessThan(50)
    // Too fast to react: always calls
    expect(aiStillCalls(s, 50, 'hard', rng)).toBe(true)
  })
  it('ranks penalties with ties', () => {
    expect(rankPenalties([2, 0, 2, 1]).map((r) => [r.player, r.place])).toEqual([
      [1, 1],
      [3, 2],
      [0, 3],
      [2, 3],
    ])
  })
})
