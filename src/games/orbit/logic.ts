// 궤도 수집가 — pure idle-game economy. No DOM/React imports.

export interface ShapeDef {
  id: string
  name: string
  /** Number of vertices on the outline (all edges are equal length). */
  k: number
  /** Star outline: vertices alternate outer/inner radius. */
  star?: boolean
  color: string
  /** Seconds per lap at speed level 0. */
  lap: number
  /** Coins per vertex at value level 0. */
  base: number
  /** Coins needed to unlock (0 = free from the start). */
  unlock: number
  shipCost: number
  speedCost: number
  valueCost: number
}

/** Rounds to 2 significant digits so costs look tidy. */
function nice(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1)
  return Math.round(x / p) * p
}

/**
 * Later shapes are derived from their unlock price: one fresh ship earns
 * unlock/div coins per second (div grows so later shapes need investing).
 */
function shape(id: string, name: string, k: number, color: string, lap: number, unlock: number, div: number, star = false): ShapeDef {
  const perShip = unlock / div
  return {
    id,
    name,
    k,
    star,
    color,
    lap,
    base: nice((perShip * lap) / (2 * k)),
    unlock,
    shipCost: nice(perShip * 25),
    speedCost: nice(perShip * 80),
    valueCost: nice(perShip * 60),
  }
}

export const SHAPES: ShapeDef[] = [
  { id: 'tri', name: '세모', k: 3, color: '#46e3ff', lap: 3, base: 1, unlock: 0, shipCost: 10, speedCost: 40, valueCost: 30 },
  shape('sq', '네모', 4, '#7dff8c', 3.4, 1.2e4, 400),
  shape('pent', '오각형', 5, '#ffd84a', 3.8, 2e5, 600),
  shape('hex', '육각형', 6, '#ff8a4c', 4.2, 2e7, 1500),
  shape('star', '별', 10, '#ff5fa8', 5, 5e9, 3000, true),
  shape('dodeca', '십이각형', 12, '#b57bff', 5.4, 2e12, 5000),
  shape('bigstar', '큰 별', 16, '#5c8bff', 6, 1.5e15, 8000, true),
  shape('galaxy', '은하', 24, '#f2f4ff', 6.6, 2e18, 12000),
]

export const SHIP_GROWTH = 1.15
export const SPEED_GROWTH = 2.1
export const VALUE_GROWTH = 2.1
export const MAX_SHIPS = 200
export const MAX_SPEED_LV = 20
/** Ship-count milestones; each one doubles that shape's income. */
export const MILESTONES = [25, 50, 100, 150, 200]
export const BOOST_MULT = 2
export const BOOST_PER_TAP = 0.5
export const BOOST_MAX = 8
export const COMBO_WINDOW = 0.15
export const COMBO_MAX = 5
export const COMBO_COOLDOWN = 2
export const OFFLINE_RATE = 0.5
export const OFFLINE_CAP = 8 * 3600
export const PRESTIGE_MIN = 1e12
export const STARDUST_BONUS = 0.1

export interface ShapeProgress {
  ships: number
  speedLv: number
  valueLv: number
  /** Lap progress of each ship, 0..1 (wraps). */
  phases: number[]
}

export interface OrbitState {
  coins: number
  /** Coins earned in this supernova run. */
  runEarned: number
  /** Coins earned over all runs. */
  totalEarned: number
  stardust: number
  supernovas: number
  shapes: ShapeProgress[]
  /** Seconds of tap boost left. */
  boost: number
  time: number
  bestCombo: number
  /** Runtime-only combo tracking per shape & vertex: last pass time, chain, cooldown end. */
  lastPass: number[][]
  chain: number[][]
  cool: number[][]
}

export interface OrbitEvent {
  shape: number
  vertex: number
  ship: number
  value: number
  combo: number
  lap: boolean
}

// ---------- helpers ----------

/** Deterministic per-ship speed jitter (±5%) so ships drift and sometimes bunch up. */
export function jitter(i: number): number {
  return 1 + 0.1 * ((((i + 1) * 0.6180339887) % 1) - 0.5)
}

function spawnPhase(i: number): number {
  return ((i * 0.381966) % 1) + 0.0001
}

function newShape(): ShapeProgress {
  return { ships: 1, speedLv: 0, valueLv: 0, phases: [spawnPhase(0)] }
}

