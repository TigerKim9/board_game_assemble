// 랜덤 디펜스 (정령 수호대) — pure simulation.
// The field is FIELD_W × FIELD_H units: a 5×3 grid of summon slots surrounded by a
// rectangular loop path on which monsters circle forever. `step` mutates the game in
// place (it runs every frame) and returns it for convenience.

import type { Difficulty } from '../../lib/types'

export const COLS = 5
export const ROWS = 3
export const SLOTS = COLS * ROWS
export const FIELD_W = 7
export const FIELD_H = 5
/** Path: rectangle from (0.5,0.5) to (6.5,4.5), clockwise from the top-left corner. */
export const PATH_W = FIELD_W - 1
export const PATH_H = FIELD_H - 1
export const PATH_LEN = 2 * (PATH_W + PATH_H)

export const LIMIT = 100
export const MAX_TIER = 6
export const WAVE_TIME = 15
export const FIRST_WAVE_DELAY = 6
export const BOSS_EVERY = 10
export const ELITE_EVERY = 5
export const BOSS_TIME = 60
export const START_COINS = 100
export const SPAWN_GAP = 0.45
export const LUCKY_CHANCE = 0.06
export const MAX_UPGRADE = 10
export const UPGRADE_BONUS = 0.2

export type UnitType = 'fire' | 'thunder' | 'ice' | 'rock' | 'poison' | 'luck' | 'wind'

export interface TypeInfo {
  name: string
  emoji: string
  color: string
  role: string
  dmg: number
  interval: number
  range: number
}

export const TYPES: UnitType[] = ['fire', 'thunder', 'ice', 'rock', 'poison', 'luck', 'wind']

export const INFO: Record<UnitType, TypeInfo> = {
  fire: { name: '불꽃 정령', emoji: '🔥', color: '#ff6b3d', role: '강한 단일 공격', dmg: 26, interval: 0.8, range: 2.6 },
  thunder: { name: '번개 정령', emoji: '⚡', color: '#ffd23f', role: '주변 범위 공격', dmg: 16, interval: 1.2, range: 2.3 },
  ice: { name: '서리 정령', emoji: '❄️', color: '#7fd6ff', role: '적을 느리게', dmg: 12, interval: 1.0, range: 2.4 },
  rock: { name: '바위 정령', emoji: '🪨', color: '#b08d6a', role: '확률로 기절', dmg: 22, interval: 1.1, range: 2.2 },
  poison: { name: '독버섯 정령', emoji: '🍄', color: '#7ddc5a', role: '지속 독 피해', dmg: 10, interval: 1.0, range: 2.6 },
  luck: { name: '행운 정령', emoji: '🍀', color: '#3ecf8e', role: '처치 코인 증가', dmg: 10, interval: 1.0, range: 2.2 },
  wind: { name: '바람 정령', emoji: '🌪️', color: '#c9b8ff', role: '주변 공격 속도 증가', dmg: 14, interval: 0.6, range: 2.2 },
}

