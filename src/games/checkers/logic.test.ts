import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiMove, applyMove, initialState, jumpedAlong, legalMoves, pieceCounts, type CheckersState, type Piece } from './logic'

const sq = (r: number, c: number) => r * 8 + c
const empty = (): CheckersState => ({ ...initialState(), board: Array(64).fill(0) as Piece[], ids: Array.from({ length: 64 }, (_, i) => i + 1) })

describe('checkers rules', () => {
  it('starts with 12 pieces each and 7 opening moves', () => {
    const s = initialState()
    expect(pieceCounts(s.board)).toEqual([12, 12])
    expect(legalMoves(s.board, 0).length).toBe(7)
  })
  it('forces captures', () => {
    const s = empty()
    s.board[sq(5, 2)] = 1
    s.board[sq(4, 3)] = 3
    s.board[sq(6, 7)] = 1
    const ms = legalMoves(s.board, 0)
    expect(ms).toEqual([{ path: [sq(5, 2), sq(3, 4)], captures: [sq(4, 3)] }])
  })
  it('requires completing multi-jumps', () => {
    const s = empty()
    s.board[sq(7, 0)] = 1
    s.board[sq(6, 1)] = 3
    s.board[sq(4, 3)] = 3
    const ms = legalMoves(s.board, 0)
    expect(ms.length).toBe(1)
    expect(ms[0].path).toEqual([sq(7, 0), sq(5, 2), sq(3, 4)])
    expect(ms[0].captures.length).toBe(2)
    const after = applyMove(s, ms[0])
    expect(pieceCounts(after.board)).toEqual([1, 0])
    expect(after.over).toBe(true)
    expect(after.winner).toBe(0)
  })
  it('men cannot capture backwards, kings can', () => {
    const s = empty()
    s.board[sq(3, 2)] = 1
    s.board[sq(4, 3)] = 3
    s.board[sq(0, 7)] = 3
    expect(legalMoves(s.board, 0).every((m) => m.captures.length === 0)).toBe(true)
    s.board[sq(3, 2)] = 2
    expect(legalMoves(s.board, 0)[0].captures).toEqual([sq(4, 3)])
  })
  it('promotes on the far row and stops the jump there', () => {
    const s = empty()
    s.board[sq(2, 1)] = 1
    s.board[sq(1, 2)] = 3
    s.board[sq(1, 4)] = 3 // a king could continue 0,3 -> 2,5 but a new king must stop
    s.board[sq(5, 6)] = 3
    const ms = legalMoves(s.board, 0)
    expect(ms.length).toBe(1)
    expect(ms[0].path).toEqual([sq(2, 1), sq(0, 3)])
    const after = applyMove(s, ms[0])
    expect(after.board[sq(0, 3)]).toBe(2)
    expect(after.ids[sq(0, 3)]).toBe(s.ids[sq(2, 1)])
  })
  it('loses when blocked', () => {
    const s = empty()
    s.board[sq(0, 1)] = 3
    s.board[sq(1, 0)] = 1
    s.board[sq(1, 2)] = 1
    s.board[sq(2, 3)] = 1
    s.board[sq(7, 6)] = 1
    s.turn = 0
    const after = applyMove(s, { path: [sq(7, 6), sq(6, 7)], captures: [] })
    expect(after.over).toBe(true)
    expect(after.winner).toBe(0)
  })
  it('lists jumped squares', () => {
    expect(jumpedAlong([sq(7, 0), sq(5, 2), sq(3, 4)])).toEqual([sq(6, 1), sq(4, 3)])
  })
})

describe('checkers AI', () => {
  it('takes the bigger multi-capture', () => {
    const s = empty()
    s.turn = 1
    s.board[sq(0, 1)] = 3
    s.board[sq(1, 2)] = 1
    s.board[sq(3, 4)] = 1
    s.board[sq(0, 5)] = 3
    s.board[sq(1, 6)] = 1
    s.board[sq(7, 0)] = 1
    for (const d of ['normal', 'hard'] as const) expect(aiMove(s, d, mulberry32(1), 200)!.captures.length).toBe(2)
  })
  // Search is time-limited, so outcomes vary with machine speed; hard must at least never lose.
  it('hard never loses to easy', () => {
    const rng = mulberry32(11)
    for (const hardSide of [0, 1]) {
      let s = initialState()
      while (!s.over) s = applyMove(s, aiMove(s, s.turn === hardSide ? 'hard' : 'easy', rng, 40)!)
      expect(s.winner).not.toBe(1 - hardSide)
    }
  }, 30000)
})
