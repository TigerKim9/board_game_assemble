import type { Difficulty } from '../../lib/types'
import { WIN, searchBest, type SearchGame } from '../othello/search'

// English draughts (영미식 체커): 8×8, men move/capture diagonally forward only, kings one step any diagonal,
// capturing is mandatory, multi-jumps must be completed, a man reaching the far row is crowned (ends the move).

/** 0 empty, 1 = player 0 man, 2 = player 0 king, 3 = player 1 man, 4 = player 1 king. */
export type Piece = 0 | 1 | 2 | 3 | 4

export interface Move {
  /** Start square followed by every landing square. */
  path: number[]
  captures: number[]
}

export interface CheckersState {
  board: Piece[]
  /** Stable piece ids for animations (0 on empty squares). */
  ids: number[]
  turn: 0 | 1
  last: Move | null
  over: boolean
  /** Winner index, -1 draw, null while playing. */
  winner: number | null
  /** Plies since the last capture or man move (draw at DRAW_PLIES). */
  quiet: number
  moveNo: number
}

export const DRAW_PLIES = 80

export const ownerOf = (p: Piece): number => (p === 0 ? -1 : p <= 2 ? 0 : 1)
export const isKing = (p: Piece) => p === 2 || p === 4
export const isDark = (i: number) => ((i >> 3) + (i & 7)) % 2 === 1

export function initialState(): CheckersState {
  const board: Piece[] = Array(64).fill(0)
  const ids: number[] = Array(64).fill(0)
  let id = 1
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue
    const r = i >> 3
    if (r <= 2) {
      board[i] = 3
      ids[i] = id++
    } else if (r >= 5) {
      board[i] = 1
      ids[i] = id++
    }
  }
  return { board, ids, turn: 0, last: null, over: false, winner: null, quiet: 0, moveNo: 0 }
}

function dirsFor(p: Piece): [number, number][] {
  if (isKing(p))
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]
  return p === 1
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ]
}

const promoRow = (p: Piece) => (p === 1 ? 0 : p === 3 ? 7 : -1)

function jumpsFrom(board: Piece[], from: number, piece: Piece, path: number[], caps: number[], out: Move[]) {
  const r = from >> 3
  const c = from & 7
  let extended = false
  for (const [dr, dc] of dirsFor(piece)) {
    const mr = r + dr
    const mc = c + dc
    const lr = r + 2 * dr
    const lc = c + 2 * dc
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue
    const mid = mr * 8 + mc
    const land = lr * 8 + lc
    const mp = board[mid]
    if (mp === 0 || ownerOf(mp) === ownerOf(piece) || board[land] !== 0) continue
    extended = true
    const nb = board.slice()
    nb[from] = 0
    nb[mid] = 0
    nb[land] = piece
    if (lr === promoRow(piece)) out.push({ path: [...path, land], captures: [...caps, mid] })
    else jumpsFrom(nb, land, piece, [...path, land], [...caps, mid], out)
  }
  if (!extended && caps.length) out.push({ path, captures: caps })
}

export function legalMoves(board: Piece[], turn: number): Move[] {
  const caps: Move[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (p && ownerOf(p) === turn) jumpsFrom(board, i, p, [i], [], caps)
  }
  if (caps.length) return caps
  const out: Move[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p || ownerOf(p) !== turn) continue
    const r = i >> 3
    const c = i & 7
    for (const [dr, dc] of dirsFor(p)) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue
      const t = nr * 8 + nc
      if (board[t] === 0) out.push({ path: [i, t], captures: [] })
    }
  }
  return out
}

export function applyMove(s: CheckersState, m: Move): CheckersState {
  const board = s.board.slice()
  const ids = s.ids.slice()
  const from = m.path[0]
  const to = m.path[m.path.length - 1]
  let piece = board[from]
  const wasMan = !isKing(piece)
  board[from] = 0
  const id = ids[from]
  ids[from] = 0
  for (const c of m.captures) {
    board[c] = 0
    ids[c] = 0
  }
  if (to >> 3 === promoRow(piece)) piece = piece === 1 ? 2 : 4
  board[to] = piece
  ids[to] = id
  const next = (1 - s.turn) as 0 | 1
  const quiet = m.captures.length || wasMan ? 0 : s.quiet + 1
  let over = false
  let winner: number | null = null
  if (legalMoves(board, next).length === 0) {
    over = true
    winner = s.turn
  } else if (quiet >= DRAW_PLIES) {
    over = true
    winner = -1
  }
  return { board, ids, turn: next, last: m, over, winner, quiet, moveNo: s.moveNo + 1 }
}

export function pieceCounts(board: Piece[]): [number, number] {
  let a = 0
  let b = 0
  for (const p of board) {
    if (p === 1 || p === 2) a++
    else if (p) b++
  }
  return [a, b]
}

// ---------- AI ----------

function evaluate(s: CheckersState): number {
  const me = s.turn
  if (s.over) return s.winner === -1 ? 0 : s.winner === me ? WIN : -WIN
  let mine = 0
  let theirs = 0
  let pos = 0
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]
    if (!p) continue
    const r = i >> 3
    const c = i & 7
    let v = isKing(p) ? 170 : 100
    if (!isKing(p)) {
      const adv = p === 1 ? 7 - r : r // rows advanced
      v += adv * 3
      if (adv === 0) v += 6 // back-row guard
    } else {
      v += 4 - Math.abs(3.5 - c) - Math.abs(3.5 - r) // kings like the centre
    }
    if (c === 0 || c === 7) v -= 3
    if (ownerOf(p) === me) {
      mine += isKing(p) ? 170 : 100
      pos += v
    } else {
      theirs += isKing(p) ? 170 : 100
      pos -= v
    }
  }
  // Encourage trading down when ahead.
  const total = mine + theirs
  const diff = mine - theirs
  return pos + Math.round((diff * 600) / (total + 400))
}

const game: SearchGame<CheckersState, Move> = {
  moves: (s) => {
    if (s.over) return []
    const ms = legalMoves(s.board, s.turn)
    // Bigger captures first.
    return ms.length > 1 ? ms.sort((a, b) => b.captures.length - a.captures.length) : ms
  },
  play: applyMove,
  turn: (s) => s.turn,
  evaluate,
  quiet: (s) => s.over || legalMoves(s.board, s.turn).every((m) => m.captures.length === 0),
}

export function aiMove(s: CheckersState, diff: Difficulty, rng: () => number = Math.random, timeMs = 900): Move | null {
  if (s.over) return null
  const opts =
    diff === 'easy'
      ? { maxDepth: 2, noise: 90, rng }
      : diff === 'normal'
        ? { maxDepth: 4, timeMs: 400, noise: 12, rng, quiescence: 4 }
        : { maxDepth: 30, timeMs, rng, quiescence: 8 }
  return searchBest(game, s, opts)?.move ?? null
}

/** Squares between consecutive path points that were jumped so far. */
export function jumpedAlong(path: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (Math.abs((a >> 3) - (b >> 3)) === 2) out.push((a + b) / 2)
  }
  return out
}