export const TIER_COLORS = ['', '#9aa5b1', '#4cc26a', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444']
export const CLASS_NAMES = ['일반', '희귀', '전설']

export interface Unit {
  id: number
  type: UnitType
  tier: number
  cd: number
  flash: number
}

export type MonsterKind = 'normal' | 'elite' | 'boss' | 'sent'

export interface Monster {
  id: number
  kind: MonsterKind
  s: number
  dist: number
  hp: number
  maxHp: number
  speed: number
  reward: number
  slowT: number
  slowF: number
  stunT: number
  poisonDps: number
  poisonT: number
  hitT: number
  hue: number
}

export interface Spawn {
  kind: MonsterKind
  hp: number
  speed: number
  reward: number
  hue: number
}

export interface Fx {
  k: 'shot' | 'txt' | 'boom'
  x: number
  y: number
  x2?: number
  y2?: number
  r?: number
  text?: string
  color: string
  t: number
  life: number
  size?: number
}

export interface Side {
  units: (Unit | null)[]
  monsters: Monster[]
  queue: Spawn[]
  spawnT: number
  coins: number
  summons: number
  upg: number[]
  kills: number
  bossT: number | null
  lost: boolean
  loseReason: '' | 'overflow' | 'boss'
  fx: Fx[]
  warn: number
  shake: number
  incoming: number
  /** Coin income multiplier (AI handicap / bonus in versus). */
  coinRate: number
  nextId: number
}

export interface Game {
  sides: Side[]
  versus: boolean
  time: number
  wave: number
  waveTimer: number
  over: boolean
  /** Winning side index in versus, -1 for a draw, null while playing / solo. */
  winner: number | null
}

// ---------- geometry ----------

export function pathPos(s: number): { x: number; y: number } {
  let d = ((s % PATH_LEN) + PATH_LEN) % PATH_LEN
  if (d < PATH_W) return { x: 0.5 + d, y: 0.5 }
  d -= PATH_W
  if (d < PATH_H) return { x: 0.5 + PATH_W, y: 0.5 + d }
  d -= PATH_H
  if (d < PATH_W) return { x: 0.5 + PATH_W - d, y: 0.5 + PATH_H }
  d -= PATH_W
  return { x: 0.5, y: 0.5 + PATH_H - d }
}

export function slotPos(i: number): { x: number; y: number } {
  return { x: 1.5 + (i % COLS), y: 1.5 + Math.floor(i / COLS) }
}

export function slotAt(x: number, y: number): number {
  const c = Math.floor(x - 1)
  const r = Math.floor(y - 1)
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1
  return r * COLS + c
}

export function neighbors(i: number): number[] {
  const c = i % COLS
  const r = Math.floor(i / COLS)
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nc = c + dc
      const nr = r + dr
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) out.push(nr * COLS + nc)
    }
  return out
}

// ---------- numbers ----------

export const classOf = (tier: number) => (tier <= 2 ? 0 : tier <= 4 ? 1 : 2)
export const tierMult = (tier: number) => Math.pow(2.3, tier - 1)
export const summonCost = (summons: number) => 10 + summons * 2
export const upgradeCost = (level: number) => Math.round(60 * Math.pow(1.55, level) / 5) * 5
export const waveHp = (w: number) => Math.round(28 * Math.pow(1.15, w - 1) * (1 + w * 0.03))
export const waveCount = (w: number) => 12 + Math.floor(w * 0.4)
export const waveSpeed = (w: number) => Math.min(3.2, 1.9 + w * 0.03)
export const waveReward = (w: number) => 3 + Math.floor(w / 4)
export const isBossWave = (w: number) => w > 0 && w % BOSS_EVERY === 0
export const isEliteWave = (w: number) => w > 0 && w % ELITE_EVERY === 0 && !isBossWave(w)
export const slowAmount = (tier: number) => Math.min(0.6, 0.25 + 0.05 * tier)
export const stunChance = (tier: number) => 0.1 + 0.03 * tier
export const auraBonus = (tier: number) => 0.1 + 0.05 * tier
export const luckBonus = (tier: number) => 0.12 * tier
/** Monsters sent to the opponent when killing a boss / elite in versus. */
export const sendCount = (kind: MonsterKind, wave: number) =>
  kind === 'boss' ? 8 + Math.floor(wave / 5) : kind === 'elite' ? 4 : 0

export function unitDamage(u: Unit, side: Side): number {
  return INFO[u.type].dmg * tierMult(u.tier) * (1 + UPGRADE_BONUS * side.upg[classOf(u.tier)])
}

export function unitRange(u: Unit): number {
  return INFO[u.type].range + 0.1 * u.tier
}

export function coinMult(side: Side): number {
  let m = 1
  for (const u of side.units) if (u && u.type === 'luck') m += luckBonus(u.tier)
  return m
}

/** Attack-speed multiplier per slot from neighbouring wind spirits (strongest only). */
export function auraMults(side: Side): number[] {
  const out = new Array<number>(SLOTS).fill(1)
  side.units.forEach((u, i) => {
    if (!u || u.type !== 'wind') return
    const b = 1 + auraBonus(u.tier)
    for (const n of neighbors(i)) if (out[n] < b) out[n] = b
  })
  return out
}

/** Damage-per-second estimate (ignores effects), used by the AI and the info panel. */
export function unitDps(u: Unit, side: Side): number {
  return unitDamage(u, side) / INFO[u.type].interval
}

// ---------- setup ----------

