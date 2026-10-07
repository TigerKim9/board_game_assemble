import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import type { Difficulty } from '../../lib/types'
import { aiMove, applyMove, completingEdges, controlValue, edgeCoords, geo, initialState, safeEdges, scores, type DbState } from './logic'

const draw = (s: DbState, es: number[]) => es.reduce((st, e) => applyMove(st, e), s)

describe('dots and boxes rules', () => {
  it('has the right number of edges', () => {
    expect(geo(3).E).toBe(24)
    expect(geo(6).E).toBe(84)
    expect(edgeCoords(3, 0)).toEqual([0, 0, 1, 0])
    expect(edgeCoords(3, geo(3).H)).toEqual([0, 0, 0, 1])
  })
  it('completing a box scores and gives another turn', () => {
    const n = 3
    const [t, b, l, r] = geo(n).boxEdges[0]
    let s = draw(initialState(n, 2), [t, b, l]) // players 0,1,0
    expect(s.turn).toBe(1)
    expect(completingEdges(s)).toEqual([r])
    s = applyMove(s, r)
    expect(s.boxes[0]).toBe(1)
    expect(s.turn).toBe(1)
    expect(scores(s)).toEqual([0, 1])
    expect(s.lastBoxes).toEqual([0])
  })
  it('one edge can complete two boxes', () => {
    const n = 3
    const g = geo(n)
    const shared = g.boxEdges[0][3]
    const others = [...g.boxEdges[0], ...g.boxEdges[1]].filter((e) => e !== shared)
    let s = draw(initialState(n, 3), others)
    const who = s.turn
    s = applyMove(s, shared)
    expect(s.lastBoxes.length).toBe(2)
    expect(scores(s)[who]).toBe(2)
  })
  it('ends when all boxes are taken', () => {
    let s = initialState(3, 2)
    for (let e = 0; e < geo(3).E; e++) s = applyMove(s, e)
    expect(s.over).toBe(true)
    expect(scores(s).reduce((a, b) => a + b)).toBe(9)
  })
  it('safe edges avoid third sides', () => {
    const [t, b] = geo(3).boxEdges[0]
    const s = draw(initialState(3, 2), [t, b])
    const sf = safeEdges(s)
    for (const e of geo(3).boxEdges[0]) expect(sf).not.toContain(e)
  })
})

describe('dots and boxes AI', () => {
  it('chain values', () => {
    expect(controlValue([3])).toBe(3)
    expect(controlValue([3, 3])).toBe(2)
    expect(controlValue([1, 1])).toBe(0)
  })
  it('normal takes free boxes and avoids handing boxes out', () => {
    const [t, b, l, r] = geo(3).boxEdges[4]
    const s = draw(initialState(3, 2), [t, b, l])
    expect(aiMove(s, 'normal')).toBe(r)
    const s2 = draw(initialState(3, 2), [t, b])
    for (let k = 0; k < 20; k++) expect([l, r]).not.toContain(aiMove(s2, 'normal'))
  })
  const match = (a: Difficulty, b: Difficulty, n: number, games: number, seed: number) => {
    const rng = mulberry32(seed)
    let aWins = 0
    for (let g = 0; g < games; g++) {
      let s = initialState(n, 2)
      const aSide = g % 2
      while (!s.over) s = applyMove(s, aiMove(s, s.turn === aSide ? a : b, rng)!)
      const sc = scores(s)
      if (sc[aSide] > sc[1 - aSide]) aWins++
    }
    return aWins
  }
  it('normal beats easy', () => {
    expect(match('normal', 'easy', 4, 10, 1)).toBeGreaterThanOrEqual(8)
  })
  it('hard beats normal more often than not', () => {
    expect(match('hard', 'normal', 4, 40, 2)).toBeGreaterThanOrEqual(24)
  }, 30000)
})
