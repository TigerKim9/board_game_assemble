import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  LEVELS,
  PEERS,
  UNITS,
  candidates,
  clearPeerNotes,
  conflicts,
  countSolutions,
  findHint,
  generate,
  grade,
  randomSolution,
  remaining,
  solve,
  type Grid,
} from './logic'

const parse = (s: string): Grid => s.replace(/\s/g, '').split('').map((c) => (c === '.' ? 0 : Number(c)))

const validFull = (g: Grid) => UNITS.every((u) => new Set(u.map((i) => g[i])).size === 9 && u.every((i) => g[i] >= 1))

describe('sudoku basics', () => {
  it('has 20 peers per cell and 27 units', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true)
    expect(UNITS).toHaveLength(27)
  })
  it('random solutions are valid', () => {
    for (let s = 1; s < 5; s++) expect(validFull(randomSolution(mulberry32(s)))).toBe(true)
  })
  it('counts multiple solutions', () => {
    expect(countSolutions(Array(81).fill(0), 2)).toBe(2)
  })
  it('solves a known puzzle', () => {
    const p = parse('53..7.... 6..195... .98....6. 8...6...3 4..8.3..1 7...2...6 .6....28. ...419..5 ....8..79')
    const s = solve(p)!
    expect(validFull(s)).toBe(true)
    expect(countSolutions(p)).toBe(1)
    expect(grade(p).solved).toBe(true)
  })
  it('detects conflicts and remaining counts', () => {
    const g = Array(81).fill(0)
    g[0] = 5
    g[8] = 5
    g[40] = 3
    expect([...conflicts(g)].sort()).toEqual([0, 8])
    const r = remaining(g)
    expect(r[5]).toBe(7)
    expect(r[3]).toBe(8)
  })
  it('candidates exclude peers', () => {
    const g = Array(81).fill(0)
    g[1] = 4
    expect(candidates(g)[0] & (1 << 4)).toBe(0)
    expect(candidates(g)[80] & (1 << 4)).not.toBe(0)
  })
  it('clears notes in peers', () => {
    const notes = Array(81).fill(0b1111111110)
    const n = clearPeerNotes(notes, 0, 3)
    expect(n[0]).toBe(0)
    expect(n[8] & (1 << 3)).toBe(0)
    expect(n[80] & (1 << 3)).not.toBe(0)
  })
})

describe('sudoku generation', () => {
  for (const lv of LEVELS) {
    it(`generates a unique ${lv.id} puzzle graded correctly`, () => {
      const { puzzle, solution } = generate(lv.id, mulberry32(lv.id.length * 7 + 1))
      expect(countSolutions(puzzle)).toBe(1)
      expect(solve(puzzle)).toEqual(solution)
      const g = grade(puzzle)
      expect(g.solved).toBe(true)
      const clues = puzzle.filter(Boolean).length
      if (lv.id === 'easy') expect(clues).toBeGreaterThanOrEqual(36)
      if (lv.id === 'normal') expect(g.level).toBe(1)
      if (lv.id === 'hard') expect(g.level).toBe(2)
      if (lv.id === 'expert') expect(g.level).toBe(3)
    })
  }
})

describe('sudoku hints', () => {
  it('points out a wrong digit first', () => {
    const { puzzle, solution } = generate('easy', mulberry32(3))
    const g = puzzle.slice()
    const empty = g.indexOf(0)
    g[empty] = (solution[empty] % 9) + 1
    expect(findHint(g, solution, null)).toEqual({ kind: 'wrong', cell: empty })
  })
  it('gives a correct placement', () => {
    const { puzzle, solution } = generate('normal', mulberry32(4))
    const h = findHint(puzzle, solution, null)!
    expect(h.kind).toBe('place')
    if (h.kind === 'place') {
      expect(h.value).toBe(solution[h.cell])
      expect(h.reason).not.toBe('reveal')
    }
  })
})