export function newSide(): Side {
  return {
    units: new Array(SLOTS).fill(null),
    monsters: [],
    queue: [],
    spawnT: 0,
    coins: START_COINS,
    summons: 0,
    upg: [0, 0, 0],
    kills: 0,
    bossT: null,
    lost: false,
    loseReason: '',
    fx: [],
    warn: 0,
    shake: 0,
    incoming: 0,
    coinRate: 1,
    nextId: 1,
  }
}

export function newGame(players: number): Game {
  return {
    sides: Array.from({ length: players }, newSide),
    versus: players > 1,
    time: 0,
    wave: 0,
    waveTimer: FIRST_WAVE_DELAY,
    over: false,
    winner: null,
  }
}

// ---------- player actions ----------

export function rollSummon(rng: () => number): { type: UnitType; tier: number } {
  const type = TYPES[Math.floor(rng() * TYPES.length)]
  const tier = rng() < LUCKY_CHANCE ? 2 : 1
  return { type, tier }
}

export const emptySlots = (side: Side) => side.units.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0)

export function canSummon(side: Side): boolean {
  return !side.lost && side.coins >= summonCost(side.summons) && side.units.some((u) => !u)
}

/** Summons into a random empty slot. Returns the slot or -1. */
export function summon(side: Side, rng: () => number): number {
  if (!canSummon(side)) return -1
  const empty = emptySlots(side)
  const slot = empty[Math.floor(rng() * empty.length)]
  side.coins -= summonCost(side.summons)
  side.summons++
  const { type, tier } = rollSummon(rng)
  side.units[slot] = { id: side.nextId++, type, tier, cd: 0.3, flash: 0.4 }
  const p = slotPos(slot)
  if (tier > 1) pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.4, text: '행운!', color: '#ffe066', t: 0, life: 1, size: 0.34 })
  return slot
}

export function canMerge(a: Unit | null, b: Unit | null): boolean {
  return !!a && !!b && a !== b && a.type === b.type && a.tier === b.tier && a.tier < MAX_TIER
}

/** Merges `from` into `to`: both disappear, a random unit of the next tier appears at `to`. */
export function merge(side: Side, from: number, to: number, rng: () => number): boolean {
  const a = side.units[from]
  const b = side.units[to]
  if (from === to || side.lost || !canMerge(a, b)) return false
  const type = TYPES[Math.floor(rng() * TYPES.length)]
  side.units[from] = null
  side.units[to] = { id: side.nextId++, type, tier: b!.tier + 1, cd: 0.3, flash: 0.7 }
  const p = slotPos(to)
  pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.9, color: TIER_COLORS[b!.tier + 1], t: 0, life: 0.5 })
  return true
}

/** Moves a unit to an empty slot, or swaps two units. */
export function move(side: Side, from: number, to: number): boolean {
  if (from === to || !side.units[from] || side.lost) return false
  const t = side.units[to]
  side.units[to] = side.units[from]
  side.units[from] = t
  return true
}

/** The do-what-I-mean action for drag / tap-tap: merge when possible, else move/swap. */
export function act(side: Side, from: number, to: number, rng: () => number): 'merge' | 'move' | null {
  if (merge(side, from, to, rng)) return 'merge'
  if (move(side, from, to)) return 'move'
  return null
}

export function canUpgrade(side: Side, cls: number): boolean {
  return !side.lost && side.upg[cls] < MAX_UPGRADE && side.coins >= upgradeCost(side.upg[cls])
}

export function upgrade(side: Side, cls: number): boolean {
  if (!canUpgrade(side, cls)) return false
  side.coins -= upgradeCost(side.upg[cls])
  side.upg[cls]++
  side.units.forEach((u) => {
    if (u && classOf(u.tier) === cls) u.flash = Math.max(u.flash, 0.35)
  })
  return true
}

export function findPairs(side: Side): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < SLOTS; i++)
    for (let j = i + 1; j < SLOTS; j++) if (canMerge(side.units[i], side.units[j])) out.push([i, j])
  return out
}

// ---------- monsters ----------

