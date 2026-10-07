import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  LEVELS,
  canChord,
  chord,
  computeAdj,
  neighbors,
  newBoard,
  placeMines,
  reveal,
  solvableWithoutGuessing,
  toggleFlag,
  type Board,
} from './logic'

function fromRows(rows: string[]): Board {
  const h = rows.length
  const w = rows[0].length
  const mine = rows.join('').split('').map((c) => c === '*')
  const b = newBoard(w, h, mine.filter(Boolean).length)
  return { ...b, mine, adj: computeAdj(mine, w, h), status: 'playing' }
}

describe('minesweeper basics', () => {
  it('lists neighbours at corners and middle', () => {
    expect(neighbors(0, 3, 3).sort()).toEqual([1, 3, 4])
    expect(neighbors(4, 3, 3)).toHaveLength(8)
  })
  it('first click is always safe and opens an area', () => {
    for (let s = 1; s <= 30; s++) {
      const lv = LEVELS[s % 3]
      const b = reveal(newBoard(lv.w, lv.h, lv.mines), 37, { rng: mulberry32(s) })
      expect(b.status).toBe('playing')
      expect(b.mine.filter(Boolean)).toHaveLength(lv.mines)
      expect(b.adj[37]).toBe(0)
      expect(b.open.filter(Boolean).length).toBeGreaterThan(1)
    }
  })
  it('flood fills zeros and wins when all safe cells are open', () => {
    const b = fromRows(['....', '....', '...*'])
    const r = reveal(b, 0)
    expect(r.status).toBe('won')
    expect(r.flag[11]).toBe(true)
  })
  it('loses on a mine', () => {
    const b = fromRows(['*..', '...', '...'])
    const r = reveal(b, 0)
    expect(r.status).toBe('lost')
    expect(r.exploded).toBe(0)
  })
  it('does not open flagged cells', () => {
    const b = toggleFlag(fromRows(['*..', '...', '..*']), 4)
    expect(reveal(b, 4).open[4]).toBe(false)
  })
  it('chords when flags match', () => {
    let b = fromRows(['*..', '...', '...'])
    b = reveal(b, 4) // a "1"
    expect(b.open[4]).toBe(true)
    expect(canChord(b, 4)).toBe(false)
    b = toggleFlag(b, 0)
    expect(canChord(b, 4)).toBe(true)
    b = chord(b, 4)
    expect(b.status).toBe('won')
  })
  it('chording with a wrong flag explodes', () => {
    let b = fromRows(['*..', '...', '...'])
    b = reveal(b, 4)
    b = toggleFlag(b, 1)
    b = chord(b, 4)
    expect(b.status).toBe('lost')
  })
})

describe('no-guess generation', () => {
  it('solver recognises a forced 50/50 as unsolvable', () => {
    // Two cells in a corner behind a wall of mines/numbers: classic coin flip.
    const rows = ['..', '..', '..', '*.']
    const mine = rows.join('').split('').map((c) => c === '*')
    expect(solvableWithoutGuessing(mine, 2, 4, 0)).toBe(false)
    // ...while a single mine in a strip is solvable.
    expect(solvableWithoutGuessing([false, false, false, true, false], 5, 1, 0)).toBe(true)
  })
  it('generates solvable intermediate boards', () => {
    const lv = LEVELS[1]
    let ok = 0
    for (let s = 1; s <= 5; s++) {
      const b = placeMines(newBoard(lv.w, lv.h, lv.mines), 120, { noGuess: true, rng: mulberry32(s), budgetMs: 3000 })
      if (solvableWithoutGuessing(b.mine, lv.w, lv.h, 120)) ok++
    }
    expect(ok).toBe(5)
  })
})
