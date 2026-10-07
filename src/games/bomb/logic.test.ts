import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { FUSE_RANGES, firstHolder, nextHolder, randomFuse, tension, tickGap, topicPrompt, type FuseRange } from './logic'

describe('bomb', () => {
  it('keeps the hidden fuse inside the selected range', () => {
    const rng = mulberry32(11)
    for (const r of Object.keys(FUSE_RANGES) as FuseRange[]) {
      for (let i = 0; i < 200; i++) {
        const f = randomFuse(r, rng)
        expect(f).toBeGreaterThanOrEqual(FUSE_RANGES[r].min * 1000)
        expect(f).toBeLessThanOrEqual(FUSE_RANGES[r].max * 1000)
      }
    }
  })
  it('ticks faster as tension grows', () => {
    expect(tickGap(0)).toBeGreaterThan(tickGap(0.5))
    expect(tickGap(0.5)).toBeGreaterThan(tickGap(1))
    expect(tickGap(5)).toBe(tickGap(1))
    expect(tension(0, 'short')).toBe(0)
    expect(tension(10_000, 'short')).toBe(0.5)
    expect(tension(99_000, 'short')).toBe(1)
  })
  it('passes around the circle', () => {
    expect(nextHolder(0, 4)).toBe(1)
    expect(nextHolder(3, 4)).toBe(0)
    const rng = mulberry32(2)
    for (let i = 0; i < 50; i++) {
      const f = firstHolder(5, rng)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(5)
    }
  })
  it('makes topic prompts', () => {
    expect(topicPrompt('none')).toBeNull()
    expect(topicPrompt('choseong', () => 0)!.value).toBe('ㄱㅂ')
    expect(topicPrompt('chain', () => 0)!.value).toBe('기차')
    expect(topicPrompt('category', () => 0.999)!.value).toBeTruthy()
  })
})
