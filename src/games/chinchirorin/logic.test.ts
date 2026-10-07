import { describe, expect, it } from 'vitest'
import { aiBet, applyPayout, dealerInstant, evalHand, isFinal, playerVsDealer, strength } from './logic'

describe('chinchirorin hands', () => {
  it('evaluates hands', () => {
    expect(evalHand([1, 1, 1])).toEqual({ kind: 'pinzoro', value: 1 })
    expect(evalHand([4, 4, 4])).toEqual({ kind: 'triple', value: 4 })
    expect(evalHand([6, 4, 5])).toEqual({ kind: 'shigoro', value: 0 })
    expect(evalHand([3, 1, 2])).toEqual({ kind: 'hifumi', value: 0 })
    expect(evalHand([2, 2, 5])).toEqual({ kind: 'point', value: 5 })
    expect(evalHand([6, 1, 6])).toEqual({ kind: 'point', value: 1 })
    expect(evalHand([1, 3, 6])).toEqual({ kind: 'none', value: 0 })
    expect(isFinal(evalHand([1, 3, 6]))).toBe(false)
    expect(isFinal(evalHand([1, 2, 3]))).toBe(true)
  })
  it('ranks hands', () => {
    const order = [[1, 2, 3], [1, 3, 6], [2, 2, 1], [2, 2, 6], [4, 5, 6], [2, 2, 2], [6, 6, 6], [1, 1, 1]]
    const s = order.map((d) => strength(evalHand(d)))
    expect(s).toEqual(s.slice().sort((a, b) => a - b))
  })
})

describe('chinchirorin payouts', () => {
  it('dealer instant results', () => {
    expect(dealerInstant(evalHand([1, 1, 1]))).toBe(-5)
    expect(dealerInstant(evalHand([3, 3, 3]))).toBe(-3)
    expect(dealerInstant(evalHand([4, 5, 6]))).toBe(-2)
    expect(dealerInstant(evalHand([1, 2, 3]))).toBe(2)
    expect(dealerInstant(evalHand([1, 3, 5]))).toBe(1)
    expect(dealerInstant(evalHand([3, 3, 5]))).toBeNull()
  })
  it('player vs dealer point', () => {
    const dealer = evalHand([3, 3, 4])
    expect(playerVsDealer(evalHand([2, 2, 5]), dealer)).toBe(1)
    expect(playerVsDealer(evalHand([2, 2, 4]), dealer)).toBe(0)
    expect(playerVsDealer(evalHand([2, 2, 3]), dealer)).toBe(-1)
    expect(playerVsDealer(evalHand([1, 2, 3]), dealer)).toBe(-2)
    expect(playerVsDealer(evalHand([4, 5, 6]), dealer)).toBe(2)
    expect(playerVsDealer(evalHand([5, 5, 5]), dealer)).toBe(3)
    expect(playerVsDealer(evalHand([1, 1, 1]), dealer)).toBe(5)
    expect(playerVsDealer(evalHand([1, 4, 6]), dealer)).toBe(-1)
  })
  it('chips never go negative', () => {
    expect(applyPayout(100, 50, -5)).toBe(0)
    expect(applyPayout(100, 50, 2)).toBe(200)
  })
  it('AI bets within its stack', () => {
    for (let i = 0; i < 50; i++) {
      const b = aiBet(300)
      expect(b).toBeGreaterThanOrEqual(10)
      expect(b).toBeLessThanOrEqual(60)
      expect(b % 10).toBe(0)
    }
    expect(aiBet(5)).toBe(0)
    expect(aiBet(10)).toBe(10)
  })
})
