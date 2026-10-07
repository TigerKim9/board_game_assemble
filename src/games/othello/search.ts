// Generic negamax alpha-beta search with iterative deepening and a time budget.
// Shared by the two-player abstract games (othello, connect4, checkers, tictactoe).
// Supports "extra turns" (the side to move may stay the same after a move).

export const WIN = 1_000_000

export interface SearchGame<S, M> {
  /** Legal moves, best-first ordering helps pruning. Empty when the game is over. */
  moves(s: S): M[]
  play(s: S, m: M): S
  /** Index (0/1) of the side to move. */
  turn(s: S): number
  /** Static score from the perspective of turn(s). Terminal positions: ±WIN or 0. */
  evaluate(s: S): number
  /** Optional: false when the position is tactically unstable (search a bit deeper). */
  quiet?(s: S): boolean
}

export interface SearchOptions {
  maxDepth: number
  /** Time budget in ms (checked periodically). */
  timeMs?: number
  /** Random noise added to root scores when picking (weaker play). Forces exact root scores. */
  noise?: number
  rng?: () => number
  /** Extra plies allowed for non-quiet positions. */
  quiescence?: number
}

export interface SearchResult<M> {
  move: M
  score: number
  depth: number
  nodes: number
}

const ABORT = Symbol('abort')
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function searchBest<S, M>(g: SearchGame<S, M>, root: S, opts: SearchOptions): SearchResult<M> | null {
  const rootMoves = g.moves(root)
  if (rootMoves.length === 0) return null
  const rng = opts.rng ?? Math.random
  if (rootMoves.length === 1 && !opts.noise) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 }
  const deadline = opts.timeMs != null ? now() + opts.timeMs : Infinity
  const qMax = opts.quiescence ?? 0
  let nodes = 0
  const rootTurn = g.turn(root)

  const negamax = (s: S, depth: number, alpha: number, beta: number, ply: number): number => {
    nodes++
    if ((nodes & 511) === 0 && now() > deadline) throw ABORT
    const ms = g.moves(s)
    if (ms.length === 0) {
      const v = g.evaluate(s)
      return v >= WIN / 2 ? v - ply : v <= -WIN / 2 ? v + ply : v
    }
    if (depth <= 0) {
      if (depth <= -qMax || !g.quiet || g.quiet(s)) return g.evaluate(s)
    }
    const me = g.turn(s)
    let best = -Infinity
    for (const m of ms) {
      const c = g.play(s, m)
      const v =
        g.turn(c) === me
          ? negamax(c, depth - 1, alpha, beta, ply + 1)
          : -negamax(c, depth - 1, -beta, -alpha, ply + 1)
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
    }
    return best
  }

  const scoreChild = (m: M, depth: number, alpha: number, beta: number) => {
    const c = g.play(root, m)
    return g.turn(c) === rootTurn ? negamax(c, depth - 1, alpha, beta, 1) : -negamax(c, depth - 1, -beta, -alpha, 1)
  }

  // Light shuffle of the initial order so equal moves vary between games.
  let order = rootMoves.map((m, i) => ({ m, v: -i + rng() * 1.5 })).sort((a, b) => b.v - a.v)
  let result: SearchResult<M> = { move: rootMoves[0], score: 0, depth: 0, nodes: 0 }
  const exact = !!opts.noise
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const scored: { m: M; v: number }[] = []
    let alpha = -Infinity
    try {
      for (const { m } of order) {
        const v = exact ? scoreChild(m, depth, -Infinity, Infinity) : scoreChild(m, depth, alpha, Infinity)
        scored.push({ m, v })
        if (v > alpha) alpha = v
      }
    } catch (e) {
      if (e !== ABORT) throw e
      // Partial iteration: trust it only if the previous best was re-searched and something beat it.
      if (!exact && scored.length > 0 && depth > 1) {
        const top = scored.reduce((a, b) => (b.v > a.v ? b : a))
        result = { move: top.m, score: top.v, depth, nodes }
      }
      break
    }
    // Stable sort: best first (moves cut by alpha-beta keep their previous relative order).
    scored.sort((a, b) => b.v - a.v)
    order = scored
    result = { move: scored[0].m, score: scored[0].v, depth, nodes }
    if (Math.abs(scored[0].v) >= WIN / 2 && !exact) break
    if (now() > deadline) break
  }

  if (exact && opts.noise) {
    let best = order[0]
    let bestV = -Infinity
    for (const o of order) {
      // Never throw away a forced win or walk into a forced loss just because of noise.
      const v = o.v + (Math.abs(o.v) >= WIN / 2 ? 0 : rng() * opts.noise)
      if (v > bestV) {
        bestV = v
        best = o
      }
    }
    return { move: best.m, score: best.v, depth: result.depth, nodes }
  }
  return { ...result, nodes }
}