export function newGame(stardust = 0, supernovas = 0, totalEarned = 0): OrbitState {
  return {
    coins: 0,
    runEarned: 0,
    totalEarned,
    stardust,
    supernovas,
    shapes: [newShape()],
    boost: 0,
    time: 0,
    bestCombo: 0,
    lastPass: [[]],
    chain: [[]],
    cool: [[]],
  }
}

/** Repairs a loaded save (missing fields, bad numbers). */
export function normalize(raw: unknown): OrbitState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<OrbitState>
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  const g = newGame(num(s.stardust), num(s.supernovas), num(s.totalEarned))
  g.coins = num(s.coins)
  g.runEarned = num(s.runEarned)
  g.bestCombo = num(s.bestCombo)
  if (Array.isArray(s.shapes) && s.shapes.length) {
    g.shapes = s.shapes.slice(0, SHAPES.length).map((p) => {
      const ships = Math.max(1, Math.min(MAX_SHIPS, Math.floor(num(p?.ships, 1))))
      const phases = Array.from({ length: ships }, (_, i) => {
        const v = p?.phases?.[i]
        return typeof v === 'number' && Number.isFinite(v) ? v - Math.floor(v) : spawnPhase(i)
      })
      return {
        ships,
        speedLv: Math.min(MAX_SPEED_LV, Math.floor(num(p?.speedLv))),
        valueLv: Math.floor(num(p?.valueLv)),
        phases,
      }
    })
  }
  g.lastPass = g.shapes.map(() => [])
  g.chain = g.shapes.map(() => [])
  g.cool = g.shapes.map(() => [])
  return g
}

/** Serializable snapshot (drops runtime-only fields). */
export function serialize(s: OrbitState) {
  return {
    coins: s.coins,
    runEarned: s.runEarned,
    totalEarned: s.totalEarned,
    stardust: s.stardust,
    supernovas: s.supernovas,
    bestCombo: s.bestCombo,
    shapes: s.shapes.map((p) => ({ ...p, phases: p.phases.map((x) => Math.round(x * 1e4) / 1e4) })),
  }
}

// ---------- multipliers ----------

export function milestoneMult(ships: number): number {
  let m = 1
  for (const t of MILESTONES) if (ships >= t) m *= 2
  return m
}

export function nextMilestone(ships: number): number | null {
  return MILESTONES.find((t) => t > ships) ?? null
}

export function speedMult(lv: number): number {
  return 1 + 0.15 * lv
}

export function valueMult(lv: number): number {
  return 1 + lv
}

export function globalMult(s: Pick<OrbitState, 'stardust'>): number {
  return 1 + STARDUST_BONUS * s.stardust
}

/** Coins paid when a ship of shape i passes one vertex (before combo). */
export function vertexValue(s: OrbitState, i: number): number {
  const p = s.shapes[i]
  return SHAPES[i].base * valueMult(p.valueLv) * milestoneMult(p.ships) * globalMult(s)
}

/** Extra coins for completing a lap: one more full lap's worth of vertices. */
export function lapBonus(s: OrbitState, i: number): number {
  return vertexValue(s, i) * SHAPES[i].k
}

/** Laps per second of ship j on shape i (without boost). */
export function shipSpeed(s: OrbitState, i: number, j: number): number {
  return (speedMult(s.shapes[i].speedLv) / SHAPES[i].lap) * jitter(j)
}

/** Average coins per second of one shape (no combos, no boost). */
export function shapeIncome(s: OrbitState, i: number): number {
  const p = s.shapes[i]
  let laps = 0
  for (let j = 0; j < p.ships; j++) laps += shipSpeed(s, i, j)
  return laps * (SHAPES[i].k * vertexValue(s, i) + lapBonus(s, i))
}

export function incomePerSec(s: OrbitState): number {
  let t = 0
  for (let i = 0; i < s.shapes.length; i++) t += shapeIncome(s, i)
  return t
}

// ---------- costs ----------

/** Total cost of buying `count` items starting at level `owned` with cost base·r^owned. */
export function bulkCost(base: number, r: number, owned: number, count: number): number {
  if (count <= 0) return 0
  return (base * Math.pow(r, owned) * (Math.pow(r, count) - 1)) / (r - 1)
}

