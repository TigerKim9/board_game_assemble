import type { Difficulty } from '../../lib/types'

/** Falling-blocks puzzle rules: SRS rotation, 7-bag, hold, ghost, lock delay, garbage and an AI. */

export const COLS = 10
export const ROWS = 22 // top 2 rows are hidden spawn rows
export const HIDDEN = 2
export const GARBAGE = 8

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export const PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
export const PIECE_ID: Record<PieceType, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }

const BASE: Record<PieceType, string[]> = {
  I: ['....', '####', '....', '....'],
  O: ['##', '##'],
  T: ['.#.', '###', '...'],
  S: ['.##', '##.', '...'],
  Z: ['##.', '.##', '...'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
}

export type Cells = [number, number][] // [x, y] offsets within the bounding box

function rotateCells(cells: Cells, n: number): Cells {
  return cells.map(([x, y]) => [n - 1 - y, x])
}

/** SHAPES[type][rot] → cell offsets. */
export const SHAPES: Record<PieceType, Cells[]> = Object.fromEntries(
  PIECES.map((t) => {
    const rows = BASE[t]
    const n = rows.length
    const base: Cells = []
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && base.push([x, y])))
    const rots: Cells[] = [base]
    for (let i = 1; i < 4; i++) rots.push(rotateCells(rots[i - 1], n))
    return [t, rots]
  }),
) as Record<PieceType, Cells[]>

// SRS kick tables, written as in the guideline (y up) and converted to y-down below.
const KICKS_JLSTZ: Record<string, [number, number][]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
}
const KICKS_I: Record<string, [number, number][]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
}

export interface Active {
  type: PieceType
  rot: number
  x: number
  y: number
}

export type BlocksEvent =
  | { type: 'clear'; rows: number[]; count: number; tspin: boolean; label: string; b2b: boolean; combo: number }
  | { type: 'lock' }
  | { type: 'hard'; distance: number }
  | { type: 'garbage'; lines: number }
  | { type: 'level'; level: number }
  | { type: 'over' }

export interface Player {
  board: number[][]
  piece: Active | null
  hold: PieceType | null
  canHold: boolean
  queue: PieceType[]
  rng: () => number
  score: number
  lines: number
  level: number
  startLevel: number
  combo: number
  b2b: boolean
  gravityAcc: number
  lockTimer: number
  lockResets: number
  lowestY: number
  lastRotate: boolean
  /** Garbage lines waiting to be added to this board. */
  pending: number
  /** Garbage lines this board sends (consumed by the versus driver). */
  outgoing: number
  over: boolean
  pieces: number
  events: BlocksEvent[]
}

export function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0))
}

export function createPlayer(rng: () => number = Math.random, startLevel = 1): Player {
  const p: Player = {
    board: emptyBoard(),
    piece: null,
    hold: null,
    canHold: true,
    queue: [],
    rng,
    score: 0,
    lines: 0,
    level: startLevel,
    startLevel,
    combo: -1,
    b2b: false,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestY: 0,
    lastRotate: false,
    pending: 0,
    outgoing: 0,
    over: false,
    pieces: 0,
    events: [],
  }
  fillQueue(p)
  spawn(p)
  return p
}

function fillQueue(p: Player) {
  while (p.queue.length < 7) {
    const bag = PIECES.slice()
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(p.rng() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    p.queue.push(...bag)
  }
}

export function spawnPos(type: PieceType): Active {
  return { type, rot: 0, x: type === 'O' ? 4 : 3, y: 0 }
}

export function collides(board: number[][], type: PieceType, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of SHAPES[type][rot]) {
    const bx = x + cx
    const by = y + cy
    if (bx < 0 || bx >= COLS || by >= ROWS) return true
    if (by >= 0 && board[by][bx]) return true
  }
  return false
}

function setPiece(p: Player, piece: Active) {
  p.piece = piece
  p.gravityAcc = 0
  p.lockTimer = 0
  p.lockResets = 0
  p.lowestY = piece.y
  p.lastRotate = false
  if (collides(p.board, piece.type, piece.rot, piece.x, piece.y)) {
    p.over = true
    p.events.push({ type: 'over' })
    return
  }
  // Guideline: drop one row immediately if possible so the piece appears at the top of the visible field.
  if (!collides(p.board, piece.type, piece.rot, piece.x, piece.y + 1)) piece.y++
}

function spawn(p: Player) {
  fillQueue(p)
  const t = p.queue.shift()!
  fillQueue(p)
  setPiece(p, spawnPos(t))
}

