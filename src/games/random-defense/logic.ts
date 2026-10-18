// 랜덤 디펜스 (정령 수호대) — pure simulation.
// The field is FIELD_W × FIELD_H units: a 6×3 grid of summon slots surrounded by a
// rectangular loop path on which monsters circle forever. The left 5×3 slots are open from
// the start; the right-hand column (EXTRA_SLOTS) starts locked and opens at wave milestones
// or when bought with coins. `step` mutates the game in
// place (it runs every frame) and returns it for convenience.

import type { Difficulty } from '../../lib/types'

export const COLS = 6
export const ROWS = 3
export const SLOTS = COLS * ROWS
export const FIELD_W = COLS + 2
export const FIELD_H = ROWS + 2
/** Locked slots, in the order they open (middle of the right column first). */
export const EXTRA_SLOTS = [11, 5, 17]
export const BASE_SLOTS = SLOTS - EXTRA_SLOTS.length
/** Waves at whose start one more locked slot opens for free. */
export const UNLOCK_WAVES = [10, 20, 30]
/** Path: rectangle from (0.5,0.5) to (FIELD_W-0.5, FIELD_H-0.5), clockwise from the top-left corner. */
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
  /** Coins spent on this unit (summon price + both merged units' value + transforms). */
  inv: number
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
  k: 'shot' | 'txt' | 'boom' | 'swap'
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
  /** Which slots can hold units (EXTRA_SLOTS start closed). */
  open: boolean[]
  /** Extra slots opened so far (bought or by wave milestone). */
  unlocks: number
  transforms: number
  sold: number
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
/** Sell refund: half of what went into the unit, so selling never beats keeping coins. */
export const SELL_RATE = 0.5
export const refundOf = (u: Unit) => Math.floor(u.inv * SELL_RATE)
/** Reroll price: doubles per ★ and rises 10% with every transform used this game. */
export const transformCost = (tier: number, uses: number) => Math.round(15 * Math.pow(2, tier - 1) * (1 + 0.1 * uses))
export const UNLOCK_COSTS = [120, 200, 320]
/** Price of the next locked slot, given how many extra slots are already open. */
export const unlockCost = (opened: number) => UNLOCK_COSTS[Math.min(opened, UNLOCK_COSTS.length - 1)]
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

/**
 * Wind auras stack with diminishing returns: the strongest neighbouring wind counts in full,
 * the 2nd at 70%, the 3rd at 50% … capped at +AURA_CAP. Wind spirits buff each other too,
 * so a cluster of winds speeds itself up.
 */
export const AURA_STACK = [1, 0.7, 0.5, 0.35, 0.25, 0.2, 0.15, 0.1]
export const AURA_CAP = 1.5

export interface AuraInfo {
  /** Attack-speed multiplier (1 = no buff). */
  mult: number
  /** Number of neighbouring wind spirits contributing. */
  count: number
}

export function auraInfo(side: Side): AuraInfo[] {
  const bonuses: number[][] = Array.from({ length: SLOTS }, () => [])
  side.units.forEach((u, i) => {
    if (!u || u.type !== 'wind') return
    for (const n of neighbors(i)) bonuses[n].push(auraBonus(u.tier))
  })
  return bonuses.map((list) => {
    list.sort((a, b) => b - a)
    let total = 0
    list.forEach((b, k) => (total += b * (AURA_STACK[k] ?? AURA_STACK[AURA_STACK.length - 1])))
    return { mult: 1 + Math.min(AURA_CAP, total), count: list.length }
  })
}

/** Attack-speed multiplier per slot from neighbouring wind spirits (stacking). */
export function auraMults(side: Side): number[] {
  return auraInfo(side).map((a) => a.mult)
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
    open: Array.from({ length: SLOTS }, (_, i) => !EXTRA_SLOTS.includes(i)),
    unlocks: 0,
    transforms: 0,
    sold: 0,
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

export const emptySlots = (side: Side) => side.units.map((u, i) => (u || !side.open[i] ? -1 : i)).filter((i) => i >= 0)
export const openCount = (side: Side) => side.open.filter(Boolean).length

export function canSummon(side: Side): boolean {
  return !side.lost && side.coins >= summonCost(side.summons) && side.units.some((u, i) => !u && side.open[i])
}

/** Summons into a random empty slot. Returns the slot or -1. */
export function summon(side: Side, rng: () => number): number {
  if (!canSummon(side)) return -1
  const empty = emptySlots(side)
  const slot = empty[Math.floor(rng() * empty.length)]
  const cost = summonCost(side.summons)
  side.coins -= cost
  side.summons++
  const { type, tier } = rollSummon(rng)
  side.units[slot] = { id: side.nextId++, type, tier, cd: 0.3, flash: 0.4, inv: cost }
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
  side.units[to] = { id: side.nextId++, type, tier: b!.tier + 1, cd: 0.3, flash: 0.7, inv: a!.inv + b!.inv }
  const p = slotPos(to)
  pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.9, color: TIER_COLORS[b!.tier + 1], t: 0, life: 0.5 })
  return true
}