/** How many items fit in `coins` (capped by `limit`). */
export function maxAffordable(base: number, r: number, owned: number, coins: number, limit = Infinity): number {
  const first = base * Math.pow(r, owned)
  if (coins < first || limit <= 0) return 0
  let n = Math.floor(Math.log((coins * (r - 1)) / first + 1) / Math.log(r))
  n = Math.max(0, Math.min(limit, n))
  // guard floating-point edge cases
  while (n > 0 && bulkCost(base, r, owned, n) > coins * (1 + 1e-12)) n--
  while (n < limit && bulkCost(base, r, owned, n + 1) <= coins) n++
  return n
}

export type UpgradeKind = 'ships' | 'speed' | 'value'
export type BuyAmount = number | 'max'

function kindInfo(s: OrbitState, i: number, kind: UpgradeKind) {
  const d = SHAPES[i]
  const p = s.shapes[i]
  if (kind === 'ships') return { base: d.shipCost, r: SHIP_GROWTH, owned: p.ships - 1, limit: MAX_SHIPS - p.ships }
  if (kind === 'speed') return { base: d.speedCost, r: SPEED_GROWTH, owned: p.speedLv, limit: MAX_SPEED_LV - p.speedLv }
  return { base: d.valueCost, r: VALUE_GROWTH, owned: p.valueLv, limit: Infinity }
}

/** Quote for a purchase: how many will be bought and what it costs (count 0 = maxed out). */
export function quote(s: OrbitState, i: number, kind: UpgradeKind, amount: BuyAmount): { count: number; cost: number; affordable: boolean } {
  const { base, r, owned, limit } = kindInfo(s, i, kind)
  if (limit <= 0) return { count: 0, cost: 0, affordable: false }
  let count: number
  if (amount === 'max') count = Math.max(1, maxAffordable(base, r, owned, s.coins, limit))
  else count = Math.min(amount, limit)
  const cost = bulkCost(base, r, owned, count)
  return { count, cost, affordable: cost <= s.coins }
}

/** Buys an upgrade in place. Returns the number bought (0 if not affordable). */
export function buy(s: OrbitState, i: number, kind: UpgradeKind, amount: BuyAmount = 1): number {
  if (!s.shapes[i]) return 0
  const q = quote(s, i, kind, amount)
  if (!q.count || !q.affordable) return 0
  s.coins -= q.cost
  const p = s.shapes[i]
  if (kind === 'ships') {
    for (let n = 0; n < q.count; n++) {
      p.phases.push(spawnPhase(p.ships))
      p.ships++
    }
  } else if (kind === 'speed') p.speedLv += q.count
  else p.valueLv += q.count
  return q.count
}

export function nextShape(s: OrbitState): ShapeDef | null {
  return SHAPES[s.shapes.length] ?? null
}

export function canUnlock(s: OrbitState): boolean {
  const d = nextShape(s)
  return !!d && s.coins >= d.unlock
}

export function unlock(s: OrbitState): boolean {
  const d = nextShape(s)
  if (!d || s.coins < d.unlock) return false
  s.coins -= d.unlock
  s.shapes.push(newShape())
  s.lastPass.push([])
  s.chain.push([])
  s.cool.push([])
  return true
}

export function tapBoost(s: OrbitState): void {
  s.boost = Math.min(BOOST_MAX, s.boost + BOOST_PER_TAP)
}

// ---------- simulation ----------

function earn(s: OrbitState, v: number) {
  s.coins += v
  s.runEarned += v
  s.totalEarned += v
}

/**
 * Combo bookkeeping for one vertex pass. Ships passing the same vertex within
 * COMBO_WINDOW of each other build a chain (×2, ×3 … ×COMBO_MAX). When a chain
 * ends (or maxes out) the vertex cools down, so combos stay special even with
 * hundreds of ships.
 */
function comboAt(s: OrbitState, i: number, v: number, now: number): number {
  const last = s.lastPass[i]
  const chain = s.chain[i]
  const cool = s.cool[i]
  const prev = last[v]
  last[v] = now
  let c = chain[v] ?? 1
  if (prev !== undefined && now - prev > COMBO_WINDOW && c >= 2) {
    // previous chain ended at `prev`
    cool[v] = prev + COMBO_COOLDOWN
    c = 1
  }
  if (now < (cool[v] ?? -1) || prev === undefined || now - prev > COMBO_WINDOW) {
    chain[v] = 1
    return 1
  }
  c++
  if (c >= COMBO_MAX) {
    cool[v] = now + COMBO_COOLDOWN
    chain[v] = 1
  } else chain[v] = c
  if (c > s.bestCombo) s.bestCombo = c
  return c
}