export function gravitySeconds(level: number): number {
  const l = Math.min(level, 20)
  return Math.max(0.02, Math.pow(0.8 - (l - 1) * 0.007, l - 1))
}

export function ghostY(p: Player): number {
  const pc = p.piece!
  let y = pc.y
  while (!collides(p.board, pc.type, pc.rot, pc.x, y + 1)) y++
  return y
}

function onGround(p: Player) {
  const pc = p.piece!
  return collides(p.board, pc.type, pc.rot, pc.x, pc.y + 1)
}

function resetLock(p: Player) {
  if (p.lockResets < 15 && onGround(p)) {
    p.lockTimer = 0
    p.lockResets++
  }
}

export function move(p: Player, dx: number): boolean {
  const pc = p.piece
  if (!pc || p.over) return false
  if (collides(p.board, pc.type, pc.rot, pc.x + dx, pc.y)) return false
  pc.x += dx
  p.lastRotate = false
  resetLock(p)
  return true
}

/** dir: +1 clockwise, -1 counter-clockwise. */
export function rotate(p: Player, dir: 1 | -1): boolean {
  const pc = p.piece
  if (!pc || p.over) return false
  if (pc.type === 'O') return false
  const to = (pc.rot + dir + 4) % 4
  const table = pc.type === 'I' ? KICKS_I : KICKS_JLSTZ
  for (const [kx, ky] of table[`${pc.rot}${to}`]) {
    const nx = pc.x + kx
    const ny = pc.y - ky
    if (!collides(p.board, pc.type, to, nx, ny)) {
      pc.x = nx
      pc.y = ny
      pc.rot = to
      p.lastRotate = true
      resetLock(p)
      return true
    }
  }
  return false
}

export function softDrop(p: Player): boolean {
  const pc = p.piece
  if (!pc || p.over) return false
  if (collides(p.board, pc.type, pc.rot, pc.x, pc.y + 1)) return false
  pc.y++
  p.score += 1
  p.gravityAcc = 0
  p.lastRotate = false
  return true
}

export function hardDrop(p: Player) {
  const pc = p.piece
  if (!pc || p.over) return
  const gy = ghostY(p)
  const d = gy - pc.y
  pc.y = gy
  if (d > 0) p.lastRotate = false
  p.score += d * 2
  p.events.push({ type: 'hard', distance: d })
  lock(p)
}

export function holdPiece(p: Player): boolean {
  if (!p.piece || !p.canHold || p.over) return false
  const cur = p.piece.type
  if (p.hold) {
    const h = p.hold
    p.hold = cur
    setPiece(p, spawnPos(h))
  } else {
    p.hold = cur
    spawn(p)
  }
  p.canHold = false
  return true
}

function isTSpin(p: Player): boolean {
  const pc = p.piece!
  if (pc.type !== 'T' || !p.lastRotate) return false
  let corners = 0
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
    const x = pc.x + dx
    const y = pc.y + dy
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && p.board[y][x])) corners++
  }
  return corners >= 3
}

const CLEAR_POINTS = [0, 100, 300, 500, 800]
const TSPIN_POINTS = [400, 800, 1200, 1600]
const ATTACK = [0, 0, 1, 2, 4]
const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]
const CLEAR_LABEL = ['', '싱글', '더블', '트리플', '쿼드!']

/** Lines (count) that would be sent for a clear. Exported for tests. */
export function attackFor(count: number, tspin: boolean, b2b: boolean, combo: number): number {
  if (count === 0) return 0
  let a = tspin ? count * 2 : ATTACK[count]
  if (b2b) a += 1
  a += COMBO_ATTACK[Math.min(combo, COMBO_ATTACK.length - 1)] ?? 0
  return a
}

export function addGarbage(board: number[][], lines: number, hole: number): boolean {
  let overflow = false
  for (let i = 0; i < lines; i++) {
    const top = board.shift()!
    if (top.some(Boolean)) overflow = true
    const row = new Array(COLS).fill(GARBAGE)
    row[hole] = 0
    board.push(row)
  }
  return overflow
}

