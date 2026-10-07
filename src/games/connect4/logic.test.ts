import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { WINDOWS, aiMove, applyMove, initialState, winner, type C4State } from './logic'

const playAll = (cols: number[], s: C4State = initialState()) => cols.reduce((st, c) => applyMove(st, c), s)

describe('connect4 rules', () => {
  it('has 69 windows', () => expect(WINDOWS.length).toBe(69))
  it('drops discs to the bottom and stacks', () => {
    const s = playAll([3, 3])
    expect(s.board[5 * 7 + 3]).toBe(1)
    expect(s.board[4 * 7 + 3]).toBe(2)
    expect(s.last).toBe(4 * 7 + 3)
  })
  it('detects horizontal, vertical and diagonal wins', () => {
    expect(winner(playAll([0, 0, 1, 1, 2, 2, 3]))).toBe(0)
    expect(winner(playAll([6, 0, 6, 0, 6, 0, 5, 0]))).toBe(1)
    // diagonal /
    const d = playAll([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])
    expect(winner(d)).toBe(0)
    expect(d.winLine!.length).toBe(4)
  })
  it('ignores full columns', () => {
    const s = playAll([0, 0, 0, 0, 0, 0])
    expect(applyMove(s, 0)).toBe(s)
  })
  it('detects a draw on a full board', () => {
    // Column pattern that fills the board without four in a row.
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6]
    const s = playAll(order)
    expect(s.over).toBe(true)
    expect(winner(s)).toBe(-1)
  })
})

describe('connect4 AI', () => {
  it('wins immediately and blocks immediate threats', () => {
    const s = playAll([0, 6, 1, 6, 2]) // player 0 threatens col 3, player 1 to move
    expect(aiMove(s, 'normal', mulberry32(1))).toBe(3)
    expect(aiMove(s, 'hard', mulberry32(1), 200)).toBe(3)
    const s2 = playAll([0, 6, 1, 6, 2, 6]) // player 0 to move, can win at 3
    expect(aiMove(s2, 'easy', mulberry32(1))).toBe(3)
  })
  it('hard beats easy', () => {
    const rng = mulberry32(3)
    for (const hardSide of [0, 1]) {
      let s = initialState()
      while (!s.over) s = applyMove(s, aiMove(s, s.turn === hardSide ? 'hard' : 'easy', rng, 60)!)
      expect(winner(s)).toBe(hardSide)
    }
  }, 20000)
})