/** Moves a unit to an empty slot, or swaps two units. */
export function move(side: Side, from: number, to: number): boolean {
  if (from === to || !side.units[from] || side.lost || !side.open[to] || !side.open[from]) return false
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

export function canSell(side: Side, slot: number): boolean {
  return !side.lost && !!side.units[slot]
}

/** Sells the unit in `slot` for half its invested coins. Returns the refund, or -1. */
export function sell(side: Side, slot: number): number {
  const u = side.units[slot]
  if (!u || !canSell(side, slot)) return -1
  const refund = refundOf(u)
  side.coins += refund
  side.units[slot] = null
  side.sold++
  const p = slotPos(slot)
  pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.6, color: '#ffd23f', t: 0, life: 0.4 })
  pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.2, text: `+${refund}`, color: '#ffe066', t: 0, life: 0.9, size: 0.3 })
  return refund
}

export function canTransform(side: Side, slot: number): boolean {
  const u = side.units[slot]
  return !side.lost && !!u && side.coins >= transformCost(u.tier, side.transforms)
}

/** Rerolls the unit into a random different type with the same ★. */
export function transform(side: Side, slot: number, rng: () => number): boolean {
  const u = side.units[slot]
  if (!u || !canTransform(side, slot)) return false
  const cost = transformCost(u.tier, side.transforms)
  const others = TYPES.filter((t) => t !== u.type)
  const old = u.type
  side.coins -= cost
  side.transforms++
  side.units[slot] = { ...u, id: side.nextId++, type: others[Math.floor(rng() * others.length)], flash: 0.7, inv: u.inv + cost }
  const p = slotPos(slot)
  pushFx(side, { k: 'swap', x: p.x, y: p.y, r: 0.55, text: INFO[old].emoji, color: INFO[side.units[slot]!.type].color, t: 0, life: 0.55 })
  return true
}

/** Next locked slot to open, or -1 when every slot is open. */
export const nextLocked = (side: Side) => EXTRA_SLOTS.find((i) => !side.open[i]) ?? -1

export function canUnlock(side: Side): boolean {
  return !side.lost && nextLocked(side) >= 0 && side.coins >= unlockCost(side.unlocks)
}

function openSlot(side: Side, slot: number, label: string) {
  side.open[slot] = true
  side.unlocks++
  const p = slotPos(slot)
  pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.9, color: '#ffe066', t: 0, life: 0.6 })
  pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.35, text: label, color: '#ffe066', t: 0, life: 1.3, size: 0.26 })
}

/** Buys a locked slot (the given one, or the next in order). Returns the slot or -1. */
export function unlock(side: Side, slot = nextLocked(side)): number {
  if (!canUnlock(side) || slot < 0 || side.open[slot] || !EXTRA_SLOTS.includes(slot)) return -1
  side.coins -= unlockCost(side.unlocks)
  openSlot(side, slot, '칸 열림!')
  return slot
}