export function waveSpawns(w: number, rng: () => number): Spawn[] {
  const hp = waveHp(w)
  const speed = waveSpeed(w)
  const reward = waveReward(w)
  const hue = (w * 47) % 360
  if (isBossWave(w)) {
    return [{ kind: 'boss', hp: hp * 14, speed: speed * 0.6, reward: 60 + w * 2, hue: 0 }]
  }
  const list: Spawn[] = Array.from({ length: waveCount(w) }, () => ({
    kind: 'normal' as MonsterKind,
    hp: Math.round(hp * (0.9 + rng() * 0.2)),
    speed,
    reward,
    hue,
  }))
  if (isEliteWave(w)) list.push({ kind: 'elite', hp: hp * 12, speed: speed * 0.8, reward: 25 + w, hue: 280 })
  return list
}

export function sentSpawns(n: number, wave: number): Spawn[] {
  const w = Math.max(1, wave)
  return Array.from({ length: n }, () => ({
    kind: 'sent' as MonsterKind,
    hp: Math.round(waveHp(w) * 1.5),
    speed: waveSpeed(w) * 1.1,
    reward: waveReward(w),
    hue: 320,
  }))
}

function spawnMonster(side: Side, sp: Spawn) {
  side.monsters.push({
    id: side.nextId++,
    kind: sp.kind,
    s: 0,
    dist: 0,
    hp: sp.hp,
    maxHp: sp.hp,
    speed: sp.speed,
    reward: sp.reward,
    slowT: 0,
    slowF: 1,
    stunT: 0,
    poisonDps: 0,
    poisonT: 0,
    hitT: 0,
    hue: sp.hue,
  })
}

const MAX_FX = 120
export function pushFx(side: Side, fx: Fx) {
  if (side.fx.length >= MAX_FX) side.fx.shift()
  side.fx.push(fx)
}

export function fmt(n: number): string {
  n = Math.floor(n)
  if (n < 10000) return String(n)
  if (n < 1e8) return `${(n / 1e4).toFixed(n < 1e5 ? 1 : 0)}만`
  return `${(n / 1e8).toFixed(1)}억`
}

// ---------- simulation ----------

export function startWave(g: Game, rng: () => number) {
  g.wave++
  g.waveTimer = WAVE_TIME
  for (const side of g.sides) {
    if (side.lost) continue
    side.queue.push(...waveSpawns(g.wave, rng))
    if (isBossWave(g.wave)) {
      side.bossT = BOSS_TIME
      side.warn = 2.5
    } else if (isEliteWave(g.wave)) side.warn = 1.6
  }
}

function hit(side: Side, m: Monster, dmg: number, show: boolean, color: string, pos: { x: number; y: number }) {
  m.hp -= dmg
  m.hitT = 0.12
  if (show) pushFx(side, { k: 'txt', x: pos.x, y: pos.y - 0.25, text: fmt(dmg), color, t: 0, life: 0.6, size: 0.26 })
}

