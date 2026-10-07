import type { Difficulty } from '../../lib/types'

export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Pt {
  x: number
  y: number
}

export interface Snake {
  /** Head first. */
  body: Pt[]
  dir: Dir
  /** Buffered turns (applied one per tick). */
  queue: Dir[]
  alive: boolean
  score: number
  /** Segments still to grow. */
  grow: number
  eaten: number
}

export type FoodKind = 'apple' | 'gold'
export interface Food extends Pt {
  kind: FoodKind
  /** Ticks left before a golden fruit disappears. */
  ttl: number
}

export type SnakeEvent =
  | { type: 'eat'; snake: number; x: number; y: number; kind: FoodKind; points: number }
  | { type: 'die'; snake: number; x: number; y: number }

export interface SnakeState {
  cols: number
  rows: number
  wrap: boolean
  /** 1..4 — affects points per fruit. */
  speed: number
  snakes: Snake[]
  foods: Food[]
  tick: number
  over: boolean
  /** Index of the winner in versus games, -1 for a draw, null when not decided / solo. */
  winner: number | null
  events: SnakeEvent[]
}

export const COLS = 20
export const ROWS = 24

export const SPEEDS = [
  { label: '느긋', ms: 170 },
  { label: '보통', ms: 125 },
  { label: '빠름', ms: 90 },
  { label: '번개', ms: 65 },
]

export const DELTA: Record<Dir, Pt> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
export const DIRS: Dir[] = ['up', 'right', 'down', 'left']
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

const key = (x: number, y: number) => y * 1000 + x

/** Milliseconds per tick: starts at the chosen speed and gets a little faster as the snake grows. */
export function tickInterval(speed: number, eaten: number): number {
  const base = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, speed - 1))].ms
  return Math.max(base * 0.6, base * (1 - eaten * 0.008))
}

export function applePoints(speed: number) {
  return 10 + 5 * (speed - 1)
}

function makeSnake(x: number, y: number, dir: Dir, len = 4): Snake {
  const d = DELTA[dir]
  const body: Pt[] = []
  for (let i = 0; i < len; i++) body.push({ x: x - d.x * i, y: y - d.y * i })
  return { body, dir, queue: [], alive: true, score: 0, grow: 0, eaten: 0 }
}

export function newGame(players: number, opts: { wrap: boolean; speed: number }, rng: () => number = Math.random): SnakeState {
  const snakes =
    players === 1
      ? [makeSnake(Math.floor(COLS / 2), Math.floor(ROWS / 2), 'right')]
      : [makeSnake(4, ROWS - 6, 'up'), makeSnake(COLS - 5, 5, 'down')]
  const s: SnakeState = {
    cols: COLS,
    rows: ROWS,
    wrap: opts.wrap,
    speed: opts.speed,
    snakes,
    foods: [],
    tick: 0,
    over: false,
    winner: null,
    events: [],
  }
  const apples = players === 1 ? 1 : 2
  for (let i = 0; i < apples; i++) spawnFood(s, 'apple', rng)
  return s
}

function occupied(s: SnakeState): Set<number> {
  const set = new Set<number>()
  for (const sn of s.snakes) if (sn.alive) for (const p of sn.body) set.add(key(p.x, p.y))
  for (const f of s.foods) set.add(key(f.x, f.y))
  return set
}

export function spawnFood(s: SnakeState, kind: FoodKind, rng: () => number): boolean {
  const occ = occupied(s)
  const free: Pt[] = []
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) if (!occ.has(key(x, y))) free.push({ x, y })
  if (!free.length) return false
  const p = free[Math.floor(rng() * free.length)]
  s.foods.push({ ...p, kind, ttl: kind === 'gold' ? 60 : Infinity })
  return true
}

/** Queue a turn for a snake. Ignores reversals and duplicates. */
export function queueTurn(sn: Snake, dir: Dir) {
  const last = sn.queue.length ? sn.queue[sn.queue.length - 1] : sn.dir
  if (dir === last || dir === OPPOSITE[last]) return
  if (sn.queue.length >= 3) return
  sn.queue.push(dir)
}

