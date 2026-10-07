// 윷놀이 rules engine.
//
// Board nodes (29): outer ring 0..19 counter-clockwise from 참먹이(0, bottom-right),
// corners 5 (top-right), 10 (top-left), 15 (bottom-left).
// Diagonal A: 5 → 20 → 21 → 22(방) → 23 → 24 → 15
// Diagonal B: 10 → 25 → 26 → 22(방) → 27 → 28 → 0
// A piece arriving at 0 (or passing it) finishes (났다).

export type ThrowName = 'backdo' | 'do' | 'gae' | 'geol' | 'yut' | 'mo'

export const THROW_LABEL: Record<ThrowName, string> = {
  backdo: '빽도',
  do: '도',
  gae: '개',
  geol: '걸',
  yut: '윷',
  mo: '모',
}
export const THROW_STEPS: Record<ThrowName, number> = { backdo: -1, do: 1, gae: 2, geol: 3, yut: 4, mo: 5 }

export const OFF = -1 // not yet on the board
export const DONE = 99 // finished
export const END = 'END' as const

export interface Piece {
  owner: number
  pos: number // OFF, node id, or DONE
}

export interface Settings {
  piecesPerPlayer: number
  backdo: boolean
}

/** Throw 4 sticks. Each stick lands flat-side up with p = 0.5; one stick is marked for 빽도. */
export function throwSticks(rng: () => number = Math.random, backdo = true): { result: ThrowName; sticks: boolean[] } {
  const sticks = [0, 1, 2, 3].map(() => rng() < 0.5) // true = flat side up (counted)
  const n = sticks.filter(Boolean).length
  let result: ThrowName
  if (n === 0) result = 'mo'
  else if (n === 1) result = backdo && sticks[0] ? 'backdo' : 'do'
  else if (n === 2) result = 'gae'
  else if (n === 3) result = 'geol'
  else result = 'yut'
  return { result, sticks }
}

export const isBonusThrow = (t: ThrowName) => t === 'yut' || t === 'mo'

const OUTER = Array.from({ length: 20 }, (_, i) => i)
const DIAG_A = [5, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19]
const DIAG_B = [10, 25, 26, 22, 27, 28]

/** The route a piece follows when it starts a move from `from`. Last element of every route is END. */
function routeFrom(from: number): (number | typeof END)[] {
  if (from === OFF) return [0, ...OUTER.slice(1), END]
  if (from === 0) return [0, END] // sitting on 참먹이 (only via 빽도): any move finishes
  if (from === 5) return [...DIAG_A, END]
  if (from === 10) return [...DIAG_B, END]
  if (from === 22) return [22, 27, 28, END]
  if (from === 20 || from === 21 || from === 23 || from === 24) return [...DIAG_A.slice(DIAG_A.indexOf(from)), END]
  if (from === 25 || from === 26 || from === 27 || from === 28) return [...DIAG_B.slice(DIAG_B.indexOf(from)), END]
  return [...OUTER.slice(from), END]
}

const PREV: Record<number, number> = {
  20: 5, 21: 20, 22: 21, 23: 22, 24: 23,
  25: 10, 26: 25, 27: 22, 28: 27,
  0: 19,
}

/** Destination of moving from `from` by a throw. Returns DONE for finishing, or null if the move is impossible. */
export function destination(from: number, t: ThrowName): number | null {
  if (from === DONE) return null
  if (t === 'backdo') {
    if (from === OFF) return null
    if (from in PREV) return PREV[from]
    return from - 1
  }
  const steps = THROW_STEPS[t]
  const route = routeFrom(from)
  const idx = Math.min(steps, route.length - 1)
  const node = route[idx]
  return node === END ? DONE : node
}

/** Nodes passed through (excluding start, including destination) — used for animation. */
export function pathOf(from: number, t: ThrowName): number[] {
  if (t === 'backdo') {
    const d = destination(from, t)
    return d == null ? [] : [d]
  }
  const route = routeFrom(from)
  const out: number[] = []
  for (let i = 1; i <= THROW_STEPS[t] && i < route.length; i++) {
    const n = route[i]
    out.push(n === END ? DONE : n)
    if (n === END) break
  }
  return out
}

export interface GameState {
  numPlayers: number
  settings: Settings
  pieces: Piece[]
  turn: number
  pending: ThrowName[] // throws waiting to be used
  canThrow: boolean // current player still has a throw to make
  winner: number | null
  log: string[]
}

export function newGame(numPlayers: number, settings: Settings): GameState {
  const pieces: Piece[] = []
  for (let p = 0; p < numPlayers; p++) for (let i = 0; i < settings.piecesPerPlayer; i++) pieces.push({ owner: p, pos: OFF })
  return { numPlayers, settings, pieces, turn: 0, pending: [], canThrow: true, winner: null, log: [] }
}

/** Pieces that move together with piece `idx` (stacked at the same node). */
export function stackOf(state: GameState, idx: number): number[] {
  const p = state.pieces[idx]
  if (p.pos === OFF || p.pos === DONE) return [idx]
  return state.pieces.flatMap((q, i) => (q.owner === p.owner && q.pos === p.pos ? [i] : []))
}

