import type { Difficulty } from '../../lib/types'

/** Air hockey physics on a portrait W×H table. Player 0 defends the bottom goal, player 1 the top goal. */

export const W = 300
export const H = 500
export const GOAL_W = 100
export const PUCK_R = 13
export const MALLET_R = 24
export const WIN_SCORE = 7
export const MAX_PUCK_SPEED = 1500
const FRICTION = 0.45 // per second (exponential)
const WALL_E = 0.9
const HIT_E = 0.92

export interface Body {
  x: number
  y: number
  vx: number
  vy: number
}
export interface Pt {
  x: number
  y: number
}

export type HockeyEvent =
  | { type: 'hit'; player: number; x: number; y: number; power: number }
  | { type: 'wall'; x: number; y: number; power: number }
  | { type: 'goal'; scorer: number }
  | { type: 'win'; winner: number }

export interface HockeyState {
  puck: Body
  mallets: [Body, Body]
  score: [number, number]
  /** Seconds left of the freeze after a goal. */
  freeze: number
  /** Who gets the puck after the freeze (the player who conceded). */
  serveTo: number | null
  winner: number | null
  /** Seconds the puck has been trapped in a corner. */
  stall: number
  events: HockeyEvent[]
}

export function newGame(): HockeyState {
  return {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    mallets: [
      { x: W / 2, y: H - 70, vx: 0, vy: 0 },
      { x: W / 2, y: 70, vx: 0, vy: 0 },
    ],
    score: [0, 0],
    freeze: 1,
    serveTo: 0,
    winner: null,
    stall: 0,
    events: [],
  }
}

/** Corners are hard to play out of: the table "air" frees a puck that stays trapped there. */
export function inCorner(p: Pt): boolean {
  const zone = PUCK_R + MALLET_R
  const nearSide = p.x < zone || p.x > W - zone
  const nearEnd = p.y < zone || p.y > H - zone
  return nearSide && nearEnd
}

/** Allowed area for a mallet centre. */
export function clampMallet(player: number, p: Pt): Pt {
  const x = Math.max(MALLET_R, Math.min(W - MALLET_R, p.x))
  const y =
    player === 0
      ? Math.max(H / 2 + MALLET_R * 0.3, Math.min(H - MALLET_R, p.y))
      : Math.max(MALLET_R, Math.min(H / 2 - MALLET_R * 0.3, p.y))
  return { x, y }
}

function placeServe(s: HockeyState, player: number) {
  s.puck = { x: W / 2, y: player === 0 ? H * 0.68 : H * 0.32, vx: 0, vy: 0 }
}

const inMouth = (x: number) => Math.abs(x - W / 2) < GOAL_W / 2

/**
 * Advance by dt seconds. `targets[i]` is where player i wants their mallet (null = stay);
 * `maxSpeed[i]` limits how fast it can get there.
 */
