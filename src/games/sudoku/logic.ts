import { shuffle } from '../../lib/random'

/** 81 cells, row-major, 0 = empty. */
export type Grid = number[]

export type Level = 'easy' | 'normal' | 'hard' | 'expert'

export const LEVELS: { id: Level; name: string; desc: string }[] = [
  { id: 'easy', name: '쉬움', desc: '단서가 넉넉하고, 들어갈 숫자가 하나뿐인 칸만 찾으면 돼요' },
  { id: 'normal', name: '보통', desc: '단서가 적어요. 줄·박스에서 숫자가 갈 곳을 찾아보세요' },
  { id: 'hard', name: '어려움', desc: '후보 지우기(고정 후보, 쌍 찾기)가 필요해요' },
  { id: 'expert', name: '전문가', desc: 'X-윙, XY-윙 같은 고급 기술이 필요해요' },
]

export const ROW = (i: number) => Math.floor(i / 9)
export const COL = (i: number) => i % 9
export const BOX = (i: number) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3)

/** 27 units: 9 rows, 9 columns, 9 boxes. */
export const UNITS: number[][] = (() => {
  const u: number[][] = []
  for (let r = 0; r < 9; r++) u.push(Array.from({ length: 9 }, (_, c) => r * 9 + c))
  for (let c = 0; c < 9; c++) u.push(Array.from({ length: 9 }, (_, r) => r * 9 + c))
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3
    const c0 = (b % 3) * 3
    u.push(Array.from({ length: 9 }, (_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)))
  }
  return u
})()

export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>()
  for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j)
  return [...s]
})

export const ALL = 0b1111111110 // bits 1..9

export function popcount(m: number): number {
  let c = 0
  while (m) {
    m &= m - 1
    c++
  }
  return c
}
export const digitsOf = (m: number): number[] => {
  const out: number[] = []
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d)
  return out
}

/** Candidate masks implied by the givens (0 for filled cells). */
export function candidates(grid: Grid): number[] {
  return grid.map((v, i) => {
    if (v) return 0
    let m = ALL
    for (const p of PEERS[i]) if (grid[p]) m &= ~(1 << grid[p])
    return m
  })
}

/** Count solutions up to `limit` (backtracking with minimum-remaining-values). */
export function countSolutions(grid: Grid, limit = 2): number {
  const g = grid.slice()
  let count = 0
  const rec = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestCount = 10
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue
      let m = ALL
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p])
      const c = popcount(m)
      if (c === 0) return false
      if (c < bestCount) {
        best = i
        bestMask = m
        bestCount = c
        if (c === 1) break
      }
    }
    if (best < 0) {
      count++
      return count >= limit
    }
    for (let d = 1; d <= 9; d++) {
      if (!(bestMask & (1 << d))) continue
      g[best] = d
      if (rec()) return true
    }
    g[best] = 0
    return false
  }
  rec()
  return count
}

export function solve(grid: Grid): Grid | null {
  const g = grid.slice()
  const rec = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestCount = 10
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue
      let m = ALL
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p])
      const c = popcount(m)
      if (c === 0) return false
      if (c < bestCount) {
        best = i
        bestMask = m
        bestCount = c
      }
    }
    if (best < 0) return true
    for (let d = 1; d <= 9; d++) {
      if (!(bestMask & (1 << d))) continue
      g[best] = d
      if (rec()) return true
    }
    g[best] = 0
    return false
  }
  return rec() ? g : null
}

/** A random complete, valid grid. */
export function randomSolution(rng: () => number = Math.random): Grid {
  const g: Grid = Array(81).fill(0)
  const rec = (i: number): boolean => {
    if (i === 81) return true
    let m = ALL
    for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p])
    for (const d of shuffle(digitsOf(m), rng)) {
      g[i] = d
      if (rec(i + 1)) return true
    }
    g[i] = 0
    return false
  }
  rec(0)
  return g
}

// ---------------------------------------------------------------------------
// Human-style logical solver used for grading and hints.

export type Technique =
  | 'nakedSingle'
  | 'hiddenSingle'
  | 'lockedCandidates'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'xyWing'
  | 'swordfish'

