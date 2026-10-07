import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { fitList, makeLadder, mapping, presetResults, tracePath } from './logic'

describe('ladder', () => {
  it('never places touching rungs in one row', () => {
    for (let seed = 1; seed < 50; seed++) {
      const l = makeLadder(10, undefined, mulberry32(seed))
      for (const row of l) for (let c = 1; c < row.length; c++) expect(row[c] && row[c - 1]).toBe(false)
    }
  })
  it('connects every adjacent pair at least once', () => {
    // rng that never wants a rung → the guarantee pass must add them
    const l = makeLadder(6, 8, () => 0.99)
    for (let c = 0; c < 5; c++) expect(l.some((row) => row[c])).toBe(true)
    for (const row of l) for (let c = 1; c < row.length; c++) expect(row[c] && row[c - 1]).toBe(false)
    for (let seed = 1; seed < 50; seed++) {
      const r = makeLadder(10, undefined, mulberry32(seed))
      for (let c = 0; c < 9; c++) expect(r.some((row) => row[c])).toBe(true)
    }
  })
  it('maps starts to a permutation', () => {
    for (let n = 2; n <= 10; n++) {
      const m = mapping(makeLadder(n, undefined, mulberry32(n)), n)
      expect([...m].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i))
    }
  })
  it('traces a known ladder', () => {
    const l = [
      [true, false],
      [false, true],
    ]
    expect(tracePath(l, 0).end).toBe(2)
    expect(tracePath(l, 1).end).toBe(0)
    expect(tracePath(l, 2).end).toBe(1)
    const pts = tracePath(l, 0).points
    expect(pts[0]).toEqual({ col: 0, level: 0 })
    expect(pts[pts.length - 1]).toEqual({ col: 2, level: 3 })
  })
  it('builds presets and fits lists', () => {
    expect(presetResults('one-win', 3)).toEqual(['당첨', '꽝', '꽝'])
    expect(presetResults('order', 2)).toEqual(['1번', '2번'])
    expect(fitList(['a'], 3, () => 'x')).toEqual(['a', 'x', 'x'])
    expect(fitList(['a', 'b', 'c'], 2, () => 'x')).toEqual(['a', 'b'])
  })
})