export function step(s: HockeyState, dt: number, targets: (Pt | null)[], maxSpeed: number[]): HockeyState {
  s.events = []
  if (s.winner != null) return s

  // Mallets
  const starts = s.mallets.map((m) => ({ x: m.x, y: m.y }))
  const ends = s.mallets.map((m, i) => {
    const t = targets[i]
    if (!t) return { x: m.x, y: m.y }
    const c = clampMallet(i, t)
    const dx = c.x - m.x
    const dy = c.y - m.y
    const d = Math.hypot(dx, dy)
    const maxD = maxSpeed[i] * dt
    if (d <= maxD) return c
    return clampMallet(i, { x: m.x + (dx / d) * maxD, y: m.y + (dy / d) * maxD })
  })
  s.mallets.forEach((m, i) => {
    m.vx = (ends[i].x - starts[i].x) / dt
    m.vy = (ends[i].y - starts[i].y) / dt
  })

  if (s.freeze > 0) {
    s.freeze -= dt
    s.mallets.forEach((m, i) => {
      m.x = ends[i].x
      m.y = ends[i].y
    })
    if (s.freeze <= 0 && s.serveTo != null) {
      placeServe(s, s.serveTo)
      s.serveTo = null
    }
    return s
  }

  const p = s.puck
  const moveDist = Math.max(
    Math.hypot(p.vx, p.vy) * dt,
    ...s.mallets.map((_, i) => Math.hypot(ends[i].x - starts[i].x, ends[i].y - starts[i].y)),
  )
  const n = Math.max(1, Math.ceil(moveDist / 4))
  const h = dt / n
  const hitThisStep = [false, false]
  for (let k = 1; k <= n; k++) {
    // interpolate mallets
    s.mallets.forEach((m, i) => {
      m.x = starts[i].x + ((ends[i].x - starts[i].x) * k) / n
      m.y = starts[i].y + ((ends[i].y - starts[i].y) * k) / n
    })
    p.x += p.vx * h
    p.y += p.vy * h

    // side walls
    if (p.x < PUCK_R) {
      p.x = PUCK_R
      if (p.vx < 0) {
        s.events.push({ type: 'wall', x: p.x, y: p.y, power: Math.abs(p.vx) })
        p.vx = -p.vx * WALL_E
      }
    } else if (p.x > W - PUCK_R) {
      p.x = W - PUCK_R
      if (p.vx > 0) {
        s.events.push({ type: 'wall', x: p.x, y: p.y, power: Math.abs(p.vx) })
        p.vx = -p.vx * WALL_E
      }
    }
    // end walls (except the goal mouth)
    for (const [wallY, sign] of [
      [0, 1],
      [H, -1],
    ] as const) {
      const dist = (p.y - wallY) * sign
      if (dist < PUCK_R && !inMouth(p.x)) {
        p.y = wallY + sign * PUCK_R
        if (p.vy * sign < 0) {
          s.events.push({ type: 'wall', x: p.x, y: p.y, power: Math.abs(p.vy) })
          p.vy = -p.vy * WALL_E
        }
      }
      // goal posts (treated as points)
      for (const px of [W / 2 - GOAL_W / 2, W / 2 + GOAL_W / 2]) {
        const dx = p.x - px
        const dy = p.y - wallY
        const d = Math.hypot(dx, dy)
        if (d < PUCK_R && d > 0) {
          const nx = dx / d
          const ny = dy / d
          p.x = px + nx * PUCK_R
          p.y = wallY + ny * PUCK_R
          const vn = p.vx * nx + p.vy * ny
          if (vn < 0) {
            p.vx -= (1 + WALL_E) * vn * nx
            p.vy -= (1 + WALL_E) * vn * ny
          }
        }
      }
    }

    // mallets
    s.mallets.forEach((m, i) => {
      const dx = p.x - m.x
      const dy = p.y - m.y
      const d = Math.hypot(dx, dy)
      const min = PUCK_R + MALLET_R
      if (d >= min) return
      const nx = d > 0 ? dx / d : 0
      const ny = d > 0 ? dy / d : i === 0 ? -1 : 1
      p.x = m.x + nx * min
      p.y = m.y + ny * min
      const rvx = p.vx - m.vx
      const rvy = p.vy - m.vy
      const vn = rvx * nx + rvy * ny
      if (vn < 0) {
        p.vx -= (1 + HIT_E) * vn * nx
        p.vy -= (1 + HIT_E) * vn * ny
        if (!hitThisStep[i]) {
          hitThisStep[i] = true
          s.events.push({ type: 'hit', player: i, x: m.x + nx * MALLET_R, y: m.y + ny * MALLET_R, power: -vn })
        }
      }
      // keep the puck inside the table even when squeezed against a wall
      p.x = Math.max(PUCK_R, Math.min(W - PUCK_R, p.x))
    })

    // goal?
    if (p.y < -PUCK_R || p.y > H + PUCK_R) {
      const scorer = p.y < 0 ? 0 : 1
      s.score[scorer]++
      s.events.push({ type: 'goal', scorer })
      if (s.score[scorer] >= WIN_SCORE) {
        s.winner = scorer
        s.events.push({ type: 'win', winner: scorer })
      } else {
        s.freeze = 1.2
        s.serveTo = 1 - scorer
      }
      p.vx = 0
      p.vy = 0
      p.y = scorer === 0 ? -PUCK_R * 3 : H + PUCK_R * 3
      return s
    }
  }

  // anti-stall: nudge a trapped puck out of a corner
  if (inCorner(p) && Math.hypot(p.vx, p.vy) < 250) {
    s.stall += dt
    if (s.stall > 1.2) {
      s.stall = 0
      const dx = W / 2 - p.x
      const dy = H / 2 - p.y
      const d = Math.hypot(dx, dy)
      p.vx = (dx / d) * 260
      p.vy = (dy / d) * 260
    }
  } else s.stall = 0

  // friction + speed cap
  const f = Math.exp(-FRICTION * dt)
  p.vx *= f
  p.vy *= f
  const sp = Math.hypot(p.vx, p.vy)
  if (sp > MAX_PUCK_SPEED) {
    p.vx *= MAX_PUCK_SPEED / sp
    p.vy *= MAX_PUCK_SPEED / sp
  }
  if (sp < 3) {
    p.vx = 0
    p.vy = 0
  }
  return s
}

// ---------- AI ----------

export const AI_LEVEL: Record<Difficulty, { speed: number; error: number; predict: boolean; attackSpeed: number; react: number }> = {
  easy: { speed: 420, error: 28, predict: false, attackSpeed: 260, react: 0.25 },
  normal: { speed: 720, error: 12, predict: true, attackSpeed: 520, react: 0.12 },
  hard: { speed: 1150, error: 4, predict: true, attackSpeed: 900, react: 0.04 },
}

export interface AIMemory {
  aimX: number
  /** Re-plan countdown (reaction time). */
  wait: number
  target: Pt
  mode: 'defend' | 'attack' | 'retreat'
}

