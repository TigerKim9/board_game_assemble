import { shuffle } from '../../lib/random'

export type LevelId = 'beginner' | 'intermediate' | 'expert'

export interface Level {
  id: LevelId
  name: string
  w: number
  h: number
  mines: number
}

export const LEVELS: Level[] = [
  { id: 'beginner', name: '초급', w: 9, h: 9, mines: 10 },
  { id: 'intermediate', name: '중급', w: 16, h: 16, mines: 40 },
  { id: 'expert', name: '고급', w: 30, h: 16, mines: 99 },
]

export type Status = 'ready' | 'playing' | 'won' | 'lost'

export interface Board {
  w: number
  h: number
  mines: number
  /** Mine layout; all false until the first click places the mines. */
  mine: boolean[]
  /** Number of adjacent mines per cell. */
  adj: number[]
  open: boolean[]
  flag: boolean[]
  status: Status
  /** Cell that blew up (or -1). */
  exploded: number
}

export function newBoard(w: number, h: number, mines: number): Board {
  const n = w * h
  return {
    w,
    h,
    mines,
    mine: Array(n).fill(false),
    adj: Array(n).fill(0),
    open: Array(n).fill(false),
    flag: Array(n).fill(false),
    status: 'ready',
    exploded: -1,
  }
}

export function neighbors(i: number, w: number, h: number): number[] {
  const x = i % w
  const y = (i - x) / w
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
    }
  return out
}

export function computeAdj(mine: boolean[], w: number, h: number): number[] {
  return mine.map((_, i) => neighbors(i, w, h).filter((j) => mine[j]).length)
}

/** Random layout with the 3×3 area around `safe` kept free of mines (when the board allows it). */
export function randomLayout(w: number, h: number, mines: number, safe: number, rng: () => number = Math.random): boolean[] {
  const n = w * h
  const keepOut = new Set([safe, ...neighbors(safe, w, h)])
  let candidates = Array.from({ length: n }, (_, i) => i).filter((i) => !keepOut.has(i))
  if (candidates.length < mines) candidates = Array.from({ length: n }, (_, i) => i).filter((i) => i !== safe)
  const chosen = shuffle(candidates, rng).slice(0, mines)
  const mine = Array(n).fill(false)
  for (const i of chosen) mine[i] = true
  return mine
}

/**
 * Logical solver used for "no guessing" boards: starting from the first click, can every safe cell
 * be opened using only single-cell rules, subset rules between neighbouring numbers and the global mine count?
 */
export function solvableWithoutGuessing(mine: boolean[], w: number, h: number, start: number): boolean {
  const n = w * h
  const adj = computeAdj(mine, w, h)
  const total = mine.filter(Boolean).length
  const open = new Uint8Array(n)
  const flag = new Uint8Array(n)
  let opened = 0
  const safeCount = n - total
  const nb: number[][] = Array.from({ length: n }, (_, i) => neighbors(i, w, h))

  const openCell = (s: number): boolean => {
    if (mine[s]) return false
    const stack = [s]
    while (stack.length) {
      const i = stack.pop()!
      if (open[i] || flag[i]) continue
      open[i] = 1
      opened++
      if (adj[i] === 0) for (const j of nb[i]) if (!open[j]) stack.push(j)
    }
    return true
  }
  openCell(start)

  interface Con {
    cells: number[]
    need: number
  }
  let progress = true
  while (progress && opened < safeCount) {
    progress = false
    const cons: Con[] = []
    for (let i = 0; i < n; i++) {
      if (!open[i] || adj[i] === 0) continue
      const unknown: number[] = []
      let flags = 0
      for (const j of nb[i]) {
        if (flag[j]) flags++
        else if (!open[j]) unknown.push(j)
      }
      if (!unknown.length) continue
      const need = adj[i] - flags
      if (need === 0) {
        for (const j of unknown) openCell(j)
        progress = true
      } else if (need === unknown.length) {
        for (const j of unknown) flag[j] = 1
        progress = true
      } else cons.push({ cells: unknown, need })
    }
    if (progress) continue
    // Subset rule between overlapping constraints.
    const byCell = new Map<number, number[]>()
    cons.forEach((c, k) => c.cells.forEach((cell) => byCell.set(cell, [...(byCell.get(cell) ?? []), k])))
    outer: for (let a = 0; a < cons.length; a++) {
      const A = cons[a]
      const related = new Set<number>()
      for (const cell of A.cells) for (const k of byCell.get(cell) ?? []) if (k !== a) related.add(k)
      for (const b of related) {
        const B = cons[b]
        const setB = new Set(B.cells)
        if (!A.cells.every((c) => setB.has(c))) {
          // Partial overlap: if B's mines outside the overlap must be all of A's need, etc.
          const inter = A.cells.filter((c) => setB.has(c))
          const onlyA = A.cells.filter((c) => !setB.has(c))
          const onlyB = B.cells.filter((c) => !A.cells.includes(c))
          // Max mines in intersection is min(|inter|, B.need); A needs the rest in onlyA.
          const maxInter = Math.min(inter.length, B.need)
          if (A.need - maxInter === onlyA.length && onlyA.length > 0) {
            for (const c of onlyA) flag[c] = 1
            // and then B's outside cells are determined if intersection gets exactly B.need
            if (maxInter === B.need) for (const c of onlyB) openCell(c)
            progress = true
            break outer
          }
          continue
        }
        const diff = B.cells.filter((c) => !A.cells.includes(c))
        if (!diff.length) continue
        const rest = B.need - A.need
        if (rest === 0) {
          for (const c of diff) openCell(c)
          progress = true
          break outer
        }
        if (rest === diff.length) {
          for (const c of diff) flag[c] = 1
          progress = true
          break outer
        }
      }
    }
    if (progress) continue
    // Global mine count.
    let unknownCount = 0
    let flags = 0
    for (let i = 0; i < n; i++) {
      if (flag[i]) flags++
      else if (!open[i]) unknownCount++
    }
    const left = total - flags
    if (unknownCount > 0 && (left === 0 || left === unknownCount)) {
      for (let i = 0; i < n; i++) {
        if (open[i] || flag[i]) continue
        if (left === 0) openCell(i)
        else flag[i] = 1
      }
      progress = true
    }
  }
  return opened === safeCount
}

