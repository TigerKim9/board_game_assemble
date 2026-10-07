import type { Difficulty } from '../../lib/types'

// Board of n×n boxes. Horizontal edges h(r,c) = r*n + c (r 0..n, c 0..n-1),
// vertical edges v(r,c) = H + r*(n+1) + c (r 0..n-1, c 0..n), where H = (n+1)*n.

export interface DbState {
  n: number
  players: number
  /** -1 = not drawn, otherwise the player who drew it. */
  edges: number[]
  /** -1 = open, otherwise the player who completed it. */
  boxes: number[]
  turn: number
  last: number | null
  /** Boxes completed by the last move. */
  lastBoxes: number[]
  over: boolean
  moveNo: number
}

interface Geo {
  H: number
  E: number
  boxEdges: number[][]
  edgeBoxes: number[][]
}

const geoCache = new Map<number, Geo>()
export function geo(n: number): Geo {
  let g = geoCache.get(n)
  if (g) return g
  const H = (n + 1) * n
  const E = H + n * (n + 1)
  const boxEdges: number[][] = []
  const edgeBoxes: number[][] = Array.from({ length: E }, () => [])
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const b = r * n + c
      const es = [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]
      boxEdges.push(es)
      for (const e of es) edgeBoxes[e].push(b)
    }
  g = { H, E, boxEdges, edgeBoxes }
  geoCache.set(n, g)
  return g
}

/** Endpoints of an edge in dot coordinates [x1, y1, x2, y2]. */
export function edgeCoords(n: number, e: number): [number, number, number, number] {
  const { H } = geo(n)
  if (e < H) {
    const r = Math.floor(e / n)
    const c = e % n
    return [c, r, c + 1, r]
  }
  const k = e - H
  const r = Math.floor(k / (n + 1))
  const c = k % (n + 1)
  return [c, r, c, r + 1]
}

export function initialState(n: number, players: number): DbState {
  const { E } = geo(n)
  return {
    n,
    players,
    edges: Array(E).fill(-1),
    boxes: Array(n * n).fill(-1),
    turn: 0,
    last: null,
    lastBoxes: [],
    over: false,
    moveNo: 0,
  }
}

const sidesOf = (edges: ArrayLike<number>, be: number[]) =>
  (edges[be[0]] >= 0 ? 1 : 0) + (edges[be[1]] >= 0 ? 1 : 0) + (edges[be[2]] >= 0 ? 1 : 0) + (edges[be[3]] >= 0 ? 1 : 0)

export function applyMove(s: DbState, e: number): DbState {
  if (s.over || s.edges[e] >= 0) return s
  const { boxEdges, edgeBoxes } = geo(s.n)
  const edges = s.edges.slice()
  edges[e] = s.turn
  const boxes = s.boxes.slice()
  const done: number[] = []
  for (const b of edgeBoxes[e])
    if (sidesOf(edges, boxEdges[b]) === 4) {
      boxes[b] = s.turn
      done.push(b)
    }
  const over = boxes.every((o) => o >= 0)
  return {
    ...s,
    edges,
    boxes,
    turn: done.length || over ? s.turn : (s.turn + 1) % s.players,
    last: e,
    lastBoxes: done,
    over,
    moveNo: s.moveNo + 1,
  }
}

export function scores(s: DbState): number[] {
  const out = Array(s.players).fill(0)
  for (const o of s.boxes) if (o >= 0) out[o]++
  return out
}

// ---------- AI ----------

const undrawn = (edges: ArrayLike<number>) => {
  const out: number[] = []
  for (let i = 0; i < edges.length; i++) if (edges[i] < 0) out.push(i)
  return out
}

/** Edges that complete a box right now. */
export function completingEdges(s: Pick<DbState, 'n' | 'edges'>): number[] {
  const { boxEdges, edgeBoxes } = geo(s.n)
  return undrawn(s.edges).filter((e) => edgeBoxes[e].some((b) => sidesOf(s.edges, boxEdges[b]) === 3))
}

/** Edges that don't hand the opponent a box (no adjacent box reaches 3 sides). */
export function safeEdges(s: Pick<DbState, 'n' | 'edges'>): number[] {
  const { boxEdges, edgeBoxes } = geo(s.n)
  return undrawn(s.edges).filter((e) => edgeBoxes[e].every((b) => sidesOf(s.edges, boxEdges[b]) < 2))
}

/** Draws every box-completing edge greedily; returns boxes captured. Mutates edges. */
function greedyCapture(n: number, edges: number[]): number {
  const { boxEdges } = geo(n)
  let total = 0
  for (;;) {
    let found = -1
    for (let b = 0; b < boxEdges.length && found < 0; b++) {
      const be = boxEdges[b]
      if (sidesOf(edges, be) === 3) found = be.find((x) => edges[x] < 0)!
    }
    if (found < 0) return total
    edges[found] = 0
    for (const b of geo(n).edgeBoxes[found]) if (sidesOf(edges, boxEdges[b]) === 4) total++
  }
}

/** How many boxes the next player grabs if we draw e (and they take everything). */
export function sacrificeSize(n: number, edges: number[], e: number): number {
  const c = edges.slice()
  c[e] = 0
  return greedyCapture(n, c)
}

/** Opening the cheapest edge; ties prefer the "hard-hearted" handout that leaves both boxes capturable. */
function cheapestOpening(n: number, edges: number[], cands: number[], rng: () => number): number {
  const { boxEdges, edgeBoxes } = geo(n)
  let best = cands[0]
  let bestV = Infinity
  for (const e of cands) {
    const cost = sacrificeSize(n, edges, e)
    const c = edges.slice()
    c[e] = 0
    const both = edgeBoxes[e].length === 2 && edgeBoxes[e].every((b) => sidesOf(c, boxEdges[b]) === 3)
    const v = cost * 10 - (both ? 5 : 0) + rng()
    if (v < bestV) {
      bestV = v
      best = e
    }
  }
  return best
}

