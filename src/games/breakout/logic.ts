/** Pure breakout simulation. Units are logical pixels on a W×H field. */

export const W = 360
export const H = 560
export const BRICK_COLS = 10
export const BRICK_MARGIN = 8
export const BRICK_GAP = 2
export const BRICK_TOP = 56
export const BRICK_H = 16
export const BRICK_W = (W - BRICK_MARGIN * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS
export const PADDLE_Y = H - 44
export const PADDLE_H = 12
export const PADDLE_W = 66
export const WIDE_W = 104
export const BALL_R = 6
export const MAX_BALLS = 12
export const STEEL = 9

export type PowerType = 'multi' | 'wide' | 'laser' | 'slow' | 'life'

export interface Brick {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  steel: boolean
  row: number
}
export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  stuck: boolean
  /** Offset from the paddle centre while stuck. */
  offset: number
}
export interface Drop {
  x: number
  y: number
  type: PowerType
}
export interface Bolt {
  x: number
  y: number
}

export type BreakoutEvent =
  | { type: 'brick'; x: number; y: number; destroyed: boolean; steel: boolean; hp: number; maxHp: number }
  | { type: 'paddle'; x: number; y: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'power'; power: PowerType; x: number; y: number }
  | { type: 'lose' }
  | { type: 'cleared' }
  | { type: 'over' }

export interface BreakoutState {
  level: number
  score: number
  lives: number
  paddleX: number
  paddleW: number
  balls: Ball[]
  bricks: Brick[]
  drops: Drop[]
  bolts: Bolt[]
  timers: { wide: number; laser: number; slow: number }
  laserCd: number
  /** Ball speed (px/s) before the slow modifier. */
  speed: number
  phase: 'play' | 'cleared' | 'over'
  events: BreakoutEvent[]
}

export interface Input {
  /** Absolute paddle centre target (mouse / drag) or null. */
  paddleX: number | null
  /** Keyboard direction. */
  move: -1 | 0 | 1
  launch: boolean
}

export const NO_INPUT: Input = { paddleX: null, move: 0, launch: false }

export function baseSpeed(level: number) {
  return Math.min(300 + level * 9, 470)
}

// ---------- level generation ----------

type Shape = (r: number, c: number, rows: number) => boolean

const bitmap = (rows: string[]): Shape => (r, c) => (rows[r]?.[c] ?? '.') === '#'