export const TECH_LEVEL: Record<Technique, number> = {
  nakedSingle: 0,
  hiddenSingle: 1,
  lockedCandidates: 2,
  nakedPair: 2,
  hiddenPair: 2,
  nakedTriple: 3,
  hiddenTriple: 3,
  xWing: 3,
  xyWing: 3,
  swordfish: 3,
}

interface SState {
  grid: Grid
  cand: number[]
}

function place(s: SState, i: number, d: number) {
  s.grid[i] = d
  s.cand[i] = 0
  for (const p of PEERS[i]) s.cand[p] &= ~(1 << d)
}

function combos<T>(items: T[], k: number): T[][] {
  const out: T[][] = []
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice())
      return
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i])
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
  return out
}

function nakedSingle(s: SState): boolean {
  for (let i = 0; i < 81; i++) {
    if (!s.grid[i] && popcount(s.cand[i]) === 1) {
      place(s, i, digitsOf(s.cand[i])[0])
      return true
    }
  }
  return false
}

function hiddenSingle(s: SState): boolean {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d
      let pos = -1
      let n = 0
      for (const i of unit) {
        if (s.grid[i] === d) {
          n = 2
          break
        }
        if (s.cand[i] & bit) {
          pos = i
          n++
        }
      }
      if (n === 1) {
        place(s, pos, d)
        return true
      }
    }
  }
  return false
}

function eliminate(s: SState, cells: number[], mask: number): boolean {
  let changed = false
  for (const i of cells) {
    if (s.cand[i] & mask) {
      s.cand[i] &= ~mask
      changed = true
    }
  }
  return changed
}

function lockedCandidates(s: SState): boolean {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << d
    // Pointing: within a box, all candidates on one row/col.
    for (let b = 18; b < 27; b++) {
      const cells = UNITS[b].filter((i) => s.cand[i] & bit)
      if (cells.length < 2) continue
      const r = ROW(cells[0])
      if (cells.every((i) => ROW(i) === r) && eliminate(s, UNITS[r].filter((i) => !cells.includes(i)), bit)) return true
      const c = COL(cells[0])
      if (cells.every((i) => COL(i) === c) && eliminate(s, UNITS[9 + c].filter((i) => !cells.includes(i)), bit)) return true
    }
    // Claiming: within a row/col, all candidates in one box.
    for (let u = 0; u < 18; u++) {
      const cells = UNITS[u].filter((i) => s.cand[i] & bit)
      if (cells.length < 2) continue
      const b = BOX(cells[0])
      if (cells.every((i) => BOX(i) === b) && eliminate(s, UNITS[18 + b].filter((i) => !cells.includes(i)), bit)) return true
    }
  }
  return false
}

function nakedSubset(s: SState, k: number): boolean {
  for (const unit of UNITS) {
    const empty = unit.filter((i) => !s.grid[i])
    if (empty.length <= k) continue
    const pool = empty.filter((i) => popcount(s.cand[i]) <= k)
    if (pool.length < k) continue
    for (const set of combos(pool, k)) {
      const union = set.reduce((m, i) => m | s.cand[i], 0)
      if (popcount(union) !== k) continue
      if (eliminate(s, empty.filter((i) => !set.includes(i)), union)) return true
    }
  }
  return false
}

function hiddenSubset(s: SState, k: number): boolean {
  for (const unit of UNITS) {
    const empty = unit.filter((i) => !s.grid[i])
    if (empty.length <= k) continue
    const digits: number[] = []
    for (let d = 1; d <= 9; d++) {
      const n = empty.filter((i) => s.cand[i] & (1 << d)).length
      if (n >= 2 && n <= k) digits.push(d)
    }
    if (digits.length < k) continue
    for (const ds of combos(digits, k)) {
      const mask = ds.reduce((m, d) => m | (1 << d), 0)
      const cells = empty.filter((i) => s.cand[i] & mask)
      if (cells.length !== k) continue
      let changed = false
      for (const i of cells) {
        if (s.cand[i] & ~mask) {
          s.cand[i] &= mask
          changed = true
        }
      }
      if (changed) return true
    }
  }
  return false
}