export const newAIMemory = (): AIMemory => ({ aimX: W / 2, wait: 0, target: { x: W / 2, y: 70 }, mode: 'defend' })

/** Predict the puck's x when it reaches height y, bouncing off the side walls. */
export function predictX(p: Body, y: number): number | null {
  if (p.vy === 0 || (y - p.y) / p.vy < 0) return null
  const t = (y - p.y) / p.vy
  let x = p.x + p.vx * t
  const lo = PUCK_R
  const hi = W - PUCK_R
  const span = hi - lo
  // reflect into range
  let u = (x - lo) % (2 * span)
  if (u < 0) u += 2 * span
  x = u <= span ? lo + u : hi - (u - span)
  return x
}

/**
 * Where should AI player `idx` move its mallet? Works for either side by mirroring
 * the table so the AI always "defends the top".
 */
export function aiTarget(s: HockeyState, idx: number, difficulty: Difficulty, mem: AIMemory, dt: number, rng: () => number = Math.random): Pt {
  const lvl = AI_LEVEL[difficulty]
  const flip = idx === 0
  const fy = (y: number) => (flip ? H - y : y)
  const puck: Body = { x: s.puck.x, y: fy(s.puck.y), vx: s.puck.vx, vy: flip ? -s.puck.vy : s.puck.vy }
  const me = { x: s.mallets[idx].x, y: fy(s.mallets[idx].y) }

  mem.wait -= dt
  if (mem.wait > 0 && s.freeze <= 0) return { x: mem.target.x, y: fy(mem.target.y) }
  mem.wait = lvl.react

  const err = () => (rng() - 0.5) * 2 * lvl.error
  let t: Pt
  const inMyHalf = puck.y < H / 2 + PUCK_R
  // In this mirrored frame negative vy means the puck is coming at my goal.
  const attackable = puck.vy > -AI_LEVEL[difficulty].attackSpeed * 0.6 && puck.vy < 260

  if (s.freeze > 0) {
    t = { x: W / 2, y: 70 }
    mem.mode = 'defend'
  } else if (inCorner(puck) && Math.hypot(puck.vx, puck.vy) < 250) {
    // Don't pin the puck in a corner — back off and wait for it to come out.
    mem.mode = 'retreat'
    t = { x: W / 2 + (puck.x < W / 2 ? 30 : -30), y: puck.y < H / 2 ? 100 : H / 2 - 40 }
  } else if (inMyHalf && attackable) {
    // Attack: get behind the puck (relative to the target goal) and drive through it.
    if (mem.mode !== 'attack') {
      mem.aimX = W / 2 + (rng() - 0.5) * (difficulty === 'hard' ? GOAL_W * 0.6 : GOAL_W * 1.2)
      // Hard AI sometimes aims a bank shot off a side wall.
      if (difficulty === 'hard' && rng() < 0.3) mem.aimX = rng() < 0.5 ? -W * 0.6 : W * 1.6
    }
    mem.mode = 'attack'
    const ax = mem.aimX - puck.x
    const ay = H - puck.y
    const al = Math.hypot(ax, ay) || 1
    const dx = ax / al
    const dy = ay / al
    const behind = { x: puck.x - dx * (PUCK_R + MALLET_R + 6), y: puck.y - dy * (PUCK_R + MALLET_R + 6) }
    const isBehind = me.y < puck.y - 4 && Math.hypot(me.x - behind.x, me.y - behind.y) < 30
    if (isBehind || me.y < puck.y - PUCK_R - MALLET_R * 0.5) {
      // strike through
      t = { x: puck.x + dx * 40 + err() * 0.3, y: puck.y + dy * 40 }
    } else {
      // go around the puck to get behind it
      const side = me.x < puck.x ? -1 : 1
      t = { x: puck.x + side * (PUCK_R + MALLET_R + 8), y: Math.min(behind.y, puck.y - 10) }
    }
  } else {
    // Defend: stay between the puck and the goal.
    mem.mode = 'defend'
    const guardY = 58
    let x = W / 2 + (puck.x - W / 2) * 0.45
    if (lvl.predict && puck.vy < -40) {
      const px = predictX(puck, guardY)
      if (px != null) x = W / 2 + (px - W / 2) * 0.85
    }
    t = { x: Math.max(W / 2 - GOAL_W * 0.75, Math.min(W / 2 + GOAL_W * 0.75, x)) + err(), y: guardY }
  }
  mem.target = { x: t.x, y: t.y }
  return { x: t.x, y: fy(t.y) }
}

/** Speed limit for an AI mallet: slower when lining up, faster when striking. */
export function aiSpeed(difficulty: Difficulty, mem: AIMemory) {
  const lvl = AI_LEVEL[difficulty]
  return mem.mode === 'attack' ? Math.max(lvl.speed, lvl.attackSpeed * 1.4) : lvl.speed
}