function stepSide(g: Game, idx: number, dt: number, rng: () => number) {
  const side = g.sides[idx]
  // effects
  for (const f of side.fx) f.t += dt
  if (side.fx.length && side.fx[0].t >= side.fx[0].life) side.fx = side.fx.filter((f) => f.t < f.life)
  side.warn = Math.max(0, side.warn - dt)
  side.shake = Math.max(0, side.shake - dt)
  side.incoming = Math.max(0, side.incoming - dt)
  for (const u of side.units) if (u && u.flash > 0) u.flash = Math.max(0, u.flash - dt)

  // spawning
  side.spawnT -= dt
  if (side.queue.length && side.spawnT <= 0) {
    const sp = side.queue.shift()!
    spawnMonster(side, sp)
    if (sp.kind === 'boss') side.shake = 0.5
    side.spawnT = sp.kind === 'sent' ? SPAWN_GAP * 0.5 : SPAWN_GAP
  }

  // monster movement and damage over time
  for (const m of side.monsters) {
    m.hitT = Math.max(0, m.hitT - dt)
    if (m.poisonT > 0) {
      m.hp -= m.poisonDps * Math.min(dt, m.poisonT)
      m.poisonT -= dt
    }
    if (m.stunT > 0) {
      m.stunT -= dt
      continue
    }
    let v = m.speed
    if (m.slowT > 0) {
      v *= m.slowF
      m.slowT -= dt
    }
    m.s = (m.s + v * dt) % PATH_LEN
    m.dist += v * dt
  }
  if (side.bossT != null) side.bossT -= dt

  // units attack
  const pos = side.monsters.map((m) => pathPos(m.s))
  const aura = auraMults(side)
  for (let i = 0; i < SLOTS; i++) {
    const u = side.units[i]
    if (!u) continue
    u.cd -= dt * aura[i]
    if (u.cd > 0) continue
    const p = slotPos(i)
    const r2 = unitRange(u) ** 2
    let best = -1
    for (let k = 0; k < side.monsters.length; k++) {
      const m = side.monsters[k]
      if (m.hp <= 0) continue
      const dx = pos[k].x - p.x
      const dy = pos[k].y - p.y
      if (dx * dx + dy * dy > r2) continue
      if (best < 0 || m.dist > side.monsters[best].dist) best = k
    }
    if (best < 0) {
      u.cd = 0
      continue
    }
    const info = INFO[u.type]
    u.cd += info.interval
    const m = side.monsters[best]
    const mp = pos[best]
    const dmg = unitDamage(u, side)
    const boss = m.kind === 'boss'
    pushFx(side, { k: 'shot', x: p.x, y: p.y, x2: mp.x, y2: mp.y, color: info.color, t: 0, life: 0.14 })
    switch (u.type) {
      case 'thunder': {
        const R = 0.8 + 0.06 * u.tier
        pushFx(side, { k: 'boom', x: mp.x, y: mp.y, r: R, color: info.color, t: 0, life: 0.25 })
        side.monsters.forEach((o, k) => {
          if (o.hp <= 0) return
          const dx = pos[k].x - mp.x
          const dy = pos[k].y - mp.y
          if (dx * dx + dy * dy <= R * R) hit(side, o, dmg, o === m, info.color, pos[k])
        })
        break
      }
      case 'ice': {
        hit(side, m, dmg, true, info.color, mp)
        const f = 1 - slowAmount(u.tier) * (boss ? 0.5 : 1)
        m.slowF = m.slowT > 0 ? Math.min(m.slowF, f) : f
        m.slowT = 1.5
        break
      }
      case 'rock': {
        hit(side, m, dmg, true, info.color, mp)
        if (rng() < stunChance(u.tier)) {
          m.stunT = Math.max(m.stunT, (0.5 + 0.1 * u.tier) * (boss ? 0.5 : 1))
          pushFx(side, { k: 'txt', x: mp.x, y: mp.y - 0.5, text: '기절!', color: '#ffe066', t: 0, life: 0.7, size: 0.24 })
        }
        break
      }
      case 'poison': {
        hit(side, m, dmg, true, info.color, mp)
        m.poisonDps = m.poisonT > 0 ? Math.max(m.poisonDps, dmg * 1.5) : dmg * 1.5
        m.poisonT = 3
        break
      }
      default:
        hit(side, m, dmg, true, info.color, mp)
    }
  }

  // deaths
  if (side.monsters.some((m) => m.hp <= 0)) {
    const mult = coinMult(side)
    const alive: Monster[] = []
    side.monsters.forEach((m, k) => {
      if (m.hp > 0) {
        alive.push(m)
        return
      }
      side.kills++
      side.coins += m.reward * mult * side.coinRate
      const p = pos[k] ?? pathPos(m.s)
      pushFx(side, { k: 'boom', x: p.x, y: p.y, r: m.kind === 'boss' ? 1.4 : 0.45, color: `hsl(${m.hue} 80% 65%)`, t: 0, life: 0.35 })
      if (m.kind === 'boss') {
        side.bossT = null
        pushFx(side, { k: 'txt', x: FIELD_W / 2, y: FIELD_H / 2, text: '보스 처치!', color: '#ffe066', t: 0, life: 1.6, size: 0.55 })
      } else if (m.kind === 'elite') {
        pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.4, text: '정예 처치!', color: '#e6b3ff', t: 0, life: 1, size: 0.3 })
      }
      const n = g.versus ? sendCount(m.kind, g.wave) : 0
      if (n > 0) {
        g.sides.forEach((o, j) => {
          if (j === idx || o.lost) return
          o.queue.push(...sentSpawns(n, g.wave))
          o.incoming = 2
        })
      }
    })
    side.monsters = alive
  }

  if (side.monsters.length >= LIMIT) {
    side.lost = true
    side.loseReason = 'overflow'
  } else if (side.bossT != null && side.bossT <= 0) {
    side.lost = true
    side.loseReason = 'boss'
  }
}

