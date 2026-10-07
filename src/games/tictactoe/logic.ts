import type { Difficulty } from '../../lib/types'
import { WIN, searchBest, type SearchGame } from '../othello/search'

/** 0 empty, 1 = player 0 (⭕), 2 = player 1 (✕). */
export type Cell = 0 | 1 | 2

export interface TttState {
  board: Cell[]
  turn: 0 | 1
  last: number | null
  winLine: number[] | null
  over: boolean
}

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function initialState(first: 0 | 1 = 0): TttState {
  return { board: Array(9).fill(0), turn: first, last: null, winLine: null, over: false }
}

export function findWin(board: Cell[]): number[] | null {
  for (const l of LINES) if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]) return l
  return null
}

export function applyMove(s: TttState, i: number): TttState {
  if (s.over || s.board[i] !== 0) return s
  const board = s.board.slice()
  board[i] = s.turn === 0 ? 1 : 2
  const winLine = findWin(board)
  const full = board.every((c) => c !== 0)
  return { board, turn: (1 - s.turn) as 0 | 1, last: i, winLine, over: !!winLine || full }
}

/** Winner index, -1 draw, null ongoing. */
export function winner(s: TttState): number | null {
  if (!s.over) return null
  return s.winLine ? s.board[s.winLine[0]] - 1 : -1
}

export const emptyCells = (b: Cell[]) => b.flatMap((c, i) => (c === 0 ? [i] : []))

const game: SearchGame<TttState, number> = {
  // Center and corners first.
  moves: (s) => (s.over ? [] : [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => s.board[i] === 0)),
  play: applyMove,
  turn: (s) => s.turn,
  // After a win, the side to move is the loser.
  evaluate: (s) => (s.winLine ? -WIN : 0),
}

/** Cell that wins immediately for `color`, if any. */
function winningCell(b: Cell[], color: Cell): number | null {
  for (const i of emptyCells(b)) {
    const nb = b.slice()
    nb[i] = color
    if (findWin(nb)) return i
  }
  return null
}

export function aiMove(s: TttState, diff: Difficulty, rng: () => number = Math.random): number | null {
  if (s.over) return null
  const empties = emptyCells(s.board)
  const me: Cell = s.turn === 0 ? 1 : 2
  const opp: Cell = me === 1 ? 2 : 1
  const random = () => empties[Math.floor(rng() * empties.length)]
  if (diff === 'easy') {
    const w = winningCell(s.board, me)
    if (w != null && rng() < 0.6) return w
    const b = winningCell(s.board, opp)
    if (b != null && rng() < 0.35) return b
    return random()
  }
  if (diff === 'normal') {
    const w = winningCell(s.board, me)
    if (w != null) return w
    const b = winningCell(s.board, opp)
    if (b != null) return b
    if (rng() < 0.55) return searchBest(game, s, { maxDepth: 9, noise: 0.5, rng })!.move
    return random()
  }
  // Perfect play; noise only breaks ties between equally good moves.
  return searchBest(game, s, { maxDepth: 9, noise: 0.5, rng })!.move
}