function lock(p: Player) {
  const pc = p.piece!
  const tspin = isTSpin(p)
  let visible = false
  for (const [cx, cy] of SHAPES[pc.type][pc.rot]) {
    const x = pc.x + cx
    const y = pc.y + cy
    if (y >= 0) p.board[y][x] = PIECE_ID[pc.type]
    if (y >= HIDDEN) visible = true
  }
  p.piece = null
  p.pieces++
  p.events.push({ type: 'lock' })

  const rows: number[] = []
  for (let y = 0; y < ROWS; y++) if (p.board[y].every(Boolean)) rows.push(y)
  const count = rows.length
  if (count) {
    for (const y of rows) {
      p.board.splice(y, 1)
      p.board.unshift(new Array(COLS).fill(0))
    }
  }

  if (count || tspin) {
    const difficult = count === 4 || (tspin && count > 0)
    const b2bBonus = difficult && p.b2b
    if (count) p.combo++
    let pts = tspin ? TSPIN_POINTS[count] : CLEAR_POINTS[count]
    if (b2bBonus) pts = Math.floor(pts * 1.5)
    p.score += pts * p.level
    if (p.combo > 0) p.score += 50 * p.combo * p.level
    if (count) {
      const attack = attackFor(count, tspin, b2bBonus, p.combo)
      const cancel = Math.min(attack, p.pending)
      p.pending -= cancel
      p.outgoing += attack - cancel
      p.b2b = difficult ? true : count > 0 ? false : p.b2b
    }
    const label = (tspin ? 'T-스핀 ' : '') + (count ? CLEAR_LABEL[count] : '')
    p.events.push({ type: 'clear', rows, count, tspin, label: label.trim(), b2b: b2bBonus, combo: p.combo })
    if (count) {
      p.lines += count
      const lvl = p.startLevel + Math.floor(p.lines / 10)
      if (lvl > p.level) {
        p.level = lvl
        p.events.push({ type: 'level', level: lvl })
      }
    }
  }
  if (!count) p.combo = -1

  if (!visible) {
    // Locked completely above the visible field.
    p.over = true
    p.events.push({ type: 'over' })
    return
  }

  if (!count && p.pending > 0) {
    const n = Math.min(p.pending, 10)
    p.pending -= n
    const hole = Math.floor(p.rng() * COLS)
    const overflow = addGarbage(p.board, n, hole)
    p.events.push({ type: 'garbage', lines: n })
    if (overflow) {
      p.over = true
      p.events.push({ type: 'over' })
      return
    }
  }
  p.canHold = true
  spawn(p)
}

/** Advance gravity / lock delay by dt seconds. `soft` = soft-drop held. */
export function tick(p: Player, dt: number, soft = false) {
  if (p.over || !p.piece) return
  const g = gravitySeconds(p.level)
  const interval = soft ? Math.min(g, 0.04) : g
  p.gravityAcc += dt
  while (p.gravityAcc >= interval && p.piece) {
    p.gravityAcc -= interval
    const pc = p.piece
    if (!collides(p.board, pc.type, pc.rot, pc.x, pc.y + 1)) {
      pc.y++
      p.lastRotate = false
      if (soft) p.score += 1
      if (pc.y > p.lowestY) {
        p.lowestY = pc.y
        p.lockResets = 0
      }
    } else break
  }
  if (p.piece && onGround(p)) {
    p.lockTimer += dt
    if (p.lockTimer >= 0.5) lock(p)
  } else p.lockTimer = 0
}

/** Move garbage from one board to the other (call after every simulation step in versus). */
export function exchangeGarbage(a: Player, b: Player) {
  if (a.outgoing) {
    b.pending += a.outgoing
    a.outgoing = 0
  }
  if (b.outgoing) {
    a.pending += b.outgoing
    b.outgoing = 0
  }
}

// ---------- AI ----------

export interface Placement {
  rot: number
  x: number
  hold: boolean
  score: number
}

interface Weights {
  height: number
  lines: number
  holes: number
  bump: number
  well: number
  maxH: number
}
const WEIGHTS: Weights = { height: -0.51, lines: 0.76, holes: -0.36, bump: -0.18, well: 0, maxH: -0.05 }

function evaluateBoard(board: number[][], cleared: number, w: Weights): number {
  const heights = new Array(COLS).fill(0)
  let holes = 0
  for (let x = 0; x < COLS; x++) {
    let seen = false
    for (let y = 0; y < ROWS; y++) {
      if (board[y][x]) {
        if (!seen) heights[x] = ROWS - y
        seen = true
      } else if (seen) holes++
    }
  }
  let agg = 0
  let bump = 0
  let maxH = 0
  for (let x = 0; x < COLS; x++) {
    agg += heights[x]
    maxH = Math.max(maxH, heights[x])
    if (x) bump += Math.abs(heights[x] - heights[x - 1])
  }
  // Danger: heavy penalty near the top.
  const danger = maxH > ROWS - 6 ? (maxH - (ROWS - 6)) * -8 : 0
  return w.height * agg + w.lines * cleared + w.holes * holes * 2 + w.bump * bump + w.maxH * maxH + danger
}