/** Place mines for a first click at `safe`. With noGuess, retries until the board is logically solvable (within a time budget). */
export function placeMines(
  board: Board,
  safe: number,
  opts: { noGuess?: boolean; rng?: () => number; budgetMs?: number } = {},
): Board {
  const { w, h, mines } = board
  const rng = opts.rng ?? Math.random
  let layout = randomLayout(w, h, mines, safe, rng)
  if (opts.noGuess) {
    const deadline = Date.now() + (opts.budgetMs ?? 1500)
    while (!solvableWithoutGuessing(layout, w, h, safe) && Date.now() < deadline) {
      layout = randomLayout(w, h, mines, safe, rng)
    }
  }
  return { ...board, mine: layout, adj: computeAdj(layout, w, h), status: 'playing' }
}

function finish(b: Board): Board {
  if (b.status !== 'playing') return b
  const won = b.open.every((o, i) => o || b.mine[i])
  if (!won) return b
  // Auto-flag remaining mines on a win.
  return { ...b, status: 'won', flag: b.mine.slice() }
}

/** Open a cell (flood-filling zeros). Opening a mine loses. */
export function reveal(board: Board, i: number, opts?: { noGuess?: boolean; rng?: () => number }): Board {
  let b = board
  if (b.status === 'won' || b.status === 'lost') return b
  if (b.open[i] || b.flag[i]) return b
  if (b.status === 'ready') b = placeMines(b, i, opts)
  if (b.mine[i]) {
    return { ...b, open: b.open.map((o, j) => o || j === i), status: 'lost', exploded: i }
  }
  const open = b.open.slice()
  const stack = [i]
  while (stack.length) {
    const c = stack.pop()!
    if (open[c] || b.flag[c]) continue
    open[c] = true
    if (b.adj[c] === 0) for (const j of neighbors(c, b.w, b.h)) if (!open[j] && !b.mine[j]) stack.push(j)
  }
  return finish({ ...b, open })
}

export function toggleFlag(board: Board, i: number): Board {
  if (board.status !== 'playing' && board.status !== 'ready') return board
  if (board.open[i]) return board
  const flag = board.flag.slice()
  flag[i] = !flag[i]
  return { ...board, flag }
}

/** Chord: on an opened number whose flags are all placed, open every other neighbour. */
export function chord(board: Board, i: number): Board {
  if (board.status !== 'playing' || !board.open[i] || board.adj[i] === 0) return board
  const nb = neighbors(i, board.w, board.h)
  const flags = nb.filter((j) => board.flag[j]).length
  if (flags !== board.adj[i]) return board
  let b = board
  for (const j of nb) {
    if (b.flag[j] || b.open[j]) continue
    if (b.mine[j]) {
      // Wrong flag somewhere: this opens a mine.
      return { ...b, open: b.open.map((o, k) => o || k === j), status: 'lost', exploded: j }
    }
    b = reveal(b, j)
  }
  return b
}

export function canChord(board: Board, i: number): boolean {
  if (board.status !== 'playing' || !board.open[i] || board.adj[i] === 0) return false
  const nb = neighbors(i, board.w, board.h)
  return nb.some((j) => !board.open[j] && !board.flag[j]) && nb.filter((j) => board.flag[j]).length === board.adj[i]
}

export function flagsUsed(board: Board): number {
  return board.flag.filter(Boolean).length
}

/** Swap rows and columns (used to show the 30×16 expert board upright on phones). */
export function transposeLevel(level: Level): Level {
  return { ...level, w: level.h, h: level.w }
}
