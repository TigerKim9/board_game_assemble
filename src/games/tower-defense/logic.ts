// 타워 디펜스 — pure simulation. All functions mutate the given State in place
// (for speed in the render loop) and never touch anything outside it.
import type { Difficulty } from '../../lib/types'

export const COLS = 9
export const ROWS = 14
/** Fixed simulation timestep (seconds). */
export const DT = 1 / 60
export const TOTAL_WAVES = 30

// ---------------------------------------------------------------- maps

export interface MapDef {
  id: string
  name: string
  emoji: string
  /** Tile coordinates (col,row) of path corners; first/last lie just outside the grid. */
  waypoints: [number, number][]
  /** Decoration tiles (trees/rocks/water) — not buildable. */
  blocked: { c: number; r: number; type: 'tree' | 'rock' | 'water' }[]
  grass: [string, string]
  road: string
}

export const MAPS: MapDef[] = [
  {
    id: 'meadow',
    name: '초원 오솔길',
    emoji: '🌼',
    waypoints: [
      [1, -1],
      [1, 3],
      [7, 3],
      [7, 7],
      [1, 7],
      [1, 11],
      [7, 11],
      [7, 14],
    ],
    blocked: [
      { c: 4, r: 0, type: 'tree' },
      { c: 8, r: 0, type: 'tree' },
      { c: 4, r: 5, type: 'rock' },
      { c: 0, r: 13, type: 'tree' },
      { c: 4, r: 13, type: 'rock' },
      { c: 8, r: 9, type: 'tree' },
    ],
    grass: ['#7fbf5a', '#76b553'],
    road: '#d9bf8c',
  },
  {
    id: 'canyon',
    name: '구불구불 협곡',
    emoji: '🏜️',
    waypoints: [
      [4, -1],
      [4, 2],
      [1, 2],
      [1, 6],
      [7, 6],
      [7, 10],
      [2, 10],
      [2, 14],
    ],
    blocked: [
      { c: 0, r: 0, type: 'rock' },
      { c: 8, r: 2, type: 'rock' },
      { c: 4, r: 4, type: 'rock' },
      { c: 5, r: 8, type: 'water' },
      { c: 4, r: 8, type: 'water' },
      { c: 0, r: 9, type: 'rock' },
      { c: 6, r: 13, type: 'rock' },
      { c: 8, r: 13, type: 'tree' },
    ],
    grass: ['#c9a66b', '#c09c60'],
    road: '#8f6a43',
  },
  {
    id: 'frost',
    name: '얼음 다리',
    emoji: '🧊',
    waypoints: [
      [-1, 2],
      [6, 2],
      [6, 5],
      [2, 5],
      [2, 9],
      [6, 9],
      [6, 12],
      [9, 12],
    ],
    blocked: [
      { c: 0, r: 0, type: 'water' },
      { c: 1, r: 0, type: 'water' },
      { c: 8, r: 6, type: 'water' },
      { c: 8, r: 7, type: 'water' },
      { c: 4, r: 7, type: 'rock' },
      { c: 0, r: 12, type: 'tree' },
      { c: 3, r: 13, type: 'tree' },
      { c: 8, r: 3, type: 'tree' },
    ],
    grass: ['#dbe9f2', '#d1e2ee'],
    road: '#9fb3c4',
  },
]

export interface PathGeom {
  pts: { x: number; y: number }[]
  seg: number[]
  length: number
  tiles: Set<string>
}

const geomCache = new Map<string, PathGeom>()

export function pathGeom(map: MapDef): PathGeom {
  const cached = geomCache.get(map.id)
  if (cached) return cached
  const pts = map.waypoints.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }))
  const seg: number[] = []
  let length = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    seg.push(d)
    length += d
  }
  const tiles = new Set<string>()
  for (let i = 1; i < map.waypoints.length; i++) {
    const [c0, r0] = map.waypoints[i - 1]
    const [c1, r1] = map.waypoints[i]
    const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))
    for (let k = 0; k <= n; k++) {
      const c = c0 + Math.sign(c1 - c0) * k
      const r = r0 + Math.sign(r1 - r0) * k
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) tiles.add(`${c},${r}`)
    }
  }
  const g = { pts, seg, length, tiles }
  geomCache.set(map.id, g)
  return g
}

