import type { Difficulty } from '../../lib/types'

export const SIZE = 15
export const CELLS = SIZE * SIZE
/** 0 empty, 1 black (player 0, moves first), 2 white. */
export type Stone = 0 | 1 | 2
export type RuleSet = 'free' | 'renju'

export interface GomokuState {
  board: Stone[]
  turn: 0 | 1
  last: number | null
  winLine: number[] | null
  over: boolean
  moveNo: number
  rule: RuleSet
}

export const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export const stoneOf = (turn: number): Stone => (turn === 0 ? 1 : 2)
export const other = (c: Stone): Stone => (c === 1 ? 2 : 1)

export function initialState(rule: RuleSet = 'free'): GomokuState {
  return { board: Array(CELLS).fill(0), turn: 0, last: null, winLine: null, over: false, moveNo: 0, rule }
}

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

/** Length of the run of `color` through idx along (dr,dc), treating idx itself as `color`. */
function runThrough(b: Stone[], idx: number, color: Stone, dr: number, dc: number): number {
  const r0 = (idx / SIZE) | 0
  const c0 = idx % SIZE
  let n = 1
  let r = r0 + dr
  let c = c0 + dc
  while (inside(r, c) && b[r * SIZE + c] === color) {
    n++
    r += dr
    c += dc
  }
  r = r0 - dr
  c = c0 - dc
  while (inside(r, c) && b[r * SIZE + c] === color) {
    n++
    r -= dr
    c -= dc
  }
  return n
}

export function makesFive(b: Stone[], idx: number, color: Stone): boolean {
  for (const [dr, dc] of DIRS) if (runThrough(b, idx, color, dr, dc) >= 5) return true
  return false
}

function winningCells(b: Stone[], idx: number): number[] | null {
  const color = b[idx]
  const r0 = (idx / SIZE) | 0
  const c0 = idx % SIZE
  for (const [dr, dc] of DIRS) {
    const cells = [idx]
    for (const s of [1, -1]) {
      let r = r0 + dr * s
      let c = c0 + dc * s
      while (inside(r, c) && b[r * SIZE + c] === color) {
        cells.push(r * SIZE + c)
        r += dr * s
        c += dc * s
      }
    }
    if (cells.length >= 5) return cells
  }
  return null
}

/** Empty points on the line through idx (±4) where `color` would complete five through idx. b[idx] must be color. */
function fivePoints(b: Stone[], idx: number, color: Stone, dr: number, dc: number, out?: number[]): number {
  const r0 = (idx / SIZE) | 0
  const c0 = idx % SIZE
  let n = 0
  for (let k = -4; k <= 4; k++) {
    if (!k) continue
    const r = r0 + dr * k
    const c = c0 + dc * k
    if (!inside(r, c)) continue
    const e = r * SIZE + c
    if (b[e] !== 0) continue
    b[e] = color
    // five must pass through idx: check the run through e covers idx
    const run = runThrough(b, idx, color, dr, dc)
    b[e] = 0
    if (run >= 5) {
      n++
      out?.push(e)
    }
  }
  return n
}

export interface Threats {
  five: boolean
  open4: number
  four: number
  open3: number
  /** Weak shape score for ranking quiet moves. */
  shape: number
}

// ---- 1-D line classification (cached) ----
// A line is 9 cells centred on the move: 0 empty, 1 own, 2 blocked (opponent or edge). Centre is own.
const L_FIVE = 1
const L_OPEN4 = 2
const L_FOUR = 3
const L_OPEN3 = 4
const lineCache = new Int16Array(19683).fill(-1)