/** Board full (no empty open slot) and nothing can merge: only sell / transform / unlock help. */
export function isStuck(side: Side): boolean {
  return !side.lost && emptySlots(side).length === 0 && findPairs(side).length === 0
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
    if (UNLOCK_WAVES.includes(g.wave)) {
      const slot = nextLocked(side)
      if (slot >= 0) openSlot(side, slot, '무료 칸 열림!')
    }
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

export type AiAction = 'summon' | 'merge' | 'upgrade' | 'unlock' | 'transform' | 'sell' | null

/** Chance that rerolling `slot` creates a merge pair (another unit with its ★ but a different type). */
export function pairChance(side: Side, slot: number): number {
  const u = side.units[slot]
  if (!u || u.tier >= MAX_TIER) return 0
  const types = new Set<UnitType>()
  side.units.forEach((o, i) => {
    if (o && i !== slot && o.tier === u.tier && o.type !== u.type) types.add(o.type)
  })
  return types.size / (TYPES.length - 1)
}

/** Best unit to reroll when stuck: highest pair chance per coin, sparing wind/luck spirits. */
export function bestTransform(side: Side, diff: Difficulty, rng: () => number): number {
  let best = -1
  let bestScore = 0
  side.units.forEach((u, i) => {
    if (!u) return
    const p = pairChance(side, i)
    if (p <= 0 || side.coins < transformCost(u.tier, side.transforms)) return
    let score = diff === 'easy' ? rng() : p / transformCost(u.tier, side.transforms)
    if (diff !== 'easy' && (u.type === 'wind' || u.type === 'luck')) score *= 0.6
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** Weakest unit worth selling to make room (never ★5+), or -1. */
export function weakestUnit(side: Side): number {
  let best = -1
  side.units.forEach((u, i) => {
    if (!u || u.tier >= 5) return
    const b = best >= 0 ? side.units[best]! : null
    if (!b || unitDps(u, side) < unitDps(b, side)) best = i
  })
  return best
}

function aiUpgrade(side: Side, diff: Difficulty, rng: () => number): AiAction {
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

/**
 * Performs at most one action for the AI-controlled side. Returns what it did.
 * `tools = false` gives the old behaviour (no selling / rerolling / buying slots) for comparisons.
 */
export function aiAct(side: Side, diff: Difficulty, rng: () => number, tools = true): AiAction {
  if (side.lost) return null
  if (diff === 'easy' && rng() < 0.3) return null
  // a nearly full board is worth growing before it jams
  if (tools && diff !== 'easy' && canUnlock(side) && emptySlots(side).length <= 1) {
    unlock(side)
    return 'unlock'
  }
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
    const mid = (COLS - 1) / 2
    const centrality = (i: number) => -Math.abs((i % COLS) - mid) - Math.abs(Math.floor(i / COLS) - 1)
    const [a, b] = diff !== 'easy' && centrality(pair[0]) > centrality(pair[1]) ? [pair[1], pair[0]] : pair
    merge(side, a, b, rng)
    return 'merge'
  }
  if (!tools || !isStuck(side)) return aiUpgrade(side, diff, rng)

  // Stuck: full board, no pairs. Open a slot, reroll a spirit into a pair, or sell the weakest.
  if (canUnlock(side) && (diff !== 'easy' || rng() < 0.5)) {
    unlock(side)
    return 'unlock'
  }
  // a careful AI saves up for the next slot instead of frittering coins away
  if (diff === 'hard' && nextLocked(side) >= 0 && side.coins >= unlockCost(side.unlocks) * 0.6) return null
  if (diff === 'easy' && rng() < 0.5) return aiUpgrade(side, diff, rng)
  const t = bestTransform(side, diff, rng)
  if (t >= 0) {
    const cost = transformCost(side.units[t]!.tier, side.transforms)
    // a much better deal on an upgrade wins over a pricey reroll
    const up = Math.min(...[0, 1, 2].map((c) => (side.upg[c] < MAX_UPGRADE ? upgradeCost(side.upg[c]) : Infinity)))
    if (diff === 'easy' || cost <= up * 0.6 || side.coins < up) {
      transform(side, t, rng)
      return 'transform'
    }
    return aiUpgrade(side, diff, rng)
  }
  // nothing to reroll cheaply: sell the weakest spirit if a fresh summon could then pair with something
  const w = weakestUnit(side)
  if (w >= 0) {
    const refund = refundOf(side.units[w]!)
    const ones = new Set(side.units.filter((u, i) => u && i !== w && u.tier === 1).map((u) => u!.type))
    if (ones.size > 0 && side.coins + refund >= summonCost(side.summons)) {
      sell(side, w)
      return 'sell'
    }
  }
  return aiUpgrade(side, diff, rng)
}

/** Headless simulation helper (tests, balancing). */
export function simulate(
  players: number,
  diffs: Difficulty[],
  rng: () => number,
  maxTime = 900,
  dt = 1 / 20,
  tools = true,
): Game {
  const g = newGame(players)
  const timers = diffs.map(() => 0)
  if (players > 1) diffs.forEach((d, i) => (g.sides[i].coinRate = AI_COIN_RATE[d]))
  while (!g.over && g.time < maxTime) {
    diffs.forEach((d, i) => {
      timers[i] += dt
      if (timers[i] >= AI_INTERVAL[d]) {
        timers[i] = 0
        aiAct(g.sides[i], d, rng, tools)
      }
    })
    step(g, dt, rng)
  }
  return g
}