export function nextHead(s: SnakeState, p: Pt, dir: Dir): Pt | null {
  const d = DELTA[dir]
  let x = p.x + d.x
  let y = p.y + d.y
  if (s.wrap) {
    x = (x + s.cols) % s.cols
    y = (y + s.rows) % s.rows
  } else if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) return null
  return { x, y }
}

function clone(s: SnakeState): SnakeState {
  return {
    ...s,
    snakes: s.snakes.map((sn) => ({ ...sn, body: sn.body.slice(), queue: sn.queue.slice() })),
    foods: s.foods.map((f) => ({ ...f })),
    events: [],
  }
}

/** Advance one tick. Pure: returns a new state. */
export function step(prev: SnakeState, rng: () => number = Math.random): SnakeState {
  if (prev.over) return prev
  const s = clone(prev)
  s.tick++
  const heads: (Pt | null)[] = s.snakes.map((sn) => {
    if (!sn.alive) return null
    while (sn.queue.length) {
      const d = sn.queue.shift()!
      if (d !== OPPOSITE[sn.dir] && d !== sn.dir) {
        sn.dir = d
        break
      }
    }
    return nextHead(s, sn.body[0], sn.dir)
  })

  // Eat first so growth is known before tails move.
  const willEat: (Food | undefined)[] = heads.map((h) => (h ? s.foods.find((f) => f.x === h.x && f.y === h.y) : undefined))

  // Bodies after this move (tail leaves unless growing / eating).
  const nextBodies = s.snakes.map((sn, i) => {
    if (!sn.alive) return sn.body
    const keepTail = sn.grow > 0 || !!willEat[i]
    return keepTail ? sn.body : sn.body.slice(0, -1)
  })

  const dies = s.snakes.map((sn, i) => {
    if (!sn.alive) return false
    const h = heads[i]
    if (!h) return true // hit the wall
    for (let j = 0; j < s.snakes.length; j++) {
      if (!s.snakes[j].alive) continue
      if (nextBodies[j].some((p) => p.x === h.x && p.y === h.y)) return true
      if (j !== i && heads[j] && heads[j]!.x === h.x && heads[j]!.y === h.y) return true
    }
    return false
  })

  s.snakes.forEach((sn, i) => {
    if (!sn.alive) return
    if (dies[i]) {
      sn.alive = false
      const p = heads[i] ?? sn.body[0]
      s.events.push({ type: 'die', snake: i, x: p.x, y: p.y })
      return
    }
    const h = heads[i]!
    sn.body = [h, ...nextBodies[i]]
    if (sn.grow > 0 && !willEat[i]) sn.grow--
    const food = willEat[i]
    if (food) {
      const points = food.kind === 'gold' ? applePoints(s.speed) * 5 : applePoints(s.speed)
      sn.score += points
      sn.eaten++
      sn.grow += food.kind === 'gold' ? 2 : 0
      s.foods = s.foods.filter((f) => f !== food)
      s.events.push({ type: 'eat', snake: i, x: h.x, y: h.y, kind: food.kind, points })
      // No room left for a new apple: the board is full — a perfect game.
      if (food.kind === 'apple' && !spawnFood(s, 'apple', rng)) s.over = true
    }
  })

  // Golden fruit: occasional, short-lived.
  s.foods = s.foods.filter((f) => f.kind !== 'gold' || --f.ttl > 0)
  if (!s.foods.some((f) => f.kind === 'gold') && s.tick > 40 && rng() < 0.012) spawnFood(s, 'gold', rng)

  const alive = s.snakes.map((sn, i) => (sn.alive ? i : -1)).filter((i) => i >= 0)
  if (s.snakes.length === 1) {
    if (!alive.length) s.over = true
  } else if (alive.length <= 1) {
    s.over = true
    if (alive.length === 1) s.winner = alive[0]
    else {
      // Crashed on the same tick: higher score wins.
      const [a, b] = s.snakes
      s.winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1
    }
  }
  return s
}