function fish(s: SState, size: number): boolean {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << d
    for (const byRow of [true, false]) {
      const lines: { line: number; pos: number[] }[] = []
      for (let l = 0; l < 9; l++) {
        const unit = UNITS[byRow ? l : 9 + l]
        const pos = unit.filter((i) => s.cand[i] & bit).map((i) => (byRow ? COL(i) : ROW(i)))
        if (pos.length >= 2 && pos.length <= size) lines.push({ line: l, pos })
      }
      if (lines.length < size) continue
      for (const set of combos(lines, size)) {
        const cover = new Set(set.flatMap((x) => x.pos))
        if (cover.size !== size) continue
        const baseLines = new Set(set.map((x) => x.line))
        const targets: number[] = []
        for (const c of cover) {
          for (const i of UNITS[byRow ? 9 + c : c]) {
            const line = byRow ? ROW(i) : COL(i)
            if (!baseLines.has(line)) targets.push(i)
          }
        }
        if (eliminate(s, targets, bit)) return true
      }
    }
  }
  return false
}

function xyWing(s: SState): boolean {
  const bivalue = Array.from({ length: 81 }, (_, i) => i).filter((i) => !s.grid[i] && popcount(s.cand[i]) === 2)
  const peerSet = (i: number) => new Set(PEERS[i])
  for (const pivot of bivalue) {
    const [a, b] = digitsOf(s.cand[pivot])
    const wings = PEERS[pivot].filter((p) => bivalue.includes(p))
    for (const x of wings) {
      const mx = s.cand[x]
      if (!(mx & (1 << a)) || mx & (1 << b)) continue
      const c = digitsOf(mx & ~(1 << a))[0]
      for (const y of wings) {
        if (y === x) continue
        if (s.cand[y] !== ((1 << b) | (1 << c))) continue
        const px = peerSet(x)
        const targets = PEERS[y].filter((t) => px.has(t) && t !== pivot)
        if (eliminate(s, targets, 1 << c)) return true
      }
    }
  }
  return false
}

const STEPS: [Technique, (s: SState) => boolean][] = [
  ['nakedSingle', nakedSingle],
  ['hiddenSingle', hiddenSingle],
  ['lockedCandidates', lockedCandidates],
  ['nakedPair', (s) => nakedSubset(s, 2)],
  ['hiddenPair', (s) => hiddenSubset(s, 2)],
  ['nakedTriple', (s) => nakedSubset(s, 3)],
  ['hiddenTriple', (s) => hiddenSubset(s, 3)],
  ['xWing', (s) => fish(s, 2)],
  ['xyWing', xyWing],
  ['swordfish', (s) => fish(s, 3)],
]

export interface Grade {
  solved: boolean
  /** Highest technique level needed (0..3). */
  level: number
  used: Technique[]
}

/** Solve like a human, always using the simplest technique that makes progress. */
export function grade(puzzle: Grid): Grade {
  const s: SState = { grid: puzzle.slice(), cand: candidates(puzzle) }
  let level = 0
  const used = new Set<Technique>()
  while (s.grid.includes(0)) {
    let progressed = false
    for (const [name, fn] of STEPS) {
      if (fn(s)) {
        level = Math.max(level, TECH_LEVEL[name])
        used.add(name)
        progressed = true
        break
      }
    }
    if (!progressed) return { solved: false, level: 4, used: [...used] }
    // A contradiction would mean the puzzle is broken.
    if (s.grid.some((v, i) => !v && s.cand[i] === 0)) return { solved: false, level: 4, used: [...used] }
  }
  return { solved: true, level, used: [...used] }
}

/** Remove clues in random (180° symmetric) order while the solution stays unique. */
export function carve(solution: Grid, rng: () => number, minClues: number): Grid {
  const p = solution.slice()
  let clues = 81
  const order = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rng,
  )
  for (const i of order) {
    if (clues <= minClues) break
    const j = 80 - i
    const a = p[i]
    const b = p[j]
    p[i] = 0
    p[j] = 0
    if (countSolutions(p, 2) !== 1) {
      p[i] = a
      p[j] = b
    } else clues -= i === j ? 1 : 2
  }
  return p
}