function lineRun(l: number[]): number {
  let n = 1
  for (let k = 5; k < 9 && l[k] === 1; k++) n++
  for (let k = 3; k >= 0 && l[k] === 1; k--) n++
  return n
}
function lineFivePts(l: number[]): number {
  let n = 0
  for (let k = 0; k < 9; k++) {
    if (k === 4 || l[k] !== 0) continue
    l[k] = 1
    if (lineRun(l) >= 5) n++
    l[k] = 0
  }
  return n
}
function classifyLine(l: number[]): number {
  if (lineRun(l) >= 5) return L_FIVE
  const fp = lineFivePts(l)
  if (fp >= 2) return L_OPEN4
  if (fp === 1) return L_FOUR
  for (let k = 0; k < 9; k++) {
    if (k === 4 || l[k] !== 0) continue
    l[k] = 1
    const three = lineRun(l) < 5 && lineFivePts(l) >= 2
    l[k] = 0
    if (three) return L_OPEN3
  }
  // Weak shapes: own stones and free space reachable on each side.
  let own = 0
  let space = 1
  for (const step of [1, -1]) {
    for (let k = 4 + step; k >= 0 && k < 9; k += step) {
      if (l[k] === 2) break
      if (l[k] === 1) own++
      else space++
    }
  }
  if (space + own + 1 < 5) return 10
  return 10 + (own === 0 ? 2 : own === 1 ? 12 + space : own === 2 ? 40 + space * 2 : 60)
}

const lineBuf = [0, 0, 0, 0, 1, 0, 0, 0, 0]
function lineClass(b: Stone[], idx: number, color: Stone, dr: number, dc: number): number {
  const r0 = (idx / SIZE) | 0
  const c0 = idx % SIZE
  let code = 0
  for (let k = -4; k <= 4; k++) {
    let v = 1
    if (k) {
      const r = r0 + dr * k
      const c = c0 + dc * k
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) v = 2
      else {
        const x = b[r * SIZE + c]
        v = x === 0 ? 0 : x === color ? 1 : 2
      }
    }
    lineBuf[k + 4] = v
    code = code * 3 + v
  }
  let res = lineCache[code]
  if (res < 0) {
    res = classifyLine(lineBuf.slice())
    lineCache[code] = res
  }
  return res
}

/** Threats `color` would create by playing at empty idx. */
export function analyze(b: Stone[], idx: number, color: Stone): Threats {
  const t: Threats = { five: false, open4: 0, four: 0, open3: 0, shape: 0 }
  for (const [dr, dc] of DIRS) {
    const k = lineClass(b, idx, color, dr, dc)
    if (k === L_FIVE) t.five = true
    else if (k === L_OPEN4) t.open4++
    else if (k === L_FOUR) t.four++
    else if (k === L_OPEN3) t.open3++
    else t.shape += k - 10
  }
  return t
}

export function threatScore(t: Threats): number {
  if (t.five) return 1_000_000
  if (t.open4 || t.four >= 2 || (t.four && t.open3)) return 100_000
  if (t.open3 >= 2) return 20_000
  return t.four * 2_600 + t.open3 * 2_400 + t.shape
}

/** Renju-lite: black may not make a double open three (unless it also makes five). */
export function isForbidden(s: Pick<GomokuState, 'board' | 'rule'>, idx: number, color: Stone): boolean {
  if (s.rule !== 'renju' || color !== 1 || s.board[idx] !== 0) return false
  const t = analyze(s.board, idx, 1)
  return !t.five && t.open3 >= 2
}

export function applyMove(s: GomokuState, idx: number): GomokuState {
  if (s.over || s.board[idx] !== 0) return s
  const color = stoneOf(s.turn)
  if (isForbidden(s, idx, color)) return s
  const board = s.board.slice()
  board[idx] = color
  const winLine = winningCells(board, idx)
  const full = s.moveNo + 1 >= CELLS
  return {
    ...s,
    board,
    turn: winLine ? s.turn : ((1 - s.turn) as 0 | 1),
    last: idx,
    winLine,
    over: !!winLine || full,
    moveNo: s.moveNo + 1,
  }
}

/** Winner index, -1 draw, null ongoing. */
export function winner(s: GomokuState): number | null {
  if (!s.over) return null
  return s.winLine ? s.board[s.winLine[0]] - 1 : -1
}

// ---------- AI ----------