/**
 * Advances ships by dt seconds (mutates). Every vertex a ship passes pays out;
 * crossing vertex 0 also completes a lap (bonus). A large dt is handled exactly
 * (multiple passes/laps per ship). Combos only apply to single-pass steps.
 */
export function step(s: OrbitState, dt: number, events?: OrbitEvent[]): void {
  if (dt <= 0) return
  const boostT = Math.min(s.boost, dt)
  const effDt = dt + boostT * (BOOST_MULT - 1)
  s.boost = Math.max(0, s.boost - dt)
  s.time += dt
  const now = s.time
  for (let i = 0; i < s.shapes.length; i++) {
    const p = s.shapes[i]
    const k = SHAPES[i].k
    const vv = vertexValue(s, i)
    const lb = vv * k
    const sm = speedMult(p.speedLv) / SHAPES[i].lap
    for (let j = 0; j < p.ships; j++) {
      const from = p.phases[j]
      const to = from + sm * jitter(j) * effDt
      const a = Math.floor(from * k)
      const b = Math.floor(to * k)
      const passes = b - a
      if (passes > 0) {
        if (passes <= 2) {
          for (let q = a + 1; q <= b; q++) {
            const vertex = q % k
            const lap = vertex === 0
            const combo = comboAt(s, i, vertex, now)
            const value = vv * combo + (lap ? lb : 0)
            earn(s, value)
            if (events && events.length < 400) events.push({ shape: i, vertex, ship: j, value, combo, lap })
          }
        } else {
          const laps = Math.floor(to) - Math.floor(from)
          earn(s, passes * vv + laps * lb)
        }
      }
      p.phases[j] = to - Math.floor(to)
    }
  }
}

/** Coins earned while away: average income × rate, time capped at 8 hours. */
export function offlineEarnings(s: OrbitState, seconds: number): { coins: number; seconds: number } {
  const t = Math.max(0, Math.min(OFFLINE_CAP, seconds))
  return { coins: incomePerSec(s) * OFFLINE_RATE * t, seconds: t }
}

export function applyOffline(s: OrbitState, seconds: number): number {
  const { coins, seconds: t } = offlineEarnings(s, seconds)
  earn(s, coins)
  // ships keep flying while away
  for (let i = 0; i < s.shapes.length; i++) {
    const p = s.shapes[i]
    for (let j = 0; j < p.ships; j++) {
      const x = p.phases[j] + shipSpeed(s, i, j) * t
      p.phases[j] = x - Math.floor(x)
    }
  }
  return coins
}

// ---------- prestige ----------

/** Stardust a supernova would give for the current run. */
export function stardustGain(runEarned: number): number {
  if (runEarned < PRESTIGE_MIN) return 0
  return Math.floor(5 * Math.cbrt(runEarned / PRESTIGE_MIN))
}

export function canSupernova(s: OrbitState): boolean {
  return stardustGain(s.runEarned) > 0
}

export function supernova(s: OrbitState): OrbitState {
  const gain = stardustGain(s.runEarned)
  if (gain <= 0) return s
  const n = newGame(s.stardust + gain, s.supernovas + 1, s.totalEarned)
  n.bestCombo = s.bestCombo
  return n
}

// ---------- formatting ----------

const UNITS = ['', '만', '억', '조', '경', '해', '자', '양', '구', '간', '정', '재', '극']

function trim(x: string): string {
  return x.includes('.') ? x.replace(/\.?0+$/, '') : x
}

/** Korean big-number style: 9,999 · 1.23만 · 45.6억 · 789조 · 1,234경. */
export function formatKo(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  if (n < 0) return '-' + formatKo(-n)
  if (n < 1e4) return Math.floor(n).toLocaleString('en-US')
  const u = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 4))
  const v = n / Math.pow(10, 4 * u)
  let str: string
  if (v < 10) str = trim((Math.floor(v * 100) / 100).toFixed(2))
  else if (v < 100) str = trim((Math.floor(v * 10) / 10).toFixed(1))
  else str = Math.floor(v).toLocaleString('en-US')
  return str + UNITS[u]
}

export function formatDuration(sec: number): string {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m ? `${h}시간 ${m}분` : `${h}시간`
  if (m > 0) return `${m}분`
  return `${s}초`
}