function place(board: number[][], type: PieceType, rot: number, x: number): { board: number[][]; cleared: number } | null {
  if (collides(board, type, rot, x, 0)) return null
  let y = 0
  while (!collides(board, type, rot, x, y + 1)) y++
  const b = board.map((r) => r.slice())
  for (const [cx, cy] of SHAPES[type][rot]) {
    if (y + cy < 0) return null
    b[y + cy][x + cx] = 1
  }
  let cleared = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r].every(Boolean)) {
      b.splice(r, 1)
      cleared++
    }
  }
  while (b.length < ROWS) b.unshift(new Array(COLS).fill(0))
  return { board: b, cleared }
}

function placements(board: number[][], type: PieceType) {
  const out: { rot: number; x: number; board: number[][]; cleared: number }[] = []
  const rots = type === 'O' ? 1 : type === 'I' || type === 'S' || type === 'Z' ? 2 : 4
  for (let rot = 0; rot < rots; rot++) {
    for (let x = -2; x < COLS; x++) {
      const r = place(board, type, rot, x)
      if (r) out.push({ rot, x, ...r })
    }
  }
  return out
}

function bestScore(board: number[][], type: PieceType, w: Weights): number {
  let best = -Infinity
  for (const pl of placements(board, type)) best = Math.max(best, evaluateBoard(pl.board, pl.cleared, w))
  return best
}

/** Choose where to put the current piece. */
export function aiPlan(p: Player, difficulty: Difficulty): Placement | null {
  if (!p.piece) return null
  const w = WEIGHTS
  const candidates: { type: PieceType; hold: boolean }[] = [{ type: p.piece.type, hold: false }]
  if (difficulty !== 'easy' && p.canHold) {
    const alt = p.hold ?? p.queue[0]
    if (alt && alt !== p.piece.type) candidates.push({ type: alt, hold: true })
  }
  const all: Placement[] = []
  for (const c of candidates) {
    const nextType = c.hold && !p.hold ? p.queue[1] : p.queue[0]
    for (const pl of placements(p.board, c.type)) {
      let score = evaluateBoard(pl.board, pl.cleared, w)
      if (difficulty === 'hard' && nextType) score = score * 0.4 + bestScore(pl.board, nextType, w) * 0.6
      all.push({ rot: pl.rot, x: pl.x, hold: c.hold, score })
    }
  }
  if (!all.length) return null
  all.sort((a, b) => b.score - a.score)
  if (difficulty === 'easy' && p.rng() < 0.35) return all[Math.min(all.length - 1, 1 + Math.floor(p.rng() * 5))]
  return all[0]
}

export interface AIController {
  plan: Placement | null
  timer: number
  forPiece: number
  held: boolean
}

export const newController = (): AIController => ({ plan: null, timer: 0, forPiece: -1, held: false })

export const AI_SPEED: Record<Difficulty, { think: number; action: number }> = {
  easy: { think: 0.7, action: 0.18 },
  normal: { think: 0.35, action: 0.09 },
  hard: { think: 0.2, action: 0.06 },
}

/** Drive an AI player one frame: plans once per piece, then performs one input per action interval. */
export function aiStep(p: Player, c: AIController, dt: number, difficulty: Difficulty) {
  if (p.over || !p.piece) return
  const speed = AI_SPEED[difficulty]
  if (c.forPiece !== p.pieces) {
    c.forPiece = p.pieces
    c.plan = aiPlan(p, difficulty)
    c.timer = speed.think
    c.held = false
  }
  c.timer -= dt
  if (c.timer > 0) return
  c.timer = speed.action
  const plan = c.plan
  if (!plan) {
    hardDrop(p)
    return
  }
  if (plan.hold && !c.held) {
    c.held = true
    if (holdPiece(p)) {
      c.forPiece = p.pieces // keep the plan for the swapped piece
      return
    }
  }
  const pc = p.piece
  if (pc.rot !== plan.rot) {
    const diff = (plan.rot - pc.rot + 4) % 4
    if (!rotate(p, diff === 3 ? -1 : 1)) hardDrop(p)
    return
  }
  if (pc.x !== plan.x) {
    if (!move(p, Math.sign(plan.x - pc.x))) hardDrop(p)
    return
  }
  hardDrop(p)
}