const SHAPES: { name: string; rows: number; shape: Shape }[] = [
  { name: '줄무늬', rows: 5, shape: () => true },
  { name: '피라미드', rows: 7, shape: (r, c) => Math.abs(c - 4.5) <= r * 0.75 + 0.5 },
  { name: '체크무늬', rows: 8, shape: (r, c) => (r + c) % 2 === 0 },
  { name: '다이아몬드', rows: 9, shape: (r, c) => Math.abs(c - 4.5) + Math.abs(r - 4) * 1.1 <= 5 },
  { name: '기둥', rows: 8, shape: (_r, c) => c % 3 !== 2 },
  { name: '액자', rows: 8, shape: (r, c, rows) => r === 0 || r === rows - 1 || c === 0 || c === 9 || (r >= 3 && r <= 4 && c >= 3 && c <= 6) },
  {
    name: '외계인',
    rows: 8,
    shape: bitmap(['..#....#..', '...#..#...', '..######..', '.##.##.##.', '##########', '#.######.#', '#.#....#.#', '...##.##..']),
  },
  {
    name: '하트',
    rows: 8,
    shape: bitmap(['.###..###.', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....']),
  },
  { name: '지그재그', rows: 9, shape: (r, c) => Math.abs(((c + r * 2) % 8) - 4) <= 1 },
  { name: '쌍둥이 탑', rows: 10, shape: (r, c) => (c >= 1 && c <= 3) || (c >= 6 && c <= 8) || r === 0 },
  { name: '엑스', rows: 9, shape: (r, c) => Math.min(Math.abs(c - r * 1.125), Math.abs(9 - c - r * 1.125)) <= 0.7 },
  {
    name: '버섯',
    rows: 9,
    shape: bitmap(['...####...', '.########.', '##..##..##', '##########', '##########', '..######..', '...#..#...', '...#..#...', '...####...']),
  },
  { name: '계단', rows: 10, shape: (r, c) => c <= r || c >= 10 - Math.max(0, r - 4) },
  { name: '물결', rows: 9, shape: (r, c) => Math.round(3.5 + Math.sin(c * 0.9) * 2.5) <= r && r <= Math.round(3.5 + Math.sin(c * 0.9) * 2.5) + 3 },
]

/** Small deterministic hash-based random for level layouts. */
function lrand(level: number, i: number) {
  let x = (level * 374761393 + i * 668265263) >>> 0
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Returns the brick code grid for a level: 0 empty, 1..4 hp, 9 steel. Levels are endless; 1–14 are hand-shaped, later ones remix with tougher bricks or are generated symmetric layouts. */
export function levelGrid(level: number): number[][] {
  const n = level - 1
  const tier = Math.floor(n / SHAPES.length) // 0 for first 14 levels
  let rows: number
  let shape: Shape
  if (tier < 2) {
    const s = SHAPES[n % SHAPES.length]
    rows = s.rows
    shape = s.shape
  } else {
    // Procedural symmetric layout.
    rows = 7 + Math.floor(lrand(level, 999) * 4)
    const density = 0.55 + lrand(level, 998) * 0.3
    shape = (r, c) => lrand(level, r * 10 + Math.min(c, 9 - c)) < density
  }
  const baseHp = Math.min(3, 1 + Math.min(2, Math.floor(n / 6)) + tier)
  const grid: number[][] = []
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < BRICK_COLS; c++) {
      if (!shape(r, c, rows)) {
        row.push(0)
        continue
      }
      // Tougher bricks near the top; variety between rows.
      let hp = baseHp + (r < Math.floor(rows / 3) ? 1 : 0) - (r >= rows - 2 && baseHp > 1 ? 1 : 0)
      if (level === 1) hp = r === 0 ? 2 : 1
      row.push(Math.max(1, Math.min(4, hp)))
    }
    grid.push(row)
  }
  // Steel bricks from level 8 on, in a symmetric pattern, never on the top row.
  if (level >= 8 && level % 3 !== 1) {
    const sr = Math.min(rows - 1, 2 + Math.floor(lrand(level, 500) * (rows - 2)))
    const inner = lrand(level, 501) < 0.5 ? 4 : 3
    for (const c of [1, inner]) {
      if (grid[sr][c] !== 0 || grid[sr][9 - c] !== 0 || lrand(level, 502 + c) < 0.5) {
        grid[sr][c] = STEEL
        grid[sr][9 - c] = STEEL
      }
    }
  }
  return grid
}

export function levelName(level: number) {
  const n = level - 1
  return Math.floor(n / SHAPES.length) < 2 ? SHAPES[n % SHAPES.length].name : '미로'
}

export function buildBricks(level: number): Brick[] {
  const bricks: Brick[] = []
  levelGrid(level).forEach((row, r) =>
    row.forEach((code, c) => {
      if (!code) return
      const steel = code === STEEL
      bricks.push({
        x: BRICK_MARGIN + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        hp: steel ? Infinity : code,
        maxHp: steel ? Infinity : code,
        steel,
        row: r,
      })
    }),
  )
  return bricks
}

function stuckBall(): Ball {
  return { x: W / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0, stuck: true, offset: 8 }
}

export function newGame(level = 1): BreakoutState {
  return {
    level,
    score: 0,
    lives: 3,
    paddleX: W / 2,
    paddleW: PADDLE_W,
    balls: [stuckBall()],
    bricks: buildBricks(level),
    drops: [],
    bolts: [],
    timers: { wide: 0, laser: 0, slow: 0 },
    laserCd: 0,
    speed: baseSpeed(level),
    phase: 'play',
    events: [],
  }
}

export function nextLevel(s: BreakoutState): BreakoutState {
  const level = s.level + 1
  return {
    ...s,
    level,
    paddleW: PADDLE_W,
    balls: [stuckBall()],
    bricks: buildBricks(level),
    drops: [],
    bolts: [],
    timers: { wide: 0, laser: 0, slow: 0 },
    speed: baseSpeed(level),
    phase: 'play',
    events: [],
  }
}

export const remaining = (s: BreakoutState) => s.bricks.filter((b) => !b.steel).length

export function launchVelocity(speed: number, offset: number) {
  const a = (offset / 40) * (Math.PI / 4) // up to ±45°
  return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed }
}