export interface Move {
  throwIndex: number
  piece: number // representative piece index
  to: number
}

/** All distinct legal moves for the current player (one representative per stack / one OFF piece). */
export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = []
  const seenThrow = new Set<ThrowName>()
  state.pending.forEach((t, throwIndex) => {
    if (seenThrow.has(t)) return
    seenThrow.add(t)
    const seenPos = new Set<number>()
    state.pieces.forEach((p, i) => {
      if (p.owner !== state.turn || p.pos === DONE || seenPos.has(p.pos)) return
      const to = destination(p.pos, t)
      if (to == null) return
      seenPos.add(p.pos)
      moves.push({ throwIndex, piece: i, to })
    })
  })
  return moves
}

export interface MoveOutcome {
  state: GameState
  captured: number
  finished: number
  stacked: boolean
}

export function applyMove(state: GameState, move: Move): MoveOutcome {
  const t = state.pending[move.throwIndex]
  const movers = stackOf(state, move.piece)
  const pieces = state.pieces.map((p) => ({ ...p }))
  let captured = 0
  let stacked = false
  if (move.to !== DONE) {
    pieces.forEach((q) => {
      if (q.pos === move.to && q.owner !== state.turn) {
        q.pos = OFF
        captured++
      } else if (q.pos === move.to && q.owner === state.turn && !movers.includes(pieces.indexOf(q))) {
        stacked = true
      }
    })
  }
  movers.forEach((i) => (pieces[i].pos = move.to))
  const pending = state.pending.filter((_, i) => i !== move.throwIndex)
  const finished = move.to === DONE ? movers.length : 0
  const winner = pieces.filter((p) => p.owner === state.turn).every((p) => p.pos === DONE) ? state.turn : null
  const canThrow = state.canThrow || captured > 0
  let next: GameState = { ...state, pieces, pending, canThrow, winner }
  const name = THROW_LABEL[t]
  next.log = [
    ...state.log.slice(-30),
    captured ? `${name}! ${captured}개 잡음 → 한 번 더` : finished ? `${name}! ${finished}개 났다` : stacked ? `${name}! 업었다` : name,
  ]
  if (winner == null) next = advanceIfStuck(next)
  return { state: next, captured, finished, stacked }
}

/** Record a throw result for the current player. */
export function addThrow(state: GameState, t: ThrowName): GameState {
  const next: GameState = { ...state, pending: [...state.pending, t], canThrow: isBonusThrow(t) }
  return advanceIfStuck(next)
}

/** If the player can't throw and has no legal move for any pending throw, pass the turn. */
export function advanceIfStuck(state: GameState): GameState {
  if (state.canThrow) return state
  if (state.pending.length > 0 && legalMoves(state).length > 0) return state
  return { ...state, pending: [], canThrow: true, turn: (state.turn + 1) % state.numPlayers }
}

// ---------- AI ----------

/** Shortest number of steps from a node to finishing (approx; OFF counts as 20). */
export function distanceToGoal(pos: number): number {
  if (pos === DONE) return 0
  if (pos === OFF) return 21
  const r = routeFrom(pos)
  return r.length - 1
}

function threatAt(state: GameState, node: number, owner: number): number {
  // How many enemy pieces can reach `node` with a single 1~5 throw.
  let threat = 0
  const seen = new Set<string>()
  for (const q of state.pieces) {
    if (q.owner === owner || q.pos === DONE) continue
    const key = `${q.owner}:${q.pos}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const t of ['do', 'gae', 'geol', 'yut', 'mo', 'backdo'] as ThrowName[]) {
      if (destination(q.pos, t) === node) {
        threat += t === 'gae' ? 0.375 : t === 'do' || t === 'geol' ? 0.25 : 0.0625
      }
    }
  }
  return threat
}

export function scoreMove(state: GameState, move: Move): number {
  const before = distanceToGoal(state.pieces[move.piece].pos)
  const { state: after, captured, finished, stacked } = applyMove({ ...state, canThrow: true }, move)
  const movers = stackOf(state, move.piece).length
  let score = (before - distanceToGoal(move.to)) * movers
  score += captured * 18
  score += finished * 12
  if (stacked) score += 4
  if (move.to !== DONE) {
    const myStack = after.pieces.filter((p) => p.owner === state.turn && p.pos === move.to).length
    score -= threatAt(after, move.to, state.turn) * 30 * myStack
    if ([5, 10, 22].includes(move.to)) score += 3 // shortcut corners
  }
  return score
}

export function chooseMove(state: GameState, difficulty: 'easy' | 'normal' | 'hard', rng = Math.random): Move | null {
  const moves = legalMoves(state)
  if (moves.length === 0) return null
  if (difficulty === 'easy' && rng() < 0.5) return moves[Math.floor(rng() * moves.length)]
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    let s = scoreMove(state, m)
    if (difficulty === 'normal') s += rng() * 6
    if (difficulty === 'hard') {
      // Prefer using big throws on far-back pieces only when nothing else matters: small tie-breaker.
      s += THROW_STEPS[state.pending[m.throwIndex]] * 0.01
    }
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  return best
}