/** Both sides fell in the same instant: less boss HP left wins, then fewer monsters; else a draw. */
export function tieBreak(sides: Side[]): number {
  const score = (s: Side) => {
    const boss = s.monsters.find((m) => m.kind === 'boss')
    return (boss ? boss.hp / boss.maxHp : 0) * 1000 + s.monsters.length
  }
  const a = score(sides[0])
  const b = score(sides[1])
  return Math.abs(a - b) < 1e-9 ? -1 : a < b ? 0 : 1
}

export const AI_COIN_RATE: Record<Difficulty, number> = { easy: 0.7, normal: 1, hard: 1.25 }

export function step(g: Game, dt: number, rng: () => number): Game {
  if (g.over) return g
  g.time += dt
  g.waveTimer -= dt
  if (g.waveTimer <= 0) startWave(g, rng)
  g.sides.forEach((s, i) => {
    if (!s.lost) stepSide(g, i, dt, rng)
  })
  const lost = g.sides.map((s) => s.lost)
  if (g.versus) {
    if (lost.some(Boolean)) {
      g.over = true
      const alive = lost.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0)
      g.winner = alive.length === 1 ? alive[0] : alive.length > 1 ? null : tieBreak(g.sides)
    }
  } else if (lost[0]) g.over = true
  return g
}

/** Waves fully survived (the record). */
export const wavesCleared = (g: Game) => Math.max(0, g.sides.every((s) => s.lost) || g.over ? g.wave - 1 : g.wave)

// ---------- AI ----------

export const AI_INTERVAL: Record<Difficulty, number> = { easy: 1.5, normal: 0.75, hard: 0.3 }

/** Performs at most one action for the AI-controlled side. Returns what it did. */
export function aiAct(side: Side, diff: Difficulty, rng: () => number): 'summon' | 'merge' | 'upgrade' | null {
  if (side.lost) return null
  if (diff === 'easy' && rng() < 0.3) return null
  if (canSummon(side)) {
    summon(side, rng)
    return 'summon'
  }
  const pairs = findPairs(side)
  if (pairs.length) {
    let pair: [number, number]
    if (diff === 'easy') pair = pairs[Math.floor(rng() * pairs.length)]
    else {
      // merge the lowest tier first; keep wind/luck spirits when possible
      const score = ([a]: [number, number]) => {
        const u = side.units[a]!
        return u.tier * 10 + (u.type === 'wind' || u.type === 'luck' ? 3 : 0)
      }
      pair = pairs.slice().sort((p, q) => score(p) - score(q))[0]
    }
    // put the result in the more central slot (better reach)
    const centrality = (i: number) => -Math.abs((i % COLS) - 2) - Math.abs(Math.floor(i / COLS) - 1)
    const [a, b] = diff !== 'easy' && centrality(pair[0]) > centrality(pair[1]) ? [pair[1], pair[0]] : pair
    merge(side, a, b, rng)
    return 'merge'
  }
  // board is full and nothing merges: spend on upgrades
  const power = [0, 0, 0]
  side.units.forEach((u) => {
    if (u) power[classOf(u.tier)] += unitDps(u, side)
  })
  const cls =
    diff === 'easy'
      ? Math.floor(rng() * 3)
      : diff === 'normal'
        ? [0, 1, 2].sort((a, b) => power[b] - power[a])[0]
        : [0, 1, 2].sort((a, b) => power[b] / (side.upg[b] + 1) - power[a] / (side.upg[a] + 1))[0]
  if (power[cls] > 0 && canUpgrade(side, cls)) {
    upgrade(side, cls)
    return 'upgrade'
  }
  return null
}

/** Headless simulation helper (tests, balancing). */
export function simulate(
  players: number,
  diffs: Difficulty[],
  rng: () => number,
  maxTime = 900,
  dt = 1 / 20,
): Game {
  const g = newGame(players)
  const timers = diffs.map(() => 0)
  if (players > 1) diffs.forEach((d, i) => (g.sides[i].coinRate = AI_COIN_RATE[d]))
  while (!g.over && g.time < maxTime) {
    diffs.forEach((d, i) => {
      timers[i] += dt
      if (timers[i] >= AI_INTERVAL[d]) {
        timers[i] = 0
        aiAct(g.sides[i], d, rng)
      }
    })
    step(g, dt, rng)
  }
  return g
}
