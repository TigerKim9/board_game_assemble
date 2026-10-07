import type { Difficulty } from '../../lib/types'
import { WIN, searchBest, type SearchGame } from './search'

export const N = 8
/** 0 = empty, 1 = black (player 0, moves first), 2 = white (player 1). */
export type Cell = 0 | 1 | 2

export interface OthelloState {
  board: Cell[]
  /** Player index to move: 0 = black, 1 = white. */
  turn: 0 | 1
  last: number | null
  flipped: number[]
  /** Set when the player who should have moved had to pass. */
  passed: 0 | 1 | null
  over: boolean
  moveNo: number
}

const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9]

export const colorOf = (turn: number): Cell => (turn === 0 ? 1 : 2)

export function initialState(): OthelloState {
  const board: Cell[] = Array(64).fill(0)
  board[27] = 2
  board[28] = 1
  board[35] = 1
  board[36] = 2
  return { board, turn: 0, last: null, flipped: [], passed: null, over: false, moveNo: 0 }
}

/** Squares flipped if `color` plays at idx (empty array = illegal). */
export function flipsFor(board: Cell[], idx: number, color: Cell): number[] {
  if (board[idx] !== 0) return []
  const opp = color === 1 ? 2 : 1
  const out: number[] = []
  const r0 = idx >> 3
  const c0 = idx & 7
  for (const d of DIRS) {
    const dr = d < -1 ? -1 : d > 1 ? 1 : 0
    const dc = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0
    let r = r0 + dr
    let c = c0 + dc
    const line: number[] = []
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
      line.push(r * 8 + c)
      r += dr
      c += dc
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) out.push(...line)
  }
  return out
}

export function legalMoves(board: Cell[], color: Cell): number[] {
  const out: number[] = []
  for (let i = 0; i < 64; i++) if (board[i] === 0 && hasFlip(board, i, color)) out.push(i)
  return out
}

function hasFlip(board: Cell[], idx: number, color: Cell): boolean {
  const opp = color === 1 ? 2 : 1
  const r0 = idx >> 3
  const c0 = idx & 7
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      let r = r0 + dr
      let c = c0 + dc
      let n = 0
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
        r += dr
        c += dc
        n++
      }
      if (n && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) return true
    }
  return false
}

export function counts(board: Cell[]): [number, number] {
  let b = 0
  let w = 0
  for (const v of board) {
    if (v === 1) b++
    else if (v === 2) w++
  }
  return [b, w]
}

/** Plays a move for the side to move; handles automatic passes and game end. */
export function applyMove(s: OthelloState, idx: number): OthelloState {
  const color = colorOf(s.turn)
  const fl = flipsFor(s.board, idx, color)
  if (!fl.length) return s
  const board = s.board.slice()
  board[idx] = color
  for (const f of fl) board[f] = color
  const next = (1 - s.turn) as 0 | 1
  let turn = next
  let passed: 0 | 1 | null = null
  let over = false
  if (!legalMoves(board, colorOf(next)).length) {
    if (legalMoves(board, color).length) {
      turn = s.turn
      passed = next
    } else over = true
  }
  return { board, turn, last: idx, flipped: fl, passed, over, moveNo: s.moveNo + 1 }
}

/** 0 / 1 = winner player index, -1 = draw. */
export function winner(s: OthelloState): number {
  const [b, w] = counts(s.board)
  return b > w ? 0 : w > b ? 1 : -1
}

// ---------- AI ----------

const W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]
const CORNERS: [number, number[]][] = [
  [0, [1, 8, 9]],
  [7, [6, 15, 14]],
  [56, [57, 48, 49]],
  [63, [62, 55, 54]],
]

function positional(board: Cell[], me: Cell): number {
  let v = 0
  for (let i = 0; i < 64; i++) {
    const c = board[i]
    if (c) v += c === me ? W[i] : -W[i]
  }
  // Squares next to an occupied corner are no longer dangerous.
  for (const [corner, adj] of CORNERS) {
    if (!board[corner]) continue
    for (const a of adj) {
      const c = board[a]
      if (c) v += (c === me ? 1 : -1) * (-W[a] + 8)
    }
  }
  return v
}

function evaluate(s: OthelloState): number {
  const me = colorOf(s.turn)
  const [b, w] = counts(s.board)
  const diff = me === 1 ? b - w : w - b
  if (s.over) return diff > 0 ? WIN + diff : diff < 0 ? -WIN + diff : 0
  const opp: Cell = me === 1 ? 2 : 1
  const myMob = legalMoves(s.board, me).length
  const opMob = legalMoves(s.board, opp).length
  const empties = 64 - b - w
  let v = positional(s.board, me)
  v += (myMob - opMob) * 8
  if (empties < 14) v += diff * (14 - empties)
  return v
}

const ORDER = Array.from({ length: 64 }, (_, i) => i).sort((a, b) => W[b] - W[a])

const game: SearchGame<OthelloState, number> = {
  moves: (s) => {
    if (s.over) return []
    const color = colorOf(s.turn)
    return ORDER.filter((i) => s.board[i] === 0 && hasFlip(s.board, i, color))
  },
  play: applyMove,
  turn: (s) => s.turn,
  evaluate,
}

export function aiMove(
  s: OthelloState,
  diff: Difficulty,
  rng: () => number = Math.random,
  timeMs = 850,
): number | null {
  if (s.over) return null
  const empties = s.board.filter((c) => c === 0).length
  if (diff === 'easy') {
    const r = searchBest(game, s, { maxDepth: 1, noise: 90, rng })
    return r?.move ?? null
  }
  if (diff === 'normal') {
    const r = searchBest(game, s, { maxDepth: 3, timeMs: 400, noise: 12, rng })
    return r?.move ?? null
  }
  const exact = empties <= 14
  const r = searchBest(game, s, { maxDepth: exact ? empties : 10, timeMs, rng })
  return r?.move ?? null
}