// ---------- AI ----------

function blockedSet(s: SnakeState): Set<number> {
  const set = new Set<number>()
  for (const sn of s.snakes) {
    if (!sn.alive) continue
    // The tail will move away next tick unless the snake is growing.
    const body = sn.grow > 0 ? sn.body : sn.body.slice(0, -1)
    for (const p of body) set.add(key(p.x, p.y))
  }
  return set
}

function neighbors(s: SnakeState, p: Pt): Pt[] {
  const out: Pt[] = []
  for (const d of DIRS) {
    const n = nextHead(s, p, d)
    if (n) out.push(n)
  }
  return out
}

/** Number of free cells reachable from `start` (capped). */
export function floodSize(s: SnakeState, start: Pt, blocked: Set<number>, cap = 400): number {
  const seen = new Set<number>([key(start.x, start.y)])
  const queue = [start]
  while (queue.length && seen.size < cap) {
    const p = queue.shift()!
    for (const n of neighbors(s, p)) {
      const k = key(n.x, n.y)
      if (seen.has(k) || blocked.has(k)) continue
      seen.add(k)
      queue.push(n)
    }
  }
  return seen.size
}

function foodDistance(s: SnakeState, start: Pt, blocked: Set<number>, preferGold: boolean): number {
  const targets = new Map<number, number>()
  for (const f of s.foods) targets.set(key(f.x, f.y), f.kind === 'gold' && preferGold ? -6 : 0)
  const seen = new Set<number>([key(start.x, start.y)])
  let frontier = [start]
  let dist = 0
  let best = Infinity
  while (frontier.length && dist < best + 8) {
    const next: Pt[] = []
    for (const p of frontier) {
      const k = key(p.x, p.y)
      if (targets.has(k)) best = Math.min(best, dist + targets.get(k)!)
      for (const n of neighbors(s, p)) {
        const nk = key(n.x, n.y)
        if (seen.has(nk) || blocked.has(nk)) continue
        seen.add(nk)
        next.push(n)
      }
    }
    frontier = next
    dist++
  }
  return best
}

/** Pick a direction for snake `idx`. Easy is greedy and sometimes careless, hard avoids traps and head-ons. */
export function aiChooseDir(s: SnakeState, idx: number, difficulty: Difficulty, rng: () => number = Math.random): Dir {
  const sn = s.snakes[idx]
  const blocked = blockedSet(s)
  const head = sn.body[0]
  const options = DIRS.filter((d) => d !== OPPOSITE[sn.dir])
    .map((d) => ({ d, p: nextHead(s, head, d) }))
    .filter((o): o is { d: Dir; p: Pt } => !!o.p && !blocked.has(key(o.p.x, o.p.y)))
  if (!options.length) return sn.dir

  if (difficulty === 'easy' && rng() < 0.12) return options[Math.floor(rng() * options.length)].d

  const others = s.snakes.filter((o, j) => j !== idx && o.alive)
  const scored = options.map(({ d, p }) => {
    const b2 = new Set(blocked)
    b2.add(key(p.x, p.y))
    let score = 0
    const dist = foodDistance(s, p, blocked, difficulty === 'hard')
    score -= dist === Infinity ? 60 : dist
    if (difficulty !== 'easy') {
      const room = floodSize(s, p, b2, sn.body.length * 2 + 20)
      if (room < sn.body.length + 2) score -= 1000 - room * 5
    }
    if (difficulty === 'hard') {
      for (const o of others) {
        const near = neighbors(s, o.body[0]).some((q) => q.x === p.x && q.y === p.y)
        if (near) score -= 200
      }
    }
    if (d === sn.dir) score += 0.3 // prefer going straight on ties
    return { d, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].d
}
