import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiMove, applyMove, counts, flipsFor, initialState, legalMoves, winner, type Cell, type OthelloState } from './logic'
import { WIN, searchBest, type SearchGame } from './search'

const emptyBoard = (): Cell[] => Array(64).fill(0)

describe('othello rules', () => {
  it('has 4 opening moves for black', () => {
    expect(legalMoves(initialState().board, 1).sort((a, b) => a - b)).toEqual([19, 26, 37, 44])
  })
  it('flips sandwiched discs', () => {
    const s = applyMove(initialState(), 19)
    expect(s.board[27]).toBe(1)
    expect(counts(s.board)).toEqual([4, 1])
    expect(s.turn).toBe(1)
    expect(s.last).toBe(19)
    expect(s.flipped).toEqual([27])
  })
  it('flips in several directions', () => {
    const b = emptyBoard()
    b[0] = 1
    b[1] = 2
    b[8] = 2
    b[9] = 2
    b[16] = 1
    b[18] = 1
    expect(flipsFor(b, 0, 1)).toEqual([])
    expect(flipsFor(b, 17, 1)).toEqual([])
    b[0] = 0
    b[2] = 1
    expect(flipsFor(b, 0, 1).sort((a, c) => a - c)).toEqual([1, 8, 9])
  })
  it('passes when the opponent has no move, and ends when nobody can move', () => {
    // White has no move after black plays; black can continue.
    const b = emptyBoard()
    b[0] = 1
    b[1] = 2
    b[10] = 2
    let s: OthelloState = { ...initialState(), board: b, turn: 0 }
    s = applyMove(s, 2) // flips 1, white disc on 10 remains
    expect(s.board[1]).toBe(1)
    expect(s.over || s.turn === 0 || legalMoves(s.board, 2).length > 0).toBe(true)
    // Board with only black discs → game over.
    const b2 = emptyBoard()
    b2[0] = 1
    b2[1] = 2
    const s2 = applyMove({ ...initialState(), board: b2, turn: 0 }, 2)
    expect(s2.over).toBe(true)
    expect(winner(s2)).toBe(0)
  })
  it('sets passed when the next player must skip', () => {
    const b = emptyBoard()
    // Row: B W _ ... and a separate W W B so black still has moves after white is stuck
    b[0] = 1
    b[1] = 2
    b[63] = 1
    b[62] = 2
    b[61] = 2
    const s = applyMove({ ...initialState(), board: b, turn: 0 }, 2)
    expect(s.turn).toBe(0)
    expect(s.passed).toBe(1)
    expect(s.over).toBe(false)
  })
})

describe('othello AI', () => {
  it('grabs a corner when available', () => {
    const b = emptyBoard()
    b[9] = 1
    b[18] = 1
    b[27] = 2
    b[36] = 1
    b[28] = 1
    const s: OthelloState = { ...initialState(), board: b, turn: 1 }
    expect(legalMoves(b, 2)).toContain(0)
    for (const d of ['normal', 'hard'] as const) expect(aiMove(s, d, mulberry32(1), 200)).toBe(0)
  })
  it('hard beats easy', () => {
    const rng = mulberry32(7)
    let wins = 0
    for (let g = 0; g < 2; g++) {
      let s = initialState()
      while (!s.over) {
        const hardSide = g === 0 ? 0 : 1
        const m = aiMove(s, s.turn === hardSide ? 'hard' : 'easy', rng, 40)
        s = applyMove(s, m!)
      }
      if (winner(s) === (g === 0 ? 0 : 1)) wins++
    }
    expect(wins).toBe(2)
  }, 30000)
})

describe('generic search', () => {
  // Simple Nim: take 1-3 from a pile, last to take wins.
  const nim: SearchGame<{ n: number; t: number }, number> = {
    moves: (s) => [1, 2, 3].filter((k) => k <= s.n),
    play: (s, k) => ({ n: s.n - k, t: 1 - s.t }),
    turn: (s) => s.t,
    evaluate: (s) => (s.n === 0 ? -WIN : 0),
  }
  it('solves nim', () => {
    for (const n of [5, 6, 7, 9, 10, 11]) {
      const r = searchBest(nim, { n, t: 0 }, { maxDepth: 20 })
      expect((n - r!.move) % 4).toBe(0)
      expect(r!.score).toBeGreaterThan(WIN / 2)
    }
  })
})
