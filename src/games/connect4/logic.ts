import type { Difficulty } from '../../lib/types'
import { WIN, searchBest, type SearchGame } from '../othello/search'

export const COLS = 7
export const ROWS = 6
/** 0 empty, 1 = player 0 (first), 2 = player 1. Index = row * COLS + col, row 0 is the top. */
export type Cell = 0 | 1 | 2

export interface C4State {
  board: Cell[]
  turn: 0 | 1
  last: number | null
  winLine: number[] | null
  over: boolean
  moveNo: number
}

export function initialState(): C4State {
  return { board: Array(ROWS * COLS).fill(0), turn: 0, last: null, winLine: null, over: false, moveNo: 0 }
}

// All 69 windows of four.
export const WINDOWS: number[][] = (() => {
  const out: number[][] = []
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of dirs) {
        const er = r + dr * 3
        const ec = c + dc * 3
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue
        out.push([0, 1, 2, 3].map((k) => (r + dr * k) * COLS + c + dc * k))
      }
  return out
})()

const WINDOWS_AT: number[][][] = Array.from({ length: ROWS * COLS }, (_, i) => WINDOWS.filter((w) => w.includes(i)))

/** Row where a disc dropped in `col` lands, or -1 if the column is full. */
export function dropRow(board: Cell[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === 0) return r
  return -1
}

export function legalCols(board: Cell[]): number[] {
  return [3, 2, 4, 1, 5, 0, 6].filter((c) => board[c] === 0)
}

function winningLine(board: Cell[], idx: number): number[] | null {
  const color = board[idx]
  const cells = new Set<number>()
  for (const w of WINDOWS_AT[idx]) if (w.every((i) => board[i] === color)) w.forEach((i) => cells.add(i))
  return cells.size ? [...cells] : null
}

export function applyMove(s: C4State, col: number): C4State {
  const r = dropRow(s.board, col)
  if (r < 0 || s.over) return s
  const idx = r * COLS + col
  const board = s.board.slice()
  board[idx] = s.turn === 0 ? 1 : 2
  const winLine = winningLine(board, idx)
  const full = board.slice(0, COLS).every((c) => c !== 0)
  return {
    board,
    turn: winLine ? s.turn : ((1 - s.turn) as 0 | 1),
    last: idx,
    winLine,
    over: !!winLine || full,
    moveNo: s.moveNo + 1,
  }
}

/** Winner player index, -1 for draw, null if not over. */
export function winner(s: C4State): number | null {
  if (!s.over) return null
  return s.winLine ? s.board[s.winLine[0]] - 1 : -1
}

// ---------- AI ----------

function evaluate(s: C4State): number {
  const me: Cell = s.turn === 0 ? 1 : 2
  if (s.over) {
    if (!s.winLine) return 0
    // On a win, `turn` stays with the winner, so the side "to move" is the winner.
    return s.board[s.winLine[0]] === me ? WIN : -WIN
  }
  const b = s.board
  let v = 0
  for (const w of WINDOWS) {
    let mine = 0
    let theirs = 0
    for (const i of w) {
      const c = b[i]
      if (c === me) mine++
      else if (c !== 0) theirs++
    }
    if (mine && theirs) continue
    if (mine === 3) v += 60
    else if (mine === 2) v += 8
    else if (mine === 1) v += 1
    else if (theirs === 3) v -= 70
    else if (theirs === 2) v -= 8
    else if (theirs === 1) v -= 1
  }
  for (let r = 0; r < ROWS; r++) {
    const c = b[r * COLS + 3]
    if (c) v += c === me ? 6 : -6
  }
  return v + 10 // tempo
}

const game: SearchGame<C4State, number> = {
  moves: (s) => (s.over ? [] : legalCols(s.board)),
  play: applyMove,
  // After a win the winner keeps `turn`; treat the finished position as the loser to move.
  turn: (s) => (s.winLine ? 1 - s.turn : s.turn),
  evaluate: (s) => (s.winLine ? -WIN : evaluate(s)),
}

export function aiMove(s: C4State, diff: Difficulty, rng: () => number = Math.random, timeMs = 900): number | null {
  if (s.over) return null
  const opts =
    diff === 'easy'
      ? { maxDepth: 1, noise: 120, rng }
      : diff === 'normal'
        ? { maxDepth: 4, timeMs: 400, noise: 15, rng }
        : { maxDepth: 42, timeMs, rng }
  return searchBest(game, s, opts)?.move ?? null
}