function setSpeed(b: Ball, speed: number) {
  const cur = Math.hypot(b.vx, b.vy) || 1
  b.vx = (b.vx / cur) * speed
  b.vy = (b.vy / cur) * speed
  // Avoid boring near-horizontal bounces.
  const minVy = speed * 0.3
  if (Math.abs(b.vy) < minVy) {
    b.vy = Math.sign(b.vy || -1) * minVy
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(speed * speed - minVy * minVy)
  }
}

const POWER_CHANCE = 0.14

function rollPower(rng: () => number): PowerType | null {
  if (rng() > POWER_CHANCE) return null
  const r = rng()
  if (r < 0.06) return 'life'
  if (r < 0.32) return 'multi'
  if (r < 0.56) return 'wide'
  if (r < 0.78) return 'laser'
  return 'slow'
}

function damage(s: BreakoutState, brick: Brick, rng: () => number) {
  if (brick.steel) {
    s.events.push({ type: 'brick', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, destroyed: false, steel: true, hp: 0, maxHp: 0 })
    return
  }
  brick.hp--
  s.score += 10
  const destroyed = brick.hp <= 0
  s.events.push({ type: 'brick', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, destroyed, steel: false, hp: brick.hp, maxHp: brick.maxHp })
  if (destroyed) {
    s.score += 20 * brick.maxHp
    s.bricks = s.bricks.filter((b) => b !== brick)
    const p = rollPower(rng)
    if (p) s.drops.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, type: p })
  }
}

function applyPower(s: BreakoutState, type: PowerType) {
  switch (type) {
    case 'multi': {
      const extra: Ball[] = []
      for (const b of s.balls) {
        if (b.stuck) {
          b.stuck = false
          Object.assign(b, launchVelocity(s.speed, b.offset))
        }
        for (const turn of [-0.45, 0.45]) {
          if (s.balls.length + extra.length >= MAX_BALLS) break
          const cos = Math.cos(turn)
          const sin = Math.sin(turn)
          const nb = { ...b, vx: b.vx * cos - b.vy * sin, vy: b.vx * sin + b.vy * cos }
          if (nb.vy > 0 && b.y > PADDLE_Y - 30) nb.vy = -nb.vy
          extra.push(nb)
        }
      }
      s.balls.push(...extra)
      break
    }
    case 'wide':
      s.timers.wide = 15
      break
    case 'laser':
      s.timers.laser = 10
      break
    case 'slow':
      s.timers.slow = 10
      break
    case 'life':
      s.lives = Math.min(s.lives + 1, 9)
      break
  }
}

