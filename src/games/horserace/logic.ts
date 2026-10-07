export const TRACK = 100
export const MIN_HORSES = 2
export const MAX_HORSES = 8
export const START_POINTS = 1000
export const MIN_BET = 100

export const HORSE_NAMES = ['번개', '질풍', '천둥', '흑진주', '은하수', '불꽃', '행운이', '바람돌이']
export const HORSE_COLORS = ['#e74c3c', '#2f6fb5', '#2e8b57', '#8e44ad', '#e0a526', '#16a2b8', '#e84393', '#6d4c41']

export interface Horse {
  id: number
  name: string
  color: string
  /** 1..5 — stronger horses are a bit faster on average. */
  strength: number
  odds: number
}

export function makeField(n: number, rng: () => number = Math.random, trials = 250): Horse[] {
  const strengths = Array.from({ length: n }, () => 1 + Math.floor(rng() * 5))
  const field = strengths.map((s, i) => ({
    id: i,
    name: HORSE_NAMES[i],
    color: HORSE_COLORS[i],
    strength: s,
    odds: 0,
  }))
  const p = winChances(field, rng, trials)
  return field.map((h, i) => ({ ...h, odds: oddsFor(p[i]) }))
}

/** Monte-Carlo estimate of each horse's chance to win. */
export function winChances(field: Horse[], rng: () => number, trials: number): number[] {
  const wins = field.map(() => 0)
  for (let k = 0; k < trials; k++) wins[simulateRace(field, rng).order[0]]++
  // light smoothing so no horse gets 0%
  return wins.map((w) => (w + 0.5) / (trials + 0.5 * field.length))
}

/** Decimal odds (payout multiplier) with a small house edge. Long shots pay more. */
export function oddsFor(winChance: number): number {
  const raw = 0.9 / Math.max(0.01, winChance)
  return Math.min(30, Math.max(1.1, Math.round(raw * 10) / 10))
}

export interface Race {
  /** frames[t][horse] = position (0..TRACK) after tick t. frames[0] is the start. */
  frames: number[][]
  /** Fractional finish tick per horse. */
  finish: number[]
  /** Horse ids from 1st to last. */
  order: number[]
  /** Ticks where a horse got a burst (for commentary). */
  bursts: { tick: number; horse: number }[]
}

export function simulateRace(field: Horse[], rng: () => number = Math.random): Race {
  const n = field.length
  const pos = Array<number>(n).fill(0)
  const finish = Array<number>(n).fill(Infinity)
  const burst = Array<number>(n).fill(0)
  const stumble = Array<number>(n).fill(0)
  const frames: number[][] = [pos.slice()]
  const bursts: { tick: number; horse: number }[] = []
  let t = 0
  while (finish.some((f) => f === Infinity) && t < 2000) {
    t++
    for (let i = 0; i < n; i++) {
      if (finish[i] !== Infinity) continue
      if (burst[i] === 0 && stumble[i] === 0) {
        const r = rng()
        if (r < 0.035) {
          burst[i] = 5 + Math.floor(rng() * 6)
          bursts.push({ tick: t, horse: i })
        } else if (r < 0.055) stumble[i] = 3 + Math.floor(rng() * 3)
      }
      let speed = 0.85 + field[i].strength * 0.07 + rng() * 0.8
      if (burst[i] > 0) {
        speed += 0.9
        burst[i]--
      } else if (stumble[i] > 0) {
        speed *= 0.35
        stumble[i]--
      }
      const before = pos[i]
      pos[i] = Math.min(TRACK, before + speed)
      if (pos[i] >= TRACK) finish[i] = t - 1 + (TRACK - before) / speed
    }
    frames.push(pos.slice())
  }
  const order = field.map((h) => h.id).sort((a, b) => finish[a] - finish[b] || a - b)
  return { frames, finish, order, bursts }
}

export function payout(bet: number, odds: number): number {
  return Math.floor(bet * odds)
}

/** Bet options that fit the balance. */
export function betOptions(balance: number): number[] {
  const opts = [100, 300, 500, 1000].filter((v) => v <= balance)
  if (balance >= MIN_BET && !opts.includes(balance)) opts.push(balance)
  return opts
}

/** Leader at a fractional tick (for live commentary). */
export function leaderAt(race: Race, tick: number): number {
  const f = race.frames[Math.min(race.frames.length - 1, Math.max(0, Math.floor(tick)))]
  let best = 0
  for (let i = 1; i < f.length; i++) if (f[i] > f[best]) best = i
  return best
}

export function positionAt(race: Race, horse: number, tick: number): number {
  const last = race.frames.length - 1
  if (tick >= last) return race.frames[last][horse]
  const a = Math.floor(Math.max(0, tick))
  const f = tick - a
  return race.frames[a][horse] * (1 - f) + race.frames[a + 1][horse] * f
}
