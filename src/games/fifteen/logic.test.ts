import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { THEMES, isSolvable, isSolved, movable, pictureSvg, scramble, slideDir, slideFrom, solved } from './logic'

describe('fifteen', () => {
  it('solved boards are solvable', () => {
    for (const n of [3, 4, 5]) {
      expect(isSolved(solved(n))).toBe(true)
      expect(isSolvable(solved(n), n)).toBe(true)
    }
  })
  it('detects the classic unsolvable 14-15 swap', () => {
    const t = solved(4)
    ;[t[13], t[14]] = [t[14], t[13]]
    expect(isSolvable(t, 4)).toBe(false)
  })
  it('a random walk from solved stays solvable', () => {
    const rng = mulberry32(5)
    for (const n of [3, 4, 5]) {
      let t = solved(n)
      for (let k = 0; k < 300; k++) {
        const d = (['up', 'down', 'left', 'right'] as const)[Math.floor(rng() * 4)]
        t = slideDir(t, n, d)?.tiles ?? t
      }
      expect(isSolvable(t, n)).toBe(true)
    }
  })
  it('scrambles are solvable and unsolved', () => {
    for (let s = 1; s < 40; s++) {
      const n = 3 + (s % 3)
      const t = scramble(n, mulberry32(s))
      expect(isSolvable(t, n)).toBe(true)
      expect(isSolved(t)).toBe(false)
      expect([...t].sort((a, b) => a - b)).toEqual([...solved(n)].sort((a, b) => a - b))
    }
  })
  it('slides several tiles in a row at once', () => {
    // blank at top-left; tap the end of the row
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const r = slideFrom(t, 3, 2)!
    expect(r.tiles).toEqual([1, 2, 0, 3, 4, 5, 6, 7, 8])
    expect(r.moved).toBe(2)
    const c = slideFrom(t, 3, 6)!
    expect(c.tiles).toEqual([3, 1, 2, 6, 4, 5, 0, 7, 8])
    expect(slideFrom(t, 3, 4)).toBeNull()
  })
  it('arrow keys move the neighbouring tile', () => {
    const t = solved(3) // blank bottom-right
    expect(slideDir(t, 3, 'right')!.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8])
    expect(slideDir(t, 3, 'left')).toBeNull()
    expect(slideDir(t, 3, 'down')!.tiles).toEqual([1, 2, 3, 4, 5, 0, 7, 8, 6])
  })
  it('lists movable tiles', () => {
    expect([...movable(solved(3), 3)].sort()).toEqual([2, 5, 6, 7])
  })
  it('draws every picture theme', () => {
    for (const th of THEMES) expect(pictureSvg(th, 3)).toContain('<svg')
  })
})
