export type Dir = 'up' | 'down' | 'left' | 'right'

export interface Tile {
  id: number
  v: number
  r: number
  c: number
  /** Created by a merge in the last move (pop animation). */
  merged?: boolean
  /** Spawned after the last move (appear animation). */
  isNew?: boolean
  /** Consumed by a merge in the last move: kept one move for the slide animation. */
  dead?: boolean
}

export interface State {
  size: number
  tiles: Tile[]
  score: number
  nextId: number
  /** Reached 2048 (shown once). */
  won: boolean
  /** Player chose to keep playing after winning. */
  keepGoing: boolean
  over: boolean
  moves: number
}

export const GOAL = 2048

export function live(s: State): Tile[] {
  return s.tiles.filter((t) => !t.dead)
}

export function emptyCells(s: State): [number, number][] {
  const taken = new Set(live(s).map((t) => t.r * s.size + t.c))
  const out: [number, number][] = []
  for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) if (!taken.has(r * s.size + c)) out.push([r, c])
  return out
}

export function spawn(s: State, rng: () => number = Math.random): State {
  const cells = emptyCells(s)
  if (!cells.length) return s
  const [r, c] = cells[Math.floor(rng() * cells.length)]
  const v = rng() < 0.9 ? 2 : 4
  return { ...s, tiles: [...s.tiles, { id: s.nextId, v, r, c, isNew: true }], nextId: s.nextId + 1 }
}

export function newGame(size: number, rng: () => number = Math.random): State {
  let s: State = { size, tiles: [], score: 0, nextId: 1, won: false, keepGoing: false, over: false, moves: 0 }
  s = spawn(s, rng)
  s = spawn(s, rng)
  return s
}

/** Build a state from a matrix of values (0 = empty). Handy for tests. */
export function fromMatrix(m: number[][]): State {
  const tiles: Tile[] = []
  let id = 1
  m.forEach((row, r) => row.forEach((v, c) => v && tiles.push({ id: id++, v, r, c })))
  return { size: m.length, tiles, score: 0, nextId: id, won: false, keepGoing: false, over: false, moves: 0 }
}

export function toMatrix(s: State): number[][] {
  const m = Array.from({ length: s.size }, () => Array(s.size).fill(0))
  for (const t of live(s)) m[t.r][t.c] = t.v
  return m
}

/** Slide without spawning. Returns null when nothing moves. */
export function slide(s: State, dir: Dir): { state: State; gained: number } | null {
  const n = s.size
  const tiles = live(s).map((t) => ({ ...t, merged: false, isNew: false }))
  const at = new Map<number, Tile>()
  for (const t of tiles) at.set(t.r * n + t.c, t)
  const out: Tile[] = []
  let nextId = s.nextId
  let gained = 0
  let moved = false
  for (let line = 0; line < n; line++) {
    // Cells of this line ordered from the edge we slide towards.
    const cells: [number, number][] = []
    for (let k = 0; k < n; k++) {
      if (dir === 'left') cells.push([line, k])
      if (dir === 'right') cells.push([line, n - 1 - k])
      if (dir === 'up') cells.push([k, line])
      if (dir === 'down') cells.push([n - 1 - k, line])
    }
    const row = cells.map(([r, c]) => at.get(r * n + c)).filter((t): t is Tile => !!t)
    let slot = 0
    for (let k = 0; k < row.length; k++) {
      const [r, c] = cells[slot]
      const t = row[k]
      const u = row[k + 1]
      if (u && u.v === t.v) {
        out.push({ ...t, r, c, dead: true }, { ...u, r, c, dead: true })
        out.push({ id: nextId++, v: t.v * 2, r, c, merged: true })
        gained += t.v * 2
        moved = true
        k++
      } else {
        if (t.r !== r || t.c !== c) moved = true
        out.push({ ...t, r, c })
      }
      slot++
    }
  }
  if (!moved) return null
  return { state: { ...s, tiles: out, nextId, score: s.score + gained }, gained }
}

export function canMove(s: State): boolean {
  if (emptyCells(s).length) return true
  return (['left', 'up'] as Dir[]).some((d) => slide(s, d) !== null)
}

export function maxTile(s: State): number {
  return live(s).reduce((m, t) => Math.max(m, t.v), 0)
}

/** Full move: slide, spawn a tile, update win/over flags. Returns null if the move does nothing. */
export function move(s: State, dir: Dir, rng: () => number = Math.random): State | null {
  if (s.over) return null
  const res = slide(s, dir)
  if (!res) return null
  let next = spawn(res.state, rng)
  next = { ...next, moves: s.moves + 1 }
  if (!next.won && maxTile(next) >= GOAL) next = { ...next, won: true }
  if (!canMove(next)) next = { ...next, over: true }
  return next
}

/** Drop animation leftovers (dead tiles and flags) — used before saving / undo snapshots. */
export function settle(s: State): State {
  return { ...s, tiles: live(s).map(({ id, v, r, c }) => ({ id, v, r, c })) }
}