/** Position along the path at distance d (tile units). */
export function posAt(g: PathGeom, d: number): { x: number; y: number } {
  if (d <= 0) return { ...g.pts[0] }
  for (let i = 0; i < g.seg.length; i++) {
    if (d <= g.seg[i]) {
      const t = d / g.seg[i]
      const a = g.pts[i]
      const b = g.pts[i + 1]
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    d -= g.seg[i]
  }
  return { ...g.pts[g.pts.length - 1] }
}

export function isBuildable(map: MapDef, c: number, r: number): boolean {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false
  if (pathGeom(map).tiles.has(`${c},${r}`)) return false
  return !map.blocked.some((b) => b.c === c && b.r === r)
}

// ---------------------------------------------------------------- towers

export type TowerKind = 'arrow' | 'cannon' | 'ice' | 'lightning' | 'sniper' | 'poison'
export type Targeting = 'first' | 'strongest' | 'closest'
export const TARGETING_LABEL: Record<Targeting, string> = { first: '선두', strongest: '강한 적', closest: '가까운 적' }

export interface LevelStats {
  dmg: number
  range: number
  /** Seconds between shots. */
  rate: number
  splash?: number
  /** Speed multiplier while slowed. */
  slow?: number
  slowDur?: number
  chain?: number
  dot?: number
  dotDur?: number
}

export interface TowerDef {
  kind: TowerKind
  name: string
  emoji: string
  color: string
  desc: string
  /** [build, upgrade to 2, upgrade to 3] */
  costs: [number, number, number]
  air: boolean
  pierce?: boolean
  projectileSpeed: number
  defaultTarget: Targeting
  levels: [LevelStats, LevelStats, LevelStats]
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  arrow: {
    kind: 'arrow',
    name: '화살탑',
    emoji: '🏹',
    color: '#b5793a',
    desc: '빠르게 쏘는 기본 탑',
    costs: [50, 45, 90],
    air: true,
    projectileSpeed: 11,
    defaultTarget: 'first',
    levels: [
      { dmg: 9, range: 2.6, rate: 0.55 },
      { dmg: 16, range: 2.9, rate: 0.45 },
      { dmg: 28, range: 3.2, rate: 0.36 },
    ],
  },
  cannon: {
    kind: 'cannon',
    name: '대포',
    emoji: '💣',
    color: '#5b6470',
    desc: '폭발 범위 공격 · 공중 ✕',
    costs: [80, 70, 130],
    air: false,
    projectileSpeed: 6,
    defaultTarget: 'first',
    levels: [
      { dmg: 20, range: 2.3, rate: 1.5, splash: 0.9 },
      { dmg: 36, range: 2.5, rate: 1.4, splash: 1.05 },
      { dmg: 64, range: 2.7, rate: 1.3, splash: 1.25 },
    ],
  },
  ice: {
    kind: 'ice',
    name: '얼음탑',
    emoji: '❄️',
    color: '#5fb8e6',
    desc: '주변 적을 느리게 만들어요',
    costs: [60, 50, 100],
    air: true,
    projectileSpeed: 8,
    defaultTarget: 'first',
    levels: [
      { dmg: 4, range: 2.3, rate: 1.0, splash: 0.6, slow: 0.6, slowDur: 1.6 },
      { dmg: 7, range: 2.5, rate: 0.9, splash: 0.8, slow: 0.5, slowDur: 2.0 },
      { dmg: 12, range: 2.8, rate: 0.8, splash: 1.0, slow: 0.4, slowDur: 2.4 },
    ],
  },
  lightning: {
    kind: 'lightning',
    name: '번개탑',
    emoji: '⚡',
    color: '#e6c229',
    desc: '번개가 적 사이를 튕겨요',
    costs: [90, 80, 150],
    air: true,
    projectileSpeed: 0,
    defaultTarget: 'first',
    levels: [
      { dmg: 14, range: 2.4, rate: 1.3, chain: 3 },
      { dmg: 22, range: 2.6, rate: 1.15, chain: 4 },
      { dmg: 36, range: 2.9, rate: 1.0, chain: 6 },
    ],
  },
  sniper: {
    kind: 'sniper',
    name: '저격탑',
    emoji: '🎯',
    color: '#7a4fb0',
    desc: '멀리서 강하게 · 갑옷 관통',
    costs: [100, 90, 170],
    air: true,
    pierce: true,
    projectileSpeed: 0,
    defaultTarget: 'strongest',
    levels: [
      { dmg: 55, range: 4.5, rate: 2.4 },
      { dmg: 110, range: 5.2, rate: 2.2 },
      { dmg: 210, range: 6, rate: 2.0 },
    ],
  },
  poison: {
    kind: 'poison',
    name: '독탑',
    emoji: '🧪',
    color: '#4caf50',
    desc: '독으로 계속 피해 · 갑옷 무시',
    costs: [70, 60, 120],
    air: true,
    projectileSpeed: 7,
    defaultTarget: 'first',
    levels: [
      { dmg: 3, range: 2.4, rate: 1.1, dot: 7, dotDur: 4 },
      { dmg: 5, range: 2.6, rate: 1.0, dot: 14, dotDur: 4 },
      { dmg: 8, range: 2.8, rate: 0.9, dot: 26, dotDur: 4, splash: 0.8 },
    ],
  },
}
export const TOWER_KINDS = Object.keys(TOWERS) as TowerKind[]

export interface Tower {
  id: number
  kind: TowerKind
  c: number
  r: number
  x: number
  y: number
  level: 1 | 2 | 3
  cooldown: number
  targeting: Targeting
  owner: number
  invested: number
  angle: number
  /** Seconds since last shot (for muzzle flash). */
  fired: number
  kills: number
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'normal' | 'fast' | 'tank' | 'flying' | 'swarm' | 'healer' | 'boss'

export interface EnemyDef {
  name: string
  emoji: string
  hp: number
  speed: number
  armor: number
  bounty: number
  lives: number
  radius: number
  flying?: boolean
  healer?: boolean
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  normal: { name: '슬라임', emoji: '🟢', hp: 32, speed: 1.0, armor: 0, bounty: 4, lives: 1, radius: 0.28 },
  fast: { name: '날쌘돌이', emoji: '💨', hp: 20, speed: 1.75, armor: 0, bounty: 3, lives: 1, radius: 0.22 },
  tank: { name: '철갑벌레', emoji: '🛡️', hp: 85, speed: 0.6, armor: 4, bounty: 8, lives: 2, radius: 0.36 },
  flying: { name: '박쥐', emoji: '🦇', hp: 24, speed: 1.15, armor: 0, bounty: 5, lives: 1, radius: 0.27, flying: true },
  swarm: { name: '꼬마 개미', emoji: '🐜', hp: 11, speed: 1.3, armor: 0, bounty: 1, lives: 1, radius: 0.16 },
  healer: { name: '치유사', emoji: '💚', hp: 45, speed: 0.85, armor: 0, bounty: 7, lives: 1, radius: 0.28, healer: true },
  boss: { name: '대왕 괴물', emoji: '👹', hp: 300, speed: 0.45, armor: 6, bounty: 80, lives: 5, radius: 0.5 },
}

export const HEAL_RADIUS = 1.5

export interface Enemy {
  id: number
  kind: EnemyKind
  hp: number
  maxHp: number
  speed: number
  armor: number
  bounty: number
  lives: number
  flying: boolean
  dist: number
  x: number
  y: number
  slowT: number
  slowF: number
  poisonT: number
  poisonDps: number
  poisonOwner: number
  healCd: number
  /** Seconds until this enemy can be healed again (heals don't stack). */
  healedT: number
  hitT: number
  dead: boolean
}

// ---------------------------------------------------------------- difficulty & waves

export interface DiffDef {
  label: string
  lives: number
  gold: number
  hpMul: number
  /** Extra HP per wave (late game gets tougher on higher difficulties). */
  hpGrowth: number
  bountyMul: number
  breakTime: number
  scoreMul: number
}

export const DIFFS: Record<Difficulty, DiffDef> = {
  easy: { label: '쉬움', lives: 30, gold: 220, hpMul: 0.7, hpGrowth: 0, bountyMul: 1.15, breakTime: 20, scoreMul: 1 },
  normal: { label: '보통', lives: 20, gold: 180, hpMul: 1.05, hpGrowth: 0.016, bountyMul: 1, breakTime: 15, scoreMul: 1.5 },
  hard: { label: '어려움', lives: 15, gold: 170, hpMul: 1.15, hpGrowth: 0.016, bountyMul: 0.95, breakTime: 12, scoreMul: 2 },
}

export function hpScale(w: number): number {
  const k = w - 1
  let s = 1 + 0.15 * k + 0.02 * k * k
  if (w > TOTAL_WAVES) s *= Math.pow(1.05, w - TOTAL_WAVES)
  return s
}

export interface WaveGroup {
  kind: EnemyKind
  count: number
  gap: number
}

const INTRO: EnemyKind[][] = [
  ['normal'],
  ['normal'],
  ['normal', 'fast'],
  ['swarm'],
  ['tank', 'normal'],
  ['fast', 'fast'],
  ['flying'],
  ['normal', 'healer'],
  ['tank', 'swarm'],
]
const ROTATION: EnemyKind[][] = [
  ['normal', 'fast'],
  ['tank', 'healer'],
  ['flying', 'swarm'],
  ['fast', 'normal', 'flying'],
  ['swarm', 'swarm'],
  ['tank', 'tank', 'healer'],
  ['flying', 'normal'],
  ['normal', 'tank', 'fast'],
  ['healer', 'swarm', 'flying'],
]
const KIND_WEIGHT: Record<EnemyKind, number> = {
  normal: 1,
  fast: 1,
  tank: 0.45,
  flying: 0.65,
  swarm: 2.6,
  healer: 0.25,
  boss: 0,
}
const KIND_GAP: Record<EnemyKind, number> = {
  normal: 0.9,
  fast: 0.6,
  tank: 1.5,
  flying: 0.9,
  swarm: 0.3,
  healer: 1.6,
  boss: 3,
}

export function waveGroups(w: number): WaveGroup[] {
  const base = 6 + Math.floor(w * 0.9)
  if (w % 10 === 0) {
    const bosses = w <= 20 ? 1 : Math.floor(w / 15)
    return [
      { kind: 'normal', count: Math.ceil(base * 0.6), gap: 0.8 },
      { kind: 'boss', count: bosses, gap: KIND_GAP.boss },
      { kind: 'fast', count: Math.ceil(base * 0.4), gap: 0.6 },
    ]
  }
  const kinds = w <= INTRO.length ? INTRO[w - 1] : ROTATION[(w - INTRO.length - 1) % ROTATION.length]
  const share = base / kinds.length
  const merged = new Map<EnemyKind, number>()
  for (const k of kinds) merged.set(k, (merged.get(k) ?? 0) + Math.max(1, Math.round(share * KIND_WEIGHT[k])))
  const gapMul = w > 20 ? 0.8 : w > 10 ? 0.9 : 1
  return [...merged].map(([kind, count]) => ({ kind, count, gap: KIND_GAP[kind] * gapMul }))
}

/** Enemy counts of a wave, for the preview strip. */
export function wavePreview(w: number): { kind: EnemyKind; count: number }[] {
  return waveGroups(w).map(({ kind, count }) => ({ kind, count }))
}

export function waveIncome(w: number): number {
  return 15 + 2 * w
}

// ---------------------------------------------------------------- fx

export type FxKind = 'boom' | 'zap' | 'beam' | 'death' | 'frost' | 'heal' | 'leak' | 'build' | 'poof' | 'gold'
export interface Fx {
  id: number
  kind: FxKind
  x: number
  y: number
  ttl: number
  max: number
  r?: number
  pts?: { x: number; y: number }[]
  color?: string
  text?: string
}

export interface Projectile {
  id: number
  kind: TowerKind
  level: number
  x: number
  y: number
  targetId: number
  tx: number
  ty: number
  owner: number
  towerId: number
}

// ---------------------------------------------------------------- state

export type Status = 'ready' | 'playing' | 'won' | 'lost'

export interface State {
  mapIndex: number
  map: MapDef
  geom: PathGeom
  diff: Difficulty
  players: number
  gold: number[]
  lives: number
  maxLives: number
  /** Number of waves launched so far. */
  wave: number
  time: number
  enemies: Enemy[]
  towers: Tower[]
  projectiles: Projectile[]
  spawns: { t: number; kind: EnemyKind; wave: number }[]
  /** Seconds until the next wave auto-launches (null while spawning / before start). */
  nextWaveIn: number | null
  fx: Fx[]
  nextId: number
  kills: number
  score: number
  status: Status
  endless: boolean
  /** Fractional gold remainders for co-op income splitting. */
  goldFrac: number[]
  leaked: number
  shake: number
}

export function newGame(mapIndex: number, diff: Difficulty, players = 1): State {
  const map = MAPS[mapIndex]
  const d = DIFFS[diff]
  const per = Math.floor(d.gold / players)
  return {
    mapIndex,
    map,
    geom: pathGeom(map),
    diff,
    players,
    gold: Array.from({ length: players }, () => per),
    lives: d.lives,
    maxLives: d.lives,
    wave: 0,
    time: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    spawns: [],
    nextWaveIn: null,
    fx: [],
    nextId: 1,
    kills: 0,
    score: 0,
    status: 'ready',
    endless: false,
    goldFrac: Array.from({ length: players }, () => 0),
    leaked: 0,
    shake: 0,
  }
}

function addFx(s: State, fx: Omit<Fx, 'id' | 'max'>) {
  if (s.fx.length > 160) return
  s.fx.push({ ...fx, id: s.nextId++, max: fx.ttl })
}

/** Distributes gold evenly between all players (co-op), keeping fractions. */
export function grantShared(s: State, amount: number) {
  for (let p = 0; p < s.players; p++) {
    const v = amount / s.players + s.goldFrac[p]
    const whole = Math.floor(v)
    s.gold[p] += whole
    s.goldFrac[p] = v - whole
  }
}

export function totalGold(s: State): number {
  return s.gold.reduce((a, b) => a + b, 0)
}

// ---------------------------------------------------------------- player actions

export function towerAt(s: State, c: number, r: number): Tower | undefined {
  return s.towers.find((t) => t.c === c && t.r === r)
}

export function canBuild(s: State, kind: TowerKind, c: number, r: number, player = 0): boolean {
  return (
    (s.status === 'playing' || s.status === 'ready') &&
    isBuildable(s.map, c, r) &&
    !towerAt(s, c, r) &&
    s.gold[player] >= TOWERS[kind].costs[0]
  )
}

export function build(s: State, kind: TowerKind, c: number, r: number, player = 0): Tower | null {
  if (!canBuild(s, kind, c, r, player)) return null
  const def = TOWERS[kind]
  s.gold[player] -= def.costs[0]
  const t: Tower = {
    id: s.nextId++,
    kind,
    c,
    r,
    x: c + 0.5,
    y: r + 0.5,
    level: 1,
    cooldown: 0.2,
    targeting: def.defaultTarget,
    owner: player,
    invested: def.costs[0],
    angle: -Math.PI / 2,
    fired: 9,
    kills: 0,
  }
  s.towers.push(t)
  addFx(s, { kind: 'build', x: t.x, y: t.y, ttl: 0.4 })
  return t
}

export function upgradeCost(t: Tower): number | null {
  return t.level >= 3 ? null : (TOWERS[t.kind].costs as number[])[t.level]
}

export function upgrade(s: State, towerId: number, player = 0): boolean {
  const t = s.towers.find((x) => x.id === towerId)
  if (!t || s.status === 'won' || s.status === 'lost') return false
  const cost = upgradeCost(t)
  if (cost == null || s.gold[player] < cost) return false
  s.gold[player] -= cost
  t.invested += cost
  t.level = (t.level + 1) as 2 | 3
  addFx(s, { kind: 'build', x: t.x, y: t.y, ttl: 0.5 })
  return true
}

export function sellValue(t: Tower): number {
  return Math.floor(t.invested * 0.7)
}

export function sell(s: State, towerId: number): number {
  const i = s.towers.findIndex((x) => x.id === towerId)
  if (i < 0 || s.status === 'won' || s.status === 'lost') return 0
  const t = s.towers[i]
  const v = sellValue(t)
  s.gold[t.owner] += v
  s.towers.splice(i, 1)
  addFx(s, { kind: 'poof', x: t.x, y: t.y, ttl: 0.5 })
  addFx(s, { kind: 'gold', x: t.x, y: t.y, ttl: 0.9, text: `+${v}` })
  return v
}

export function setTargeting(s: State, towerId: number, mode: Targeting) {
  const t = s.towers.find((x) => x.id === towerId)
  if (t) t.targeting = mode
}

export function transferGold(s: State, from: number, to: number, amount: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= s.players || to >= s.players) return false
  if (amount <= 0 || s.gold[from] < amount) return false
  s.gold[from] -= amount
  s.gold[to] += amount
  return true
}

/** Bonus gold for calling the next wave now (0 when not available). */
export function earlyBonus(s: State): number {
  if (s.nextWaveIn == null || s.wave === 0) return 0
  return Math.floor(s.nextWaveIn * (1 + s.wave * 0.08))
}

export function canCallWave(s: State): boolean {
  if (s.status === 'ready') return true
  return s.status === 'playing' && s.nextWaveIn != null && (s.endless || s.wave < TOTAL_WAVES)
}

/** Launches the next wave (early-call bonus when the countdown was running). */
export function callWave(s: State): boolean {
  if (!canCallWave(s)) return false
  const bonus = earlyBonus(s)
  if (bonus > 0) {
    grantShared(s, bonus)
    addFx(s, { kind: 'gold', x: COLS / 2, y: 1, ttl: 1.2, text: `조기 호출 +${bonus}` })
  }
  launchWave(s)
  return true
}

function launchWave(s: State) {
  s.status = 'playing'
  if (s.wave > 0) grantShared(s, Math.round(waveIncome(s.wave) * DIFFS[s.diff].bountyMul))
  s.wave++
  s.nextWaveIn = null
  let t = s.time + 0.5
  for (const g of waveGroups(s.wave)) {
    for (let i = 0; i < g.count; i++) {
      s.spawns.push({ t, kind: g.kind, wave: s.wave })
      t += g.gap
    }
    t += 1.2
  }
  s.spawns.sort((a, b) => a.t - b.t)
}

/** After winning: keep playing beyond wave 30. */
export function continueEndless(s: State) {
  if (s.status !== 'won') return
  s.endless = true
  s.status = 'playing'
  s.nextWaveIn = DIFFS[s.diff].breakTime
}

export function spawnEnemy(s: State, kind: EnemyKind, wave: number): Enemy {
  const def = ENEMIES[kind]
  const d = DIFFS[s.diff]
  const scale = kind === 'boss' ? Math.pow(hpScale(wave), 0.85) : hpScale(wave)
  const hp = Math.round(def.hp * scale * d.hpMul * (1 + d.hpGrowth * (wave - 1)))
  const p = s.geom.pts[0]
  const e: Enemy = {
    id: s.nextId++,
    kind,
    hp,
    maxHp: hp,
    speed: def.speed * (1 + Math.min(0.25, wave * 0.006)),
    armor: def.armor + (kind === 'tank' ? Math.floor(wave / 8) : 0),
    bounty: Math.max(1, Math.round(def.bounty * (1 + wave * 0.02) * d.bountyMul)),
    lives: def.lives,
    flying: !!def.flying,
    dist: 0,
    x: p.x,
    y: p.y,
    slowT: 0,
    slowF: 1,
    poisonT: 0,
    poisonDps: 0,
    poisonOwner: 0,
    healCd: 1,
    healedT: 0,
    hitT: 0,
    dead: false,
  }
  s.enemies.push(e)
  return e
}

// ---------------------------------------------------------------- combat

export function canHit(def: TowerDef, e: Enemy): boolean {
  return !e.dead && (def.air || !e.flying)
}

export function inRange(t: Tower, e: Enemy, range: number): boolean {
  const dx = e.x - t.x
  const dy = e.y - t.y
  return dx * dx + dy * dy <= range * range
}

export function pickTarget(s: State, t: Tower): Enemy | null {
  const def = TOWERS[t.kind]
  const range = def.levels[t.level - 1].range
  let best: Enemy | null = null
  let bestScore = -Infinity
  for (const e of s.enemies) {
    if (!canHit(def, e) || e.y < -0.2 || e.x < -0.2 || e.x > COLS + 0.2 || e.y > ROWS + 0.2) continue
    if (!inRange(t, e, range)) continue
    let score: number
    if (t.targeting === 'first') score = e.dist
    else if (t.targeting === 'strongest') score = e.hp * 1000 + e.dist
    else score = -Math.hypot(e.x - t.x, e.y - t.y)
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  return best
}

/** Damage after armor. Piercing attacks ignore armor. */
export function armorDamage(dmg: number, armor: number, pierce = false): number {
  if (pierce || armor <= 0) return dmg
  return Math.max(dmg * 0.25, dmg - armor)
}

export function damage(s: State, e: Enemy, amount: number, owner: number, pierce = false, towerId = -1) {
  if (e.dead) return
  e.hp -= armorDamage(amount, e.armor, pierce)
  e.hitT = 0.12
  if (e.hp <= 0) kill(s, e, owner, towerId)
}

function kill(s: State, e: Enemy, owner: number, towerId: number) {
  e.dead = true
  e.hp = 0
  s.gold[owner] += e.bounty
  s.kills++
  s.score += Math.round(e.bounty * 10 * DIFFS[s.diff].scoreMul)
  const t = towerId >= 0 ? s.towers.find((x) => x.id === towerId) : undefined
  if (t) t.kills++
  addFx(s, { kind: 'death', x: e.x, y: e.y, ttl: 0.5, r: ENEMIES[e.kind].radius, color: e.kind })
  if (e.kind === 'boss') {
    s.shake = Math.max(s.shake, 0.4)
    addFx(s, { kind: 'gold', x: e.x, y: e.y, ttl: 1.2, text: `+${e.bounty}` })
  }
}

export function applySlow(e: Enemy, factor: number, dur: number) {
  if (e.kind === 'boss') factor = 1 - (1 - factor) * 0.5
  if (e.slowT <= 0 || factor <= e.slowF) {
    e.slowF = Math.min(factor, e.slowT > 0 ? e.slowF : 1)
    e.slowT = Math.max(e.slowT, dur)
  } else {
    e.slowT = Math.max(e.slowT, dur * 0.5)
  }
}

export function applyPoison(e: Enemy, dps: number, dur: number, owner: number) {
  if (dps >= e.poisonDps || e.poisonT <= 0) {
    e.poisonDps = dps
    e.poisonOwner = owner
  }
  e.poisonT = Math.max(e.poisonT, dur)
}

/** Enemies hit by a chain lightning starting at `first`. */
export function chainTargets(s: State, first: Enemy, count: number, jump = 1.7): Enemy[] {
  const hit = [first]
  let cur = first
  while (hit.length < count) {
    let next: Enemy | null = null
    let bd = jump
    for (const e of s.enemies) {
      if (e.dead || hit.includes(e)) continue
      const d = Math.hypot(e.x - cur.x, e.y - cur.y)
      if (d <= bd) {
        bd = d
        next = e
      }
    }
    if (!next) break
    hit.push(next)
    cur = next
  }
  return hit
}

function splashAt(s: State, x: number, y: number, radius: number, fn: (e: Enemy) => void, groundOnly: boolean) {
  for (const e of s.enemies) {
    if (e.dead || (groundOnly && e.flying)) continue
    if (Math.hypot(e.x - x, e.y - y) <= radius + ENEMIES[e.kind].radius * 0.5) fn(e)
  }
}

function fire(s: State, t: Tower, target: Enemy) {
  const def = TOWERS[t.kind]
  const L = def.levels[t.level - 1]
  t.angle = Math.atan2(target.y - t.y, target.x - t.x)
  t.fired = 0
  t.cooldown = L.rate
  if (t.kind === 'lightning') {
    const hit = chainTargets(s, target, L.chain ?? 1)
    let dmg = L.dmg
    const pts = [{ x: t.x, y: t.y - 0.2 }]
    for (const e of hit) {
      pts.push({ x: e.x, y: e.y })
      damage(s, e, dmg, t.owner, false, t.id)
      dmg *= 0.85
    }
    addFx(s, { kind: 'zap', x: t.x, y: t.y, ttl: 0.22, pts })
    return
  }
  if (t.kind === 'sniper') {
    addFx(s, { kind: 'beam', x: t.x, y: t.y, ttl: 0.25, pts: [{ x: target.x, y: target.y }] })
    damage(s, target, L.dmg, t.owner, true, t.id)
    return
  }
  s.projectiles.push({
    id: s.nextId++,
    kind: t.kind,
    level: t.level,
    x: t.x + Math.cos(t.angle) * 0.3,
    y: t.y + Math.sin(t.angle) * 0.3,
    targetId: target.id,
    tx: target.x,
    ty: target.y,
    owner: t.owner,
    towerId: t.id,
  })
}

function impact(s: State, p: Projectile, target: Enemy | undefined) {
  const def = TOWERS[p.kind]
  const L = def.levels[p.level - 1]
  switch (p.kind) {
    case 'arrow':
      if (target) damage(s, target, L.dmg, p.owner, false, p.towerId)
      break
    case 'cannon':
      splashAt(s, p.tx, p.ty, L.splash ?? 1, (e) => damage(s, e, L.dmg, p.owner, false, p.towerId), true)
      addFx(s, { kind: 'boom', x: p.tx, y: p.ty, ttl: 0.35, r: L.splash })
      s.shake = Math.max(s.shake, 0.06 * p.level)
      break
    case 'ice':
      splashAt(
        s,
        p.tx,
        p.ty,
        L.splash ?? 0.5,
        (e) => {
          applySlow(e, L.slow ?? 1, L.slowDur ?? 1)
          damage(s, e, L.dmg, p.owner, false, p.towerId)
        },
        false,
      )
      addFx(s, { kind: 'frost', x: p.tx, y: p.ty, ttl: 0.35, r: L.splash })
      break
    case 'poison': {
      const hitOne = (e: Enemy) => {
        applyPoison(e, L.dot ?? 0, L.dotDur ?? 3, p.owner)
        damage(s, e, L.dmg, p.owner, true, p.towerId)
      }
      if (L.splash) {
        splashAt(s, p.tx, p.ty, L.splash, hitOne, false)
        addFx(s, { kind: 'frost', x: p.tx, y: p.ty, ttl: 0.35, r: L.splash, color: 'poison' })
      } else if (target) hitOne(target)
      break
    }
    default:
      break
  }
}

// ---------------------------------------------------------------- step

export function step(s: State, dt: number = DT): State {
  if (s.status === 'won' || s.status === 'lost') return s
  s.time += dt
  s.shake = Math.max(0, s.shake - dt)

  // spawns
  while (s.spawns.length && s.spawns[0].t <= s.time) {
    const sp = s.spawns.shift()!
    spawnEnemy(s, sp.kind, sp.wave)
  }

  // wave countdown
  if (s.status === 'playing' && s.spawns.length === 0) {
    const more = s.endless || s.wave < TOTAL_WAVES
    if (more) {
      if (s.nextWaveIn == null) s.nextWaveIn = DIFFS[s.diff].breakTime
      else {
        s.nextWaveIn -= dt
        if (s.nextWaveIn <= 0) launchWave(s)
      }
    }
  }

  // enemies: status effects & movement
  for (const e of s.enemies) {
    if (e.dead) continue
    e.hitT = Math.max(0, e.hitT - dt)
    if (e.healedT > 0) e.healedT -= dt
    if (e.poisonT > 0) {
      e.poisonT -= dt
      e.hp -= e.poisonDps * dt
      if (e.hp <= 0) {
        kill(s, e, e.poisonOwner, -1)
        continue
      }
    }
    let f = 1
    if (e.slowT > 0) {
      e.slowT -= dt
      f = e.slowF
      if (e.slowT <= 0) e.slowF = 1
    }
    if (ENEMIES[e.kind].healer) {
      e.healCd -= dt
      if (e.healCd <= 0) {
        e.healCd = 1.5
        let healed = false
        for (const o of s.enemies) {
          if (o === e || o.dead || o.hp >= o.maxHp || o.healedT > 0) continue
          if (Math.hypot(o.x - e.x, o.y - e.y) <= HEAL_RADIUS) {
            o.healedT = 1.4
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.kind === 'boss' ? 0.03 : 0.08))
            healed = true
          }
        }
        if (healed) addFx(s, { kind: 'heal', x: e.x, y: e.y, ttl: 0.5, r: HEAL_RADIUS })
      }
    }
    e.dist += e.speed * f * dt
    if (e.dist >= s.geom.length) {
      e.dead = true
      s.lives = Math.max(0, s.lives - e.lives)
      s.leaked += e.lives
      s.shake = Math.max(s.shake, 0.25)
      addFx(s, { kind: 'leak', x: e.x, y: e.y, ttl: 0.6, text: `-${e.lives}` })
      continue
    }
    const p = posAt(s.geom, e.dist)
    e.x = p.x
    e.y = p.y
  }

  // towers
  for (const t of s.towers) {
    t.fired += dt
    t.cooldown -= dt
    if (t.cooldown > 0) continue
    const target = pickTarget(s, t)
    if (target) fire(s, t, target)
    else t.cooldown = 0.1
  }

  // projectiles
  const alive: Projectile[] = []
  const byId = new Map<number, Enemy>()
  if (s.projectiles.length) for (const e of s.enemies) if (!e.dead) byId.set(e.id, e)
  for (const p of s.projectiles) {
    const target = byId.get(p.targetId)
    if (target) {
      p.tx = target.x
      p.ty = target.y
    }
    const speed = TOWERS[p.kind].projectileSpeed
    const dx = p.tx - p.x
    const dy = p.ty - p.y
    const d = Math.hypot(dx, dy)
    if (d <= speed * dt + 0.05) {
      impact(s, p, target)
      continue
    }
    p.x += (dx / d) * speed * dt
    p.y += (dy / d) * speed * dt
    alive.push(p)
  }
  s.projectiles = alive

  s.enemies = s.enemies.filter((e) => !e.dead)

  // fx
  for (const f of s.fx) f.ttl -= dt
  if (s.fx.length && s.fx.some((f) => f.ttl <= 0)) s.fx = s.fx.filter((f) => f.ttl > 0)

  // end conditions
  if (s.lives <= 0) {
    s.status = 'lost'
  } else if (!s.endless && s.wave >= TOTAL_WAVES && s.spawns.length === 0 && s.enemies.length === 0) {
    s.status = 'won'
    s.score += Math.round(s.lives * 50 * DIFFS[s.diff].scoreMul)
  }
  return s
}

/** Stars for a victory based on remaining lives. */
export function starsFor(lives: number, maxLives: number): number {
  if (lives <= 0) return 0
  const r = lives / maxLives
  if (r >= 0.8) return 3
  if (r >= 0.4) return 2
  return 1
}

/** Waves fully survived (for records). */
export function wavesCleared(s: State): number {
  if (s.status === 'won') return s.wave
  return Math.max(0, s.wave - 1)
}