/** Empty cells within distance 2 of a stone. */
export function candidates(b: Stone[], dist = 2): number[] {
  const mark = new Uint8Array(CELLS)
  let any = false
  for (let i = 0; i < CELLS; i++) {
    if (!b[i]) continue
    any = true
    const r0 = (i / SIZE) | 0
    const c0 = i % SIZE
    for (let dr = -dist; dr <= dist; dr++)
      for (let dc = -dist; dc <= dist; dc++) {
        const r = r0 + dr
        const c = c0 + dc
        if (inside(r, c) && !b[r * SIZE + c]) mark[r * SIZE + c] = 1
      }
  }
  if (!any) return [(SIZE * SIZE - 1) / 2]
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) if (mark[i]) out.push(i)
  return out
}

interface Scored {
  i: number
  atk: number
  def: number
  atkT: Threats
  defT: Threats
}

function scoreAll(s: GomokuState, me: Stone): Scored[] {
  const b = s.board.slice()
  const opp = other(me)
  const out: Scored[] = []
  for (const i of candidates(b)) {
    if (isForbidden(s, i, me)) continue
    const atkT = analyze(b, i, me)
    const defT = analyze(b, i, opp)
    out.push({ i, atk: threatScore(atkT), def: threatScore(defT), atkT, defT })
  }
  return out
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * Victory by Continuous Fours: a sequence of fours (each forcing a single reply) ending in five / open four.
 * Returns the first move or null.
 */
export function findVCF(board: Stone[], color: Stone, maxDepth: number, deadline: number, rule: RuleSet = 'free'): number | null {
  const b = board.slice()
  const opp = other(color)
  let nodes = 0
  const rec = (depth: number): number | null => {
    if ((++nodes & 7) === 0 && now() > deadline) return null
    const cands = candidates(b, 2)
    // Opponent five threats must be handled first: if opp has a five point we cannot keep making fours freely.
    for (const i of cands) if (makesFive(b, i, color)) return i
    let oppFive = -1
    for (const i of cands)
      if (makesFive(b, i, opp)) {
        oppFive = i
        break
      }
    if (depth <= 0) return null
    for (const i of cands) {
      if (oppFive >= 0 && i !== oppFive) continue
      if (color === 1 && rule === 'renju' && isForbidden({ board: b, rule }, i, 1)) continue
      b[i] = color
      const pts: number[] = []
      let total = 0
      for (const [dr, dc] of DIRS) total += fivePoints(b, i, color, dr, dc, pts)
      if (total === 0) {
        b[i] = 0
        continue
      }
      const uniq = [...new Set(pts)]
      if (uniq.length >= 2) {
        b[i] = 0
        return i // open four / double four: wins
      }
      const reply = uniq[0]
      // If the forced block makes five for the opponent, this line fails.
      if (makesFive(b, reply, opp)) {
        b[i] = 0
        continue
      }
      b[reply] = opp
      const res = rec(depth - 1)
      b[reply] = 0
      b[i] = 0
      if (res != null) return i
    }
    return null
  }
  return rec(maxDepth)
}

function pickBest(list: Scored[], defWeight: number, rng: () => number, jitter = 0): number {
  let best = list[0].i
  let bestV = -Infinity
  for (const x of list) {
    const v = x.atk * 1.1 + x.def * defWeight + (jitter ? rng() * jitter : 0) + centerBonus(x.i)
    if (v > bestV) {
      bestV = v
      best = x.i
    }
  }
  return best
}

const centerBonus = (i: number) => {
  const r = (i / SIZE) | 0
  const c = i % SIZE
  return 7 - Math.max(Math.abs(r - 7), Math.abs(c - 7)) * 0.5
}

export function aiMove(s: GomokuState, diff: Difficulty, rng: () => number = Math.random, timeMs = 800): number | null {
  if (s.over) return null
  const start = now()
  const deadline = start + timeMs
  const me = stoneOf(s.turn)
  const opp = other(me)
  if (s.moveNo === 0) return (CELLS - 1) / 2
  const list = scoreAll(s, me)
  if (!list.length) return null

  // 1. Win now.
  const win = list.find((x) => x.atkT.five)
  if (win) return win.i
  // 2. Block five.
  const blocks = list.filter((x) => x.defT.five)
  if (blocks.length && (diff !== 'easy' || rng() < 0.9)) return pickBest(blocks, 1, rng)

  if (diff === 'easy') {
    // Short-sighted: likes its own shapes, notices threats only half the time.
    const sorted = list
      .map((x) => ({ x, v: x.atk + x.def * (rng() < 0.5 ? 0.9 : 0.15) + rng() * 600 }))
      .sort((a, b) => b.v - a.v)
    return sorted[Math.floor(rng() * Math.min(3, sorted.length))].x.i
  }

  // 3. Unstoppable own threat (open four, double four, four-three).
  const winning = list.filter((x) => x.atk >= 100_000)
  if (winning.length) return pickBest(winning, 0.2, rng)

  // 4. Hard: forced win by continuous fours, otherwise a threat-aware search.
  if (diff === 'hard') {
    const v = findVCF(s.board, me, 12, start + timeMs * 0.3, s.rule)
    if (v != null) return v
    const best = searchHard(s, start + timeMs * 0.85, rng)
    if (best != null) {
      if (!vcfAfter(s, best, opp, deadline)) return best
      return pickBest(safeAgainstVCF(s, list, opp, deadline), 1, rng)
    }
  }

  // 5. Opponent threatens an open four / 4-3 / 3-3 next move: defend (or counter with a four on hard).
  const danger = list.filter((x) => x.def >= 20_000)
  if (danger.length) {
    const maxDef = Math.max(...danger.map((x) => x.def))
    // Candidate defences: the points the opponent needs for the threat.
    let defs = list.filter((x) => x.def >= (maxDef >= 100_000 ? 100_000 : 20_000))
    return pickBest(defs, 1, rng, 40)
  }

  // 6. Own double-three.
  const dbl = list.filter((x) => x.atk >= 20_000)
  if (dbl.length) return pickBest(dbl, 0.5, rng)

  // 7. Positional: best combined score.
  return pickBest(list, 0.9, rng, 120)
}

function vcfAfter(s: GomokuState, move: number, opp: Stone, deadline: number): boolean {
  const b = s.board.slice()
  b[move] = stoneOf(s.turn)
  return findVCF(b, opp, 8, Math.min(deadline, now() + 80), s.rule) != null
}

/** Keep the candidates after which the opponent has no forced VCF win (falls back to all). */
function safeAgainstVCF(s: GomokuState, list: Scored[], opp: Stone, deadline: number): Scored[] {
  const sorted = list.slice().sort((a, b) => b.atk * 1.1 + b.def - (a.atk * 1.1 + a.def))
  const safe: Scored[] = []
  const b = s.board.slice()
  for (const x of sorted) {
    if (now() > deadline) break
    b[x.i] = stoneOf(s.turn)
    const threat = findVCF(b, opp, 8, Math.min(deadline, now() + 60), s.rule)
    b[x.i] = 0
    if (threat == null) {
      safe.push(x)
      if (safe.length >= 3) break
    }
  }
  return safe.length ? safe : list
}

// ---- Hard: negamax over threat-pruned candidates ----
const S_WIN = 10_000_000
const ABORT = Symbol('abort')
const capped = (x: number) => (x >= 100_000 ? 9_000 : x >= 20_000 ? 6_000 : x)

interface Gen {
  /** Terminal value from the mover's view if decided, else null. */
  value: number | null
  moves: number[]
  eval: number
}

function generate(b: Stone[], me: Stone, rule: RuleSet, width: number, ply: number): Gen {
  const opp = other(me)
  const cands = candidates(b)
  const atk: number[] = []
  const def: number[] = []
  const pts: number[] = []
  let oppFive = -1
  let oppFiveCount = 0
  let myWin = false
  let oppThreat = false
  for (const i of cands) {
    const at = analyze(b, i, me)
    if (at.five) return { value: S_WIN - ply - 1, moves: [i], eval: 0 }
    if (rule === 'renju' && me === 1 && at.open3 >= 2) continue
    const df = analyze(b, i, opp)
    if (df.five) {
      oppFiveCount++
      oppFive = i
    }
    const a = threatScore(at)
    const d = threatScore(df)
    if (a >= 100_000) myWin = true
    if (d >= 100_000) oppThreat = true
    pts.push(i)
    atk.push(a)
    def.push(d)
  }
  if (oppFiveCount >= 2) return { value: -(S_WIN - ply - 2), moves: [oppFive], eval: 0 }
  if (oppFiveCount === 1) return { value: null, moves: [oppFive], eval: 0 }
  if (myWin) return { value: S_WIN - ply - 3, moves: [pts[atk.indexOf(Math.max(...atk))]], eval: 0 }
  let order = pts.map((_, k) => k)
  if (oppThreat) order = order.filter((k) => def[k] >= 100_000 || atk[k] >= 2_600)
  order.sort((x, y) => atk[y] * 1.1 + def[y] - (atk[x] * 1.1 + def[x]))
  // Static evaluation from the mover's view.
  let a0 = 0
  let a1 = 0
  let d0 = 0
  let d1 = 0
  for (let k = 0; k < pts.length; k++) {
    const a = capped(atk[k])
    const d = capped(def[k])
    if (a > a0) {
      a1 = a0
      a0 = a
    } else if (a > a1) a1 = a
    if (d > d0) {
      d1 = d0
      d0 = d
    } else if (d > d1) d1 = d
  }
  const ev = a0 + 0.5 * a1 - 0.75 * d0 - 0.4 * d1 + 30
  return { value: null, moves: order.slice(0, width).map((k) => pts[k]), eval: ev }
}

function searchHard(s: GomokuState, deadline: number, rng: () => number): number | null {
  const b = s.board.slice()
  const me = stoneOf(s.turn)
  let nodes = 0
  const neg = (color: Stone, depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 15) === 0 && now() > deadline) throw ABORT
    const g = generate(b, color, s.rule, ply < 2 ? 9 : 7, ply)
    if (g.value != null) return g.value
    if (!g.moves.length) return 0
    if (depth <= 0) return g.eval
    let best = -Infinity
    const opp = other(color)
    for (const m of g.moves) {
      b[m] = color
      const v = -neg(opp, depth - 1, -beta, -alpha, ply + 1)
      b[m] = 0
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
    }
    return best
  }
  const root = generate(b, me, s.rule, 12, 0)
  if (!root.moves.length) return null
  if (root.moves.length === 1) return root.moves[0]
  let order = root.moves.map((m, k) => ({ m, v: -k }))
  let bestMove = order[0].m
  for (let depth = 1; depth <= 12; depth++) {
    const scored: { m: number; v: number }[] = []
    let alpha = -Infinity
    try {
      for (const { m } of order) {
        b[m] = me
        const v = -neg(other(me), depth - 1, -Infinity, -alpha, 1)
        b[m] = 0
        scored.push({ m, v })
        if (v > alpha) alpha = v
      }
    } catch (e) {
      if (e !== ABORT) throw e
      for (const { m } of order) b[m] = s.board[m]
      if (scored.length && depth > 2) bestMove = scored.reduce((x, y) => (y.v > x.v ? y : x)).m
      break
    }
    scored.sort((x, y) => y.v - x.v)
    order = scored
    bestMove = scored[0].m
    if (Math.abs(scored[0].v) > S_WIN / 2) break
  }
  // Small variety among equal best moves at the root.
  const ties = order.filter((o) => o.v === order[0].v && o.m !== undefined)
  if (ties.length > 1 && ties.some((t) => t.m === bestMove)) return ties[Math.floor(rng() * ties.length)].m
  return bestMove
}

export const coord = (i: number) => {
  const r = (i / SIZE) | 0
  const c = i % SIZE
  return `${String.fromCharCode(65 + c)}${SIZE - r}`
}