/** Advance the simulation by dt seconds. Mutates and returns `s` (callers own the object). */
export function step(s: BreakoutState, dt: number, input: Input, rng: () => number = Math.random): BreakoutState {
  s.events = []
  if (s.phase !== 'play') return s

  // timers
  for (const k of ['wide', 'laser', 'slow'] as const) s.timers[k] = Math.max(0, s.timers[k] - dt)
  const targetW = s.timers.wide > 0 ? WIDE_W : PADDLE_W
  s.paddleW += Math.sign(targetW - s.paddleW) * Math.min(Math.abs(targetW - s.paddleW), 200 * dt)

  // paddle
  const half = s.paddleW / 2
  if (input.paddleX != null) s.paddleX = input.paddleX
  s.paddleX += input.move * 480 * dt
  s.paddleX = Math.max(half, Math.min(W - half, s.paddleX))

  const speed = s.speed * (s.timers.slow > 0 ? 0.68 : 1)

  // launch / stuck balls
  for (const b of s.balls) {
    if (!b.stuck) continue
    b.offset = Math.max(-half + 4, Math.min(half - 4, b.offset))
    b.x = s.paddleX + b.offset
    b.y = PADDLE_Y - BALL_R
    if (input.launch) {
      b.stuck = false
      Object.assign(b, launchVelocity(speed, b.offset))
    }
  }

  // lasers
  if (s.timers.laser > 0) {
    s.laserCd -= dt
    if (s.laserCd <= 0) {
      s.laserCd = 0.32
      s.bolts.push({ x: s.paddleX - half + 6, y: PADDLE_Y }, { x: s.paddleX + half - 6, y: PADDLE_Y })
    }
  }
  for (const bolt of s.bolts) bolt.y -= 640 * dt
  s.bolts = s.bolts.filter((bolt) => {
    if (bolt.y < 0) return false
    const hit = s.bricks.find((b) => bolt.x >= b.x && bolt.x <= b.x + b.w && bolt.y >= b.y && bolt.y <= b.y + b.h)
    if (hit) {
      damage(s, hit, rng)
      return false
    }
    return true
  })

  // balls
  for (const b of s.balls) {
    if (b.stuck) continue
    setSpeed(b, speed)
    const dist = speed * dt
    const n = Math.max(1, Math.ceil(dist / 3))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const px = b.x
      const py = b.y
      b.x += b.vx * h
      b.y += b.vy * h
      // walls
      if (b.x < BALL_R) {
        b.x = BALL_R
        b.vx = Math.abs(b.vx)
        s.events.push({ type: 'wall', x: b.x, y: b.y })
      } else if (b.x > W - BALL_R) {
        b.x = W - BALL_R
        b.vx = -Math.abs(b.vx)
        s.events.push({ type: 'wall', x: b.x, y: b.y })
      }
      if (b.y < BALL_R) {
        b.y = BALL_R
        b.vy = Math.abs(b.vy)
        s.events.push({ type: 'wall', x: b.x, y: b.y })
      }
      // paddle
      if (
        b.vy > 0 &&
        b.y + BALL_R >= PADDLE_Y &&
        py + BALL_R <= PADDLE_Y + 4 &&
        b.x >= s.paddleX - s.paddleW / 2 - BALL_R &&
        b.x <= s.paddleX + s.paddleW / 2 + BALL_R
      ) {
        const rel = Math.max(-1, Math.min(1, (b.x - s.paddleX) / (s.paddleW / 2)))
        const a = rel * (Math.PI / 3) // up to 60°
        b.vx = Math.sin(a) * speed
        b.vy = -Math.cos(a) * speed
        b.y = PADDLE_Y - BALL_R
        s.speed = Math.min(s.speed + 3, baseSpeed(s.level) + 120)
        s.events.push({ type: 'paddle', x: b.x, y: b.y })
      }
      // bricks
      for (const br of s.bricks) {
        const cx = Math.max(br.x, Math.min(b.x, br.x + br.w))
        const cy = Math.max(br.y, Math.min(b.y, br.y + br.h))
        const dx = b.x - cx
        const dy = b.y - cy
        if (dx * dx + dy * dy > BALL_R * BALL_R) continue
        // Decide which face we hit using the previous position.
        const wasLeftRight = px < br.x || px > br.x + br.w
        const wasAboveBelow = py < br.y || py > br.y + br.h
        if (wasAboveBelow && !wasLeftRight) {
          b.vy = py < br.y ? -Math.abs(b.vy) : Math.abs(b.vy)
          b.y = py
        } else if (wasLeftRight && !wasAboveBelow) {
          b.vx = px < br.x ? -Math.abs(b.vx) : Math.abs(b.vx)
          b.x = px
        } else {
          // corner: reflect along the axis of smaller penetration
          if (Math.abs(dx) > Math.abs(dy)) b.vx = dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx)
          else b.vy = dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy)
          b.x = px
          b.y = py
        }
        damage(s, br, rng)
        break
      }
    }
  }
  const before = s.balls.length
  s.balls = s.balls.filter((b) => b.y < H + BALL_R * 2)
  if (before && !s.balls.length) {
    s.lives--
    s.events.push({ type: 'lose' })
    s.timers = { wide: 0, laser: 0, slow: 0 }
    s.drops = []
    s.bolts = []
    if (s.lives <= 0) {
      s.phase = 'over'
      s.events.push({ type: 'over' })
      return s
    }
    s.balls = [stuckBall()]
  }

  // drops
  for (const d of s.drops) d.y += 130 * dt
  s.drops = s.drops.filter((d) => {
    if (d.y > H + 10) return false
    const caught =
      d.y + 8 >= PADDLE_Y && d.y - 8 <= PADDLE_Y + PADDLE_H && Math.abs(d.x - s.paddleX) <= s.paddleW / 2 + 12
    if (caught) {
      applyPower(s, d.type)
      s.score += 50
      s.events.push({ type: 'power', power: d.type, x: d.x, y: PADDLE_Y })
      return false
    }
    return true
  })

  if (remaining(s) === 0) {
    s.phase = 'cleared'
    s.score += 500 + s.level * 100
    s.events.push({ type: 'cleared' })
  }
  return s
}