/** Sizes of the components that will be handed out one by one once no safe edges remain. */
export function componentSizes(n: number, edgesIn: number[]): number[] {
  const edges = edgesIn.slice()
  const out: number[] = []
  for (;;) {
    const cands = undrawn(edges)
    if (!cands.length) return out
    let best = cands[0]
    let bestCost = Infinity
    for (const e of cands) {
      const cost = sacrificeSize(n, edges, e)
      if (cost < bestCost) {
        bestCost = cost
        best = e
      }
    }
    edges[best] = 0
    const got = greedyCapture(n, edges)
    out.push(got)
  }
}

/** Net boxes for the player in control when the opponent must open one of `comps` next. */
export function controlValue(comps: number[], memo = new Map<string, number>()): number {
  if (!comps.length) return 0
  const key = comps.slice().sort((a, b) => a - b).join(',')
  const m = memo.get(key)
  if (m != null) return m
  let worst = Infinity
  const seen = new Set<number>()
  comps.forEach((c, i) => {
    if (seen.has(c)) return
    seen.add(c)
    const rest = comps.filter((_, j) => j !== i)
    const vr = controlValue(rest, memo)
    const take = c - vr
    const keep = c >= 3 ? c - 4 + vr : -Infinity
    worst = Math.min(worst, Math.max(take, keep))
  })
  memo.set(key, worst)
  return worst
}

/**
 * If we're capturing the last two boxes of a chain (A has 3 sides, B next to it has 2), returns the edge
 * that declines them (double-dealing) and the edge that takes A, otherwise null.
 */
function doubleDealOption(s: DbState): { decline: number; take: number } | null {
  const { boxEdges, edgeBoxes } = geo(s.n)
  const three = s.boxes.flatMap((_, b) => (s.boxes[b] < 0 && sidesOf(s.edges, boxEdges[b]) === 3 ? [b] : []))
  if (three.length !== 1) return null
  const A = three[0]
  const eAB = boxEdges[A].find((x) => s.edges[x] < 0)!
  const B = edgeBoxes[eAB].find((b) => b !== A)
  if (B == null || sidesOf(s.edges, boxEdges[B]) !== 2) return null
  const f = boxEdges[B].find((x) => x !== eAB && s.edges[x] < 0)!
  // Drawing f must not touch another box that would become capturable (chain ends here).
  const C = edgeBoxes[f].find((b) => b !== B)
  if (C != null && sidesOf(s.edges, boxEdges[C]) >= 2) return null
  return { decline: f, take: eAB }
}

export function aiMove(s: DbState, diff: Difficulty, rng: () => number = Math.random): number | null {
  if (s.over) return null
  const all = undrawn(s.edges)
  if (!all.length) return null
  const pick = (xs: number[]) => xs[Math.floor(rng() * xs.length)]
  const comp = completingEdges(s)
  const safe = safeEdges(s)

  if (diff === 'easy') {
    if (comp.length && rng() < 0.7) return pick(comp)
    if (safe.length && rng() < 0.6) return pick(safe)
    return pick(all)
  }

  if (comp.length) {
    if (diff === 'hard') {
      const dd = doubleDealOption(s)
      if (dd) {
        // Would any safe edge remain after taking these two boxes?
        const after = s.edges.slice()
        after[dd.take] = s.turn
        after[dd.decline] = s.turn
        const restSafe = safeEdges({ n: s.n, edges: after })
        if (!restSafe.length) {
          const rest = componentSizes(s.n, after)
          const vr = controlValue(rest)
          if (rest.length && -2 + vr > 2 - vr) return dd.decline
        }
      }
    }
    return pick(comp)
  }
  if (safe.length) {
    if (diff === 'hard') return hardSafeMove(s, safe, rng)
    return pick(safe)
  }
  return cheapestOpening(s.n, s.edges, all, rng)
}

/**
 * Hard safe-phase move: with few safe moves left, search the remaining safe moves; when they run out the player
 * to move must open a component, scored with the chain-control value of what remains.
 */
function hardSafeMove(s: DbState, safe: number[], rng: () => number): number {
  if (safe.length > 9) return safe[Math.floor(rng() * safe.length)]
  const memo = new Map<string, number>()
  const cvMemo = new Map<string, number>()
  // Net boxes (from here on) for the player to move.
  const val = (edges: number[]): number => {
    const key = edges.map((x) => (x >= 0 ? 1 : 0)).join('')
    const m = memo.get(key)
    if (m != null) return m
    const sf = safeEdges({ n: s.n, edges })
    let res: number
    if (!sf.length) res = -controlValue(componentSizes(s.n, edges), cvMemo)
    else {
      res = -Infinity
      for (const e of sf) {
        edges[e] = 0
        const v = -val(edges)
        edges[e] = -1
        if (v > res) res = v
        if (memo.size > 3000) break
      }
    }
    memo.set(key, res)
    return res
  }
  const edges = s.edges.slice()
  let best: number[] = []
  let bestV = -Infinity
  for (const e of safe) {
    edges[e] = 0
    const v = -val(edges)
    edges[e] = -1
    if (v > bestV) {
      bestV = v
      best = [e]
    } else if (v === bestV) best.push(e)
  }
  return best[Math.floor(rng() * best.length)]
}
