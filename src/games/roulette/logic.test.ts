import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { cleanItems, indexAtRotation, segmentColors, shortLabel, spinTo } from './logic'

describe('roulette', () => {
  it('reads the segment under the top pointer', () => {
    expect(indexAtRotation(0, 4)).toBe(0)
    // rotating clockwise by 10° brings the last segment under the pointer
    expect(indexAtRotation(10, 4)).toBe(3)
    expect(indexAtRotation(-10, 4)).toBe(0)
    expect(indexAtRotation(-100, 4)).toBe(1)
    expect(indexAtRotation(360 * 3 + 350, 4)).toBe(0)
  })
  it('spins forward and lands on the chosen target', () => {
    const rng = mulberry32(7)
    for (let n = 2; n <= 12; n++) {
      let rot = 0
      for (let t = 0; t < n; t++) {
        const next = spinTo(rot, t, n, rng)
        expect(next).toBeGreaterThanOrEqual(rot + 5 * 360)
        expect(indexAtRotation(next, n)).toBe(t)
        rot = next
      }
    }
  })
  it('avoids equal neighbouring colors', () => {
    for (let n = 2; n <= 12; n++) {
      const c = segmentColors(n)
      for (let i = 0; i < n; i++) expect(c[i]).not.toBe(c[(i + 1) % n])
    }
  })
  it('cleans and shortens labels', () => {
    expect(cleanItems([' 짜장 ', ''])).toEqual(['짜장', '항목 2'])
    expect(shortLabel('엉덩이로 이름 쓰기', 10)).toBe('엉덩이…')
    expect(shortLabel('예', 2)).toBe('예')
  })
})