export interface Puzzle {
  puzzle: Grid
  solution: Grid
  level: Level
}

function matches(level: Level, g: Grade, clues: number): boolean {
  if (!g.solved) return false
  switch (level) {
    case 'easy':
      return g.level <= 1 && clues >= 36
    case 'normal':
      return g.level === 1 && clues <= 32
    case 'hard':
      return g.level === 2
    case 'expert':
      return g.level === 3
  }
}

/** Generate a puzzle with a unique solution graded to the requested level. */
export function generate(level: Level, rng: () => number = Math.random, budgetMs = 2500): Puzzle {
  const deadline = Date.now() + budgetMs
  const target = { easy: 1, normal: 1, hard: 2, expert: 3 }[level]
  let fallback: Puzzle | null = null
  let fallbackDist = Infinity
  for (;;) {
    const solution = randomSolution(rng)
    const puzzle = carve(solution, rng, level === 'easy' ? 38 : 0)
    const clues = puzzle.filter(Boolean).length
    const g = grade(puzzle)
    if (matches(level, g, clues)) return { puzzle, solution, level }
    // Keep the closest solvable puzzle in case we run out of time.
    const dist = Math.abs(g.level - target)
    if (g.solved && dist < fallbackDist) {
      fallback = { puzzle, solution, level }
      fallbackDist = dist
    }
    if (Date.now() > deadline && fallback) return fallback
  }
}

// ---------------------------------------------------------------------------
// Play helpers

/** Cells whose value clashes with a peer. */
export function conflicts(grid: Grid): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue
    for (const p of PEERS[i]) if (grid[p] === grid[i]) out.add(i)
  }
  return out
}

export function isSolved(grid: Grid, solution: Grid): boolean {
  return grid.every((v, i) => v === solution[i])
}

/** How many of each digit 1..9 are still missing (index 0 unused). */
export function remaining(grid: Grid): number[] {
  const r = Array(10).fill(9)
  r[0] = 0
  for (const v of grid) if (v) r[v]--
  return r
}

export type Hint =
  | { kind: 'wrong'; cell: number }
  | { kind: 'place'; cell: number; value: number; reason: 'nakedSingle' | 'hiddenSingle' | 'reveal'; unit?: 'row' | 'col' | 'box' }

/**
 * Suggest the next move: first point out a wrong number, otherwise the easiest single
 * (preferring the selected cell), otherwise reveal the selected / a random empty cell.
 */
export function findHint(grid: Grid, solution: Grid, selected: number | null): Hint | null {
  const wrong = grid.findIndex((v, i) => v && v !== solution[i])
  if (wrong >= 0) return { kind: 'wrong', cell: wrong }
  const cand = candidates(grid)
  const singles: Hint[] = []
  for (let i = 0; i < 81; i++) {
    if (!grid[i] && popcount(cand[i]) === 1)
      singles.push({ kind: 'place', cell: i, value: solution[i], reason: 'nakedSingle' })
  }
  UNITS.forEach((unit, u) => {
    for (let d = 1; d <= 9; d++) {
      if (unit.some((i) => grid[i] === d)) continue
      const pos = unit.filter((i) => cand[i] & (1 << d))
      if (pos.length === 1)
        singles.push({
          kind: 'place',
          cell: pos[0],
          value: d,
          reason: 'hiddenSingle',
          unit: u < 9 ? 'row' : u < 18 ? 'col' : 'box',
        })
    }
  })
  if (selected != null && !grid[selected]) {
    const s = singles.find((h) => h.kind === 'place' && h.cell === selected)
    if (s) return s
    return { kind: 'place', cell: selected, value: solution[selected], reason: 'reveal' }
  }
  if (singles.length) return singles[0]
  const empty = grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
  if (!empty.length) return null
  const cell = empty[0]
  return { kind: 'place', cell, value: solution[cell], reason: 'reveal' }
}

/** Remove a placed digit from the notes of its peers. */
export function clearPeerNotes(notes: number[], cell: number, value: number): number[] {
  const n = notes.slice()
  n[cell] = 0
  for (const p of PEERS[cell]) n[p] &= ~(1 << value)
  return n
}
