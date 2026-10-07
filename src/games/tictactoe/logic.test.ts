import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiMove, applyMove, emptyCells, initialState, winner, type TttState } from './logic'

const playAll = (moves: number[], s: TttState = initialState()) => moves.reduce((st, m) => applyMove(st, m), s)

describe('tictactoe rules', () => {
  it('detects wins and draws', () => {
    expect(winner(playAll([0, 3, 1, 4, 2]))).toBe(0)
    expect(winner(playAll([0, 4, 8, 2, 6, 3, 5, 7, 1]))).toBe(-1)
    expect(winner(playAll([0, 1]))).toBe(null)
  })
  it('ignores occupied cells and moves after the end', () => {
    const s = playAll([0])
    expect(applyMove(s, 0)).toBe(s)
    const done = playAll([0, 3, 1, 4, 2])
    expect(applyMove(done, 8)).toBe(done)
  })
  it('respects who starts', () => {
    const s = applyMove(initialState(1), 4)
    expect(s.board[4]).toBe(2)
  })
})

/** Every line of play against a perfect AI: AI never loses. */
function neverLoses(aiSide: 0 | 1, s: TttState, rng: () => number): boolean {
  if (s.over) return winner(s) !== 1 - aiSide
  if (s.turn === aiSide) return neverLoses(aiSide, applyMove(s, aiMove(s, 'hard', rng)!), rng)
  return emptyCells(s.board).every((i) => neverLoses(aiSide, applyMove(s, i), rng))
}

describe('tictactoe AI', () => {
  it('hard never loses', () => {
    const rng = mulberry32(5)
    expect(neverLoses(1, initialState(0), rng)).toBe(true)
    expect(neverLoses(0, initialState(0), rng)).toBe(true)
  })
  it('normal blocks and wins', () => {
    expect(aiMove(playAll([0, 4, 1]), 'normal')).toBe(2) // block
    expect(aiMove(playAll([0, 4, 1, 3, 8]), 'normal')).toBe(5) // win
  })
})
