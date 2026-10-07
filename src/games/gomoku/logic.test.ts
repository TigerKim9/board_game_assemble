import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { SIZE, aiMove, analyze, applyMove, findVCF, initialState, isForbidden, winner, type GomokuState, type Stone } from './logic'

const at = (r: number, c: number) => r * SIZE + c
/** Build a position from black/white coordinate lists; turn = side to move. */
function pos(black: [number, number][], white: [number, number][], turn: 0 | 1, rule: 'free' | 'renju' = 'free'): GomokuState {
  const s = initialState(rule)
  const board = s.board.slice()
  for (const [r, c] of black) board[at(r, c)] = 1
  for (const [r, c] of white) board[at(r, c)] = 2
  return { ...s, board, turn, moveNo: black.length + white.length }
}

describe('gomoku rules', () => {
  it('five in a row wins, overline too (free-style)', () => {
    const s = pos([[7, 3], [7, 4], [7, 5], [7, 6]], [[0, 0], [0, 1], [0, 2], [0, 3]], 0)
    const w = applyMove(s, at(7, 7))
    expect(winner(w)).toBe(0)
    expect(w.winLine!.length).toBe(5)
    const o = pos([[7, 3], [7, 4], [7, 6], [7, 7], [7, 8]], [[0, 0], [0, 1], [0, 2], [0, 3]], 0)
    expect(winner(applyMove(o, at(7, 5)))).toBe(0)
  })
  it('detects diagonal wins and ignores occupied points', () => {
    const s = pos([[1, 1], [2, 2], [3, 3], [4, 4]], [[0, 5], [0, 6], [0, 7], [9, 9]], 0)
    expect(applyMove(s, at(1, 1))).toBe(s)
    expect(winner(applyMove(s, at(5, 5)))).toBe(0)
  })
  it('classifies threats', () => {
    const b = initialState().board as Stone[]
    b[at(7, 5)] = 1
    b[at(7, 6)] = 1
    b[at(7, 7)] = 1
    expect(analyze(b, at(7, 8), 1).open4).toBe(1)
    b[at(7, 4)] = 2
    expect(analyze(b, at(7, 8), 1).four).toBe(1)
    const b2 = initialState().board as Stone[]
    b2[at(7, 5)] = 1
    b2[at(7, 6)] = 1
    expect(analyze(b2, at(7, 7), 1).open3).toBe(1)
    expect(analyze(b2, at(7, 8), 1).open3).toBe(1) // split three _XX_X_
  })
  it('renju-lite forbids black double-three', () => {
    const s = pos([[7, 5], [7, 6], [5, 7], [6, 7]], [[0, 0], [0, 14], [14, 0], [14, 14]], 0, 'renju')
    expect(isForbidden(s, at(7, 7), 1)).toBe(true)
    expect(applyMove(s, at(7, 7))).toBe(s)
    expect(isForbidden({ ...s, rule: 'free' }, at(7, 7), 1)).toBe(false)
  })
})

describe('gomoku AI', () => {
  const rng = mulberry32(3)
  it('wins when it can', () => {
    const s = pos([[7, 3], [7, 4], [7, 5], [7, 6]], [[8, 3], [8, 4], [8, 5], [9, 9]], 0)
    for (const d of ['easy', 'normal', 'hard'] as const) expect([at(7, 2), at(7, 7)]).toContain(aiMove(s, d, rng, 300))
  })
  it('blocks a four', () => {
    const s = pos([[7, 3], [7, 4], [7, 5], [7, 6], [0, 0]], [[8, 3], [8, 4], [10, 10], [7, 2]], 1)
    for (const d of ['normal', 'hard'] as const) expect(aiMove(s, d, rng, 300)).toBe(at(7, 7))
  })
  it('blocks an open three', () => {
    const s = pos([[7, 5], [7, 6], [7, 7]], [[8, 8], [9, 2]], 1)
    for (const d of ['normal', 'hard'] as const) expect([at(7, 4), at(7, 8), at(7, 3), at(7, 9)]).toContain(aiMove(s, d, rng, 300))
  })
  it('makes an open four instead of defending', () => {
    const s = pos([[7, 5], [7, 6], [7, 7], [3, 3]], [[9, 5], [9, 6], [9, 7], [0, 0]], 1)
    for (const d of ['normal', 'hard'] as const) expect([at(9, 4), at(9, 8)]).toContain(aiMove(s, d, rng, 300))
  })
  it('finds a VCF', () => {
    // White: broken shapes that win by consecutive fours: (5,5)(5,6)(5,7) closed by black at (5,4);
    // and (6,8)(7,8)(8,8) closed by black at (9,8). Playing (5,8) makes a four and a four → wins.
    const s = pos([[5, 4], [9, 8], [0, 0], [0, 14], [14, 0]], [[5, 5], [5, 6], [5, 7], [6, 8], [7, 8], [8, 8]], 1)
    const v = findVCF(s.board, 2, 8, Date.now() + 1000)
    expect(v).not.toBeNull()
    expect(aiMove(s, 'hard', rng, 500)).toBe(at(5, 8))
  })
  it('hard beats easy', () => {
    const r = mulberry32(9)
    for (const hardSide of [0, 1]) {
      let s = initialState()
      while (!s.over) s = applyMove(s, aiMove(s, s.turn === hardSide ? 'hard' : 'easy', r, 100)!)
      expect(winner(s)).toBe(hardSide)
    }
  }, 60000)
})
