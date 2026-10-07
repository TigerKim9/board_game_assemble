/** Cells of a piece as [row, col] offsets from its top-left corner. */
export type Shape = [number, number][]

export interface Piece {
  id: number
  shape: Shape
  /** Colour index 1..7. */
  color: number
}

export interface State {
  size: number
  /** size×size, 0 = empty, otherwise colour index. */
  board: number[]
  tray: (Piece | null)[]
  score: number
  /** Consecutive placements that cleared at least one line. */
  streak: number
  lines: number
  nextId: number
  over: boolean
}

function normalize(s: Shape): Shape {
  const minR = Math.min(...s.map(([r]) => r))
  const minC = Math.min(...s.map(([, c]) => c))
  return s.map(([r, c]) => [r - minR, c - minC] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}
const rotate = (s: Shape): Shape => normalize(s.map(([r, c]) => [c, -r]))
const key = (s: Shape) => JSON.stringify(s)

function rotations(base: Shape, mirror = false): Shape[] {
  const out = new Map<string, Shape>()
  let cur = normalize(base)
  for (let k = 0; k < 4; k++) {
    out.set(key(cur), cur)
    if (mirror) {
      const m = normalize(cur.map(([r, c]) => [r, -c]))
      out.set(key(m), m)
    }
    cur = rotate(cur)
  }
  return [...out.values()]
}

const line = (n: number): Shape => Array.from({ length: n }, (_, i) => [0, i])
const rect = (h: number, w: number): Shape => {
  const s: Shape = []
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) s.push([r, c])
  return s
}

/** Piece families: [weight, colour, orientations]. */
export const FAMILIES: { name: string; weight: number; color: number; shapes: Shape[] }[] = [
  { name: 'dot', weight: 4, color: 1, shapes: [[[0, 0]]] },
  { name: 'I2', weight: 6, color: 2, shapes: rotations(line(2)) },
  { name: 'I3', weight: 7, color: 3, shapes: rotations(line(3)) },
  { name: 'I4', weight: 6, color: 4, shapes: rotations(line(4)) },
  { name: 'I5', weight: 4, color: 5, shapes: rotations(line(5)) },
  { name: 'O2', weight: 7, color: 6, shapes: [rect(2, 2)] },
  { name: 'O3', weight: 3, color: 7, shapes: [rect(3, 3)] },
  { name: 'R23', weight: 4, color: 2, shapes: rotations(rect(2, 3)) },
  { name: 'corner3', weight: 7, color: 3, shapes: rotations([[0, 0], [1, 0], [1, 1]]) },
  { name: 'L4', weight: 6, color: 4, shapes: rotations([[0, 0], [1, 0], [2, 0], [2, 1]], true) },
  { name: 'T4', weight: 5, color: 5, shapes: rotations([[0, 0], [0, 1], [0, 2], [1, 1]]) },
  { name: 'S4', weight: 4, color: 6, shapes: rotations([[0, 1], [0, 2], [1, 0], [1, 1]], true) },
  { name: 'L5', weight: 4, color: 7, shapes: rotations([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]) },
]

export function randomPiece(id: number, rng: () => number = Math.random): Piece {
  const total = FAMILIES.reduce((s, f) => s + f.weight, 0)
  let x = rng() * total
  let fam = FAMILIES[0]
  for (const f of FAMILIES) {
    x -= f.weight
    if (x < 0) {
      fam = f
      break
    }
  }
  const shape = fam.shapes[Math.floor(rng() * fam.shapes.length)]
  return { id, shape, color: fam.color }
}

export function canPlace(board: number[], size: number, shape: Shape, r0: number, c0: number): boolean {
  return shape.every(([r, c]) => {
    const rr = r0 + r
    const cc = c0 + c
    return rr >= 0 && cc >= 0 && rr < size && cc < size && board[rr * size + cc] === 0
  })
}

export function fitsAnywhere(board: number[], size: number, shape: Shape): boolean {
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (canPlace(board, size, shape, r, c)) return true
  return false
}

export function trayHasMove(s: Pick<State, 'board' | 'size' | 'tray'>): boolean {
  return s.tray.some((p) => p && fitsAnywhere(s.board, s.size, p.shape))
}

/** Three new pieces; re-rolled a few times so at least one of them fits. */
export function newTray(board: number[], size: number, nextId: number, rng: () => number = Math.random) {
  let tray: Piece[] = []
  for (let attempt = 0; attempt < 30; attempt++) {
    tray = [0, 1, 2].map((k) => randomPiece(nextId + k, rng))
    if (tray.some((p) => fitsAnywhere(board, size, p.shape))) break
  }
  return { tray, nextId: nextId + 3 }
}

export function newGame(size: number, rng: () => number = Math.random): State {
  const board = Array(size * size).fill(0)
  const { tray, nextId } = newTray(board, size, 1, rng)
  return { size, board, tray, score: 0, streak: 0, lines: 0, nextId, over: false }
}

/** Rows and columns that would be full after placing the shape. */
export function linesAfter(board: number[], size: number, shape: Shape, r0: number, c0: number) {
  const b = board.slice()
  for (const [r, c] of shape) b[(r0 + r) * size + c0 + c] = 1
  const rows: number[] = []
  const cols: number[] = []
  for (let i = 0; i < size; i++) {
    if (Array.from({ length: size }, (_, k) => b[i * size + k]).every(Boolean)) rows.push(i)
    if (Array.from({ length: size }, (_, k) => b[k * size + i]).every(Boolean)) cols.push(i)
  }
  return { rows, cols }
}

export const lineBonus = (n: number) => (10 * n * (n + 1)) / 2

export interface PlaceResult {
  state: State
  cleared: number[]
  lines: number
  gained: number
  combo: number
  allClear: boolean
}

export function place(s: State, trayIdx: number, r0: number, c0: number, rng: () => number = Math.random): PlaceResult | null {
  const piece = s.tray[trayIdx]
  if (!piece || s.over || !canPlace(s.board, s.size, piece.shape, r0, c0)) return null
  const n = s.size
  const board = s.board.slice()
  for (const [r, c] of piece.shape) board[(r0 + r) * n + c0 + c] = piece.color
  const { rows, cols } = linesAfter(s.board, n, piece.shape, r0, c0)
  const clearedSet = new Set<number>()
  for (const r of rows) for (let k = 0; k < n; k++) clearedSet.add(r * n + k)
  for (const c of cols) for (let k = 0; k < n; k++) clearedSet.add(k * n + c)
  for (const i of clearedSet) board[i] = 0
  const lines = rows.length + cols.length
  const streak = lines ? s.streak + 1 : 0
  const allClear = lines > 0 && board.every((v) => v === 0)
  const gained = piece.shape.length + lineBonus(lines) * Math.max(1, streak) + (allClear ? 300 : 0)
  let tray = s.tray.map((p, i) => (i === trayIdx ? null : p))
  let nextId = s.nextId
  if (tray.every((p) => p === null)) {
    const t = newTray(board, n, nextId, rng)
    tray = t.tray
    nextId = t.nextId
  }
  const next: State = { ...s, board, tray, score: s.score + gained, streak, lines: s.lines + lines, nextId, over: false }
  next.over = !trayHasMove(next)
  return { state: next, cleared: [...clearedSet], lines, gained, combo: streak, allClear }
}

export function shapeSize(shape: Shape): { h: number; w: number } {
  return { h: Math.max(...shape.map(([r]) => r)) + 1, w: Math.max(...shape.map(([, c]) => c)) + 1 }
}
