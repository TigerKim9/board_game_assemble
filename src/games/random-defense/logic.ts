// 랜덤 디펜스 (정령 수호대) — pure simulation.
// The field is FIELD_W × FIELD_H units: a 6×3 grid of summon slots surrounded by a
// rectangular loop path on which monsters circle forever. The left 5×3 slots are open from
// the start; the right-hand column (EXTRA_SLOTS) starts locked and opens at wave milestones
// or when bought with coins. `step` mutates the game in
// place (it runs every frame) and returns it for convenience.
//
// Co-op (협동): two boards stacked vertically in one shared coordinate system. The bottom
// board is shifted down by COOP_OFFSET so the top board's bottom path edge and the bottom
// board's top path edge are the same physical lane (y = SHARED_LANE_Y, the "공동 전선").
// Every spirit can hit any monster in range — its own or the partner's. Each side keeps its
// own loop, coins, upgrades and boss; the monster limit and the defeat are shared.

import { mulberry32 } from '../../lib/random'
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
/** Highest ★. ★7 (각성) only comes from merging two ★6 spirits of the same type. */
export const MAX_TIER = 7
export const AWAKEN_TIER = 7
/** Highest ★ that random results (merges, the 🎲 card) can reach. */
export const MAX_ROLL_TIER = AWAKEN_TIER - 1
export const WAVE_TIME = 15
export const FIRST_WAVE_DELAY = 6
export const BOSS_EVERY = 10
export const ELITE_EVERY = 5
export const BOSS_TIME = 60
export const START_COINS = 100
export const SPAWN_GAP = 0.45
export const LUCKY_CHANCE = 0.06
export const MAX_UPGRADE = 10
/** Single-target spirits aim at a boss in range before anything else (the boss is on a clock). */
export const BOSS_HUNTERS: UnitType[] = ['fire', 'rock', 'poison', 'meteor', 'curse']
export const UPGRADE_BONUS = 0.2

export type BaseType = 'fire' | 'thunder' | 'ice' | 'rock' | 'poison' | 'luck' | 'wind'
/** Hidden spirits: only made by merging a recipe pair (see RECIPES). */
export type HiddenType = 'meteor' | 'blizzard' | 'curse' | 'rainbow'
export type UnitType = BaseType | HiddenType

export interface TypeInfo {
  name: string
  emoji: string
  color: string
  role: string
  dmg: number
  interval: number
  range: number
}

/** Types that summons, random merges and transforms can produce. */
export const TYPES: UnitType[] = ['fire', 'thunder', 'ice', 'rock', 'poison', 'luck', 'wind']
export const HIDDEN_TYPES: HiddenType[] = ['meteor', 'blizzard', 'curse', 'rainbow']
export const isHidden = (t: UnitType): t is HiddenType => (HIDDEN_TYPES as UnitType[]).includes(t)

export const INFO: Record<UnitType, TypeInfo> = {
  fire: { name: '불꽃 정령', emoji: '🔥', color: '#ff6b3d', role: '강한 단일 공격', dmg: 26, interval: 0.8, range: 2.6 },
  thunder: { name: '번개 정령', emoji: '⚡', color: '#ffd23f', role: '주변 범위 공격', dmg: 16, interval: 1.2, range: 2.3 },
  ice: { name: '서리 정령', emoji: '❄️', color: '#7fd6ff', role: '적을 느리게', dmg: 12, interval: 1.0, range: 2.4 },
  rock: { name: '바위 정령', emoji: '🪨', color: '#b08d6a', role: '확률로 기절', dmg: 22, interval: 1.1, range: 2.2 },
  poison: { name: '독버섯 정령', emoji: '🍄', color: '#7ddc5a', role: '지속 독 피해', dmg: 10, interval: 1.0, range: 2.6 },
  luck: { name: '행운 정령', emoji: '🍀', color: '#3ecf8e', role: '처치 코인 증가', dmg: 10, interval: 1.0, range: 2.2 },
  wind: { name: '바람 정령', emoji: '🌪️', color: '#c9b8ff', role: '주변 공격 속도 증가', dmg: 14, interval: 0.6, range: 2.2 },
  meteor: { name: '운석 정령', emoji: '☄️', color: '#ff8a3d', role: '넓은 범위 대폭발', dmg: 24, interval: 1.1, range: 2.6 },
  blizzard: { name: '눈보라 정령', emoji: '🌀', color: '#9fe8ff', role: '사거리 안 모두 공격·둔화·주변 공격 속도 증가', dmg: 8, interval: 1.2, range: 2.4 },
  curse: { name: '저주 정령', emoji: '💀', color: '#c77dff', role: '맞은 적이 받는 피해 증가', dmg: 24, interval: 1.0, range: 2.5 },
  rainbow: { name: '무지개 정령', emoji: '🌈', color: '#ff7eb6', role: '연쇄 번개 · 처치 코인 증가', dmg: 18, interval: 0.9, range: 2.6 },
}

/** Recipe merges: two DIFFERENT spirits with the same ★ (★3+) make a hidden spirit one ★ higher. */
export const RECIPE_MIN_TIER = 3
export const RECIPES: { a: BaseType; b: BaseType; out: HiddenType }[] = [
  { a: 'fire', b: 'thunder', out: 'meteor' },
  { a: 'ice', b: 'wind', out: 'blizzard' },
  { a: 'rock', b: 'poison', out: 'curse' },
  { a: 'luck', b: 'thunder', out: 'rainbow' },
]
/** Hidden spirit made from two types (either order), or null. */
export function recipeOf(a: UnitType, b: UnitType): HiddenType | null {
  for (const r of RECIPES) if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r.out
  return null
}
export const recipeFor = (h: HiddenType) => RECIPES.find((r) => r.out === h)!
/** Hidden types in `found` that are not in the codex yet (codex = list of discovered type ids). */
export function newDiscoveries(known: readonly string[], found: readonly UnitType[]): HiddenType[] {
  const out: HiddenType[] = []
  for (const t of found) if (isHidden(t) && !known.includes(t) && !out.includes(t)) out.push(t)
  return out
}

export const TIER_COLORS = ['', '#9aa5b1', '#4cc26a', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ff4fd8']
export const CLASS_NAMES = ['일반', '희귀', '전설']

// ---------- augment cards (증강 카드) ----------

export type CardId =
  | 'fire'
  | 'thunder'
  | 'frost'
  | 'quake'
  | 'venom'
  | 'gold'
  | 'gale'
  | 'dice'
  | 'discount'
  | 'time'
  | 'reach'
  | 'chest'
  | 'slayer'
  | 'swap'
  | 'compound'

export const CARD_FIRE = 0.4
export const CARD_THUNDER = 0.3
export const CARD_FROST = 0.15
export const CARD_QUAKE = 0.1
export const CARD_VENOM = 2
export const CARD_GOLD = 0.25
export const CARD_GALE = 0.25
export const CARD_DICE = 0.15
export const CARD_DISCOUNT = 0.2
export const CARD_TIME = 15
export const CARD_REACH = 0.4
export const CARD_SLAYER = 0.3
export const CARD_SWAP = 0.5
export const CARD_COMPOUND = 0.3
/** 💰 card: coins paid at once, growing with the wave. */
export const chestCoins = (wave: number) => 60 + 10 * Math.max(1, wave)

export interface CardInfo {
  name: string
  emoji: string
  desc: string
  /** Most copies one side can own. */
  max: number
}

export const CARDS: Record<CardId, CardInfo> = {
  fire: { name: '불꽃 강화', emoji: '🔥', desc: `불꽃·운석 정령 공격력 +${CARD_FIRE * 100}%`, max: 3 },
  thunder: { name: '번개 확장', emoji: '⚡', desc: `번개·운석 폭발 범위 +${CARD_THUNDER * 100}%`, max: 2 },
  frost: { name: '혹한', emoji: '❄️', desc: `둔화 +${CARD_FROST * 100}%p, 보스도 온전히 느려져요`, max: 1 },
  quake: { name: '지진', emoji: '🪨', desc: `바위 정령 기절 확률 +${CARD_QUAKE * 100}%p`, max: 2 },
  venom: { name: '맹독', emoji: '🍄', desc: `독 피해 ${CARD_VENOM}배`, max: 1 },
  gold: { name: '황금손', emoji: '🍀', desc: `처치 코인 +${CARD_GOLD * 100}%`, max: 2 },
  gale: { name: '순풍', emoji: '🌪️', desc: `바람 정령 속도 버프 +${CARD_GALE * 100}%`, max: 2 },
  dice: { name: '행운의 합성', emoji: '🎲', desc: `합성할 때 ${CARD_DICE * 100}% 확률로 ★이 2단계 올라요 (★${MAX_ROLL_TIER}까지)`, max: 2 },
  discount: { name: '할인', emoji: '💸', desc: `소환 비용 −${CARD_DISCOUNT * 100}%`, max: 1 },
  time: { name: '시간 연장', emoji: '⏳', desc: `보스 제한 시간 +${CARD_TIME}초`, max: 2 },
  reach: { name: '매의 눈', emoji: '🎯', desc: `모든 정령 사거리 +${CARD_REACH}`, max: 2 },
  chest: { name: '보물 상자', emoji: '💰', desc: '지금 바로 코인 (웨이브가 높을수록 많이)', max: 99 },
  slayer: { name: '보스 사냥꾼', emoji: '🏹', desc: `보스에게 주는 피해 +${CARD_SLAYER * 100}%`, max: 3 },
  swap: { name: '변신술', emoji: '🔁', desc: `바꾸기 비용 −${CARD_SWAP * 100}%`, max: 1 },
  compound: { name: '복리', emoji: '💹', desc: `자동 수입 +${CARD_COMPOUND * 100}%`, max: 2 },
}
export const CARD_IDS = Object.keys(CARDS) as CardId[]
export const OFFER_SIZE = 3

export const emptyCards = (): Record<CardId, number> =>
  Object.fromEntries(CARD_IDS.map((id) => [id, 0])) as Record<CardId, number>

export interface Unit {
  id: number
  type: UnitType
  tier: number
  cd: number
  flash: number
  /** Coins spent on this unit (summon price + both merged units' value + transforms). */
  inv: number
}

/** Who owns a co-op board: side 0 is the top board, side 1 the bottom one. */
export type Mode = 'solo' | 'versus' | 'coop'
/** Vertical shift of the bottom co-op board: its top path edge lands on the top board's bottom edge. */
export const COOP_OFFSET = FIELD_H - 1
/** Height of the combined co-op field (two boards sharing one lane). */
export const COOP_H = FIELD_H + COOP_OFFSET
/** y of the shared lane in co-op coordinates. */
export const SHARED_LANE_Y = 0.5 + PATH_H
/** Grid row of each co-op board that touches the shared lane. */
export const COOP_EDGE_ROW = [ROWS - 1, 0]
/** Shared monster limit across both co-op loops (meta.ts rules quote it). */
export const COOP_LIMIT = 160
/** Co-op waves are a bit tougher than solo ones because the partner helps on the shared lane. */
export const COOP_HP = 1.6
/** Body hue of each co-op board's normal monsters (matches the players' colours in render.ts). */
export const COOP_HUES = [28, 205]
/** Share of a partner-monster kill reward the killer gets (the owner gets the rest). */
export const COOP_HELP_SHARE = 0.5

export type MonsterKind = 'normal' | 'elite' | 'boss' | 'sent'

export interface Monster {
  id: number
  kind: MonsterKind
  s: number
  /** Walks the loop counter-clockwise (the top co-op board, so it reaches the shared lane after one side). */
  rev?: boolean
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
  /** Side whose spirit hit it last (kill credit in co-op). */
  by?: number
  /** Side whose poison is ticking on it. */
  poisonBy?: number
  /** 💀 curse: seconds left and extra damage taken (0.3 = +30%). */
  curseT?: number
  curseF?: number
  /** Seconds since it appeared (🎯 fast-kill missions). */
  age?: number
  /** Visual only: seconds of electric crackle left (⚡ / 🌈 hits). */
  zapT?: number
  /** Type of the spirit that hit it last (kill pop-ups). */
  lastHit?: UnitType
}

export interface Spawn {
  kind: MonsterKind
  hp: number
  speed: number
  reward: number
  hue: number
}

export interface Fx {
  k: 'shot' | 'txt' | 'boom' | 'swap' | 'meteor' | 'chain' | 'nova'
  x: number
  y: number
  x2?: number
  y2?: number
  r?: number
  text?: string
  color: string
  /** Negative while waiting to appear (queued pop-ups). */
  t: number
  life: number
  /** Nova drawn as a thin ring only (frequent attacks, so overlapping waves don't cover the field). */
  faint?: boolean
  size?: number
  /** 'pop': a big centre message; pops queue up one after another instead of overlapping. */
  tag?: 'pop'
  /** 'shot' fx: the attacking spirit's type and ★ (render.ts draws a type-specific attack). */
  src?: UnitType
  tier?: number
}

/** How long an attack's visual lives: projectiles fly a little, beams flash. */
export const SHOT_LIFE: Record<UnitType, number> = {
  fire: 0.2,
  thunder: 0.18,
  ice: 0.3,
  rock: 0.34,
  poison: 0.3,
  luck: 0.28,
  wind: 0.26,
  meteor: 0.14,
  blizzard: 0.14,
  curse: 0.22,
  rainbow: 0.18,
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
  /** Path position where this side's monsters appear (co-op bottom board spawns bottom-left). */
  spawnS: number
  /** Monsters of this board walk counter-clockwise (top co-op board). */
  rev: boolean
  /** Co-op: partner monsters this side finished off. */
  helped: number
  /** Wave this side has reached (for wave-scaled card rewards). */
  wave: number
  /** Augment cards owned (copies per card). */
  cards: Record<CardId, number>
  /** Open card offer (3 choices), or null. */
  offer: CardId[] | null
  /** Offers earned while one was already open; each opens after the current pick. */
  offerQueue: number
  /** Hidden spirits this side made this game (for the codex). */
  found: HiddenType[]
  /** 🎰 gamble summons used. */
  gambles: number
  /** 🎯 active missions (MISSION_SLOTS) and how many were completed. */
  missions: Mission[]
  missionsDone: number
  /** Kills by this side since the current wave started. */
  waveKills: number
  /** ⚡ skill cooldowns in seconds (index = SKILLS order). */
  skillCd: number[]
  /** ⏸️ seconds left of the time freeze on this side's loop. */
  freezeT: number
  skillUses: number
  /** 💹 income investment level (0..MAX_INCOME). */
  incomeLvl: number
  /** Coins earned so far: passively (💰 auto income) and from kills (stats / balancing). */
  passiveEarned: number
  killEarned: number
  /** Seconds of income ticking (drives the HUD's small pulse). */
  incomeT: number
}

export interface Game {
  sides: Side[]
  versus: boolean
  coop: boolean
  /** Co-op defeat: why and whose board caused it. */
  coopFail: { reason: 'overflow' | 'boss'; side: number } | null
  time: number
  wave: number
  waveTimer: number
  over: boolean
  /** Winning side index in versus, -1 for a draw, null while playing / solo. */
  winner: number | null
  /**
   * 🌅 Daily challenge: separate seeded streams so the n-th card offer / mission is the same for
   * everyone that day no matter how the game is played (summons and merges use their own
   * streams passed in by the UI). Absent in normal games.
   */
  streams?: Streams
}

export type StreamName = 'summon' | 'merge' | 'card' | 'mission' | 'combat'
export type Streams = Record<StreamName, () => number>

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded random streams of a daily challenge (date as YYYY-MM-DD). */
export function dailyStreams(date: string): Streams {
  const mk = (name: StreamName) => mulberry32(hashSeed(`random-defense:${date}:${name}`))
  return { summon: mk('summon'), merge: mk('merge'), card: mk('card'), mission: mk('mission'), combat: mk('combat') }
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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

/** A monster's position on its own board's loop. */
export const monsterLocal = (m: Pick<Monster, 's' | 'rev'>) => pathPos(m.rev ? -m.s : m.s)

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

/** Offset of a side's board in the shared field (co-op stacks the boards). */
export function boardOffset(g: Pick<Game, 'coop'>, idx: number): { x: number; y: number } {
  return { x: 0, y: g.coop ? idx * COOP_OFFSET : 0 }
}

/** Monster position in the shared field coordinates. */
export function monsterPos(g: Pick<Game, 'coop'>, idx: number, m: Monster): { x: number; y: number } {
  const p = monsterLocal(m)
  return { x: p.x, y: p.y + boardOffset(g, idx).y }
}

// ---------- numbers ----------

export const classOf = (tier: number) => (tier <= 2 ? 0 : tier <= 4 ? 1 : 2)
export const tierMult = (tier: number) => Math.pow(2.1, tier - 1)
/** Copies of an augment card a side owns. */
export const cardN = (side: Side, id: CardId) => side.cards?.[id] ?? 0
/** Attack-speed multiplier from stars: +10% per star above ★1 (★6 = +50%, ★7 = +60%). */
export const tierSpeed = (tier: number) => 1 + 0.1 * (tier - 1)
export const SUMMON_COST_CAP = 60
export const summonCost = (summons: number) => Math.min(SUMMON_COST_CAP, 10 + summons * 2)
/** What the next summon actually costs this side (💸 card discount). */
export const summonPrice = (side: Side) =>
  Math.max(1, Math.round(summonCost(side.summons) * (1 - CARD_DISCOUNT * cardN(side, 'discount'))))
/** Sell refund: half of what went into the unit, so selling never beats keeping coins. */
export const SELL_RATE = 0.5
export const refundOf = (u: Unit) => Math.floor(u.inv * SELL_RATE)
/** Reroll price: doubles per ★ and rises 10% with every transform used this game. */
export const transformCost = (tier: number, uses: number) => Math.round(15 * Math.pow(2, tier - 1) * (1 + 0.1 * uses))
/** What rerolling a spirit of this ★ costs this side (🔁 card discount). */
export const transformPrice = (side: Side, tier: number) =>
  Math.max(1, Math.round(transformCost(tier, side.transforms) * (1 - CARD_SWAP * cardN(side, 'swap'))))
export const UNLOCK_COSTS = [120, 200, 320]
/** Price of the next locked slot, given how many extra slots are already open. */
export const unlockCost = (opened: number) => UNLOCK_COSTS[Math.min(opened, UNLOCK_COSTS.length - 1)]
export const upgradeCost = (level: number) => Math.round(60 * Math.pow(1.55, level) / 5) * 5
/** Waves after this one grow more slowly, so the late game is a long climb instead of a wall. */
export const HP_SOFT_WAVE = 30
/** HP growth per wave after HP_SOFT_WAVE (cards, hidden spirits and ★7 carry the late game). */
export const HP_LATE_GROWTH = 1.13
export const waveHp = (w: number) =>
  Math.round(28 * Math.pow(1.15, Math.min(w, HP_SOFT_WAVE) - 1) * Math.pow(HP_LATE_GROWTH, Math.max(0, w - HP_SOFT_WAVE)) * (1 + w * 0.03))
export const waveCount = (w: number) => 12 + Math.floor(w * 0.4)
/** A wave always finishes spawning within this many seconds, so late waves never pile up behind each other. */
export const SPAWN_WINDOW = 12
export const spawnGap = (w: number) => Math.min(SPAWN_GAP, SPAWN_WINDOW / waveCount(Math.max(1, w)))
export const waveSpeed = (w: number) => Math.min(3.2, 1.9 + w * 0.03)
export const waveReward = (w: number) => 3 + Math.floor(w / 4)
export const isBossWave = (w: number) => w > 0 && w % BOSS_EVERY === 0
export const isEliteWave = (w: number) => w > 0 && w % ELITE_EVERY === 0 && !isBossWave(w)
export const slowAmount = (tier: number) => Math.min(0.6, 0.25 + 0.05 * tier)
export const stunChance = (tier: number) => 0.1 + 0.03 * tier
/** Wind attack-speed bonus by star: grows steeply so high-star winds feel dramatic (★6 = +400%, ★7 = +600%). */
export const AURA_BY_TIER = [0.3, 0.6, 1.0, 1.7, 2.7, 4.0, 6.0]
export const auraBonus = (tier: number) => AURA_BY_TIER[Math.min(AURA_BY_TIER.length, Math.max(1, tier)) - 1]
export const luckBonus = (tier: number) => 0.12 * tier
/** 🌈 rainbow spirits also raise kill coins, a bit less than luck spirits. */
export const rainbowBonus = (tier: number) => 0.08 * tier
/** 💀 extra damage a cursed monster takes from every source. */
export const curseAmp = (tier: number) => 0.2 + 0.02 * tier
export const CURSE_TIME = 4
/** ☄️ explosion radius / 🌈 chain jumps. */
export const meteorRadius = (tier: number) => 0.9 + 0.06 * tier
export const thunderRadius = (tier: number) => 0.8 + 0.06 * tier
export const chainJumps = (tier: number) => (tier >= 6 ? 3 : 2)
export const CHAIN_RANGE = 1.6
export const CHAIN_FALLOFF = 0.6
/** Monsters sent to the opponent when killing a boss / elite in versus. */
export const sendCount = (kind: MonsterKind, wave: number) =>
  kind === 'boss' ? 8 + Math.floor(wave / 5) : kind === 'elite' ? 4 : 0

export function unitDamage(u: Unit, side: Side): number {
  const fire = u.type === 'fire' || u.type === 'meteor' ? 1 + CARD_FIRE * cardN(side, 'fire') : 1
  return INFO[u.type].dmg * tierMult(u.tier) * (1 + UPGRADE_BONUS * side.upg[classOf(u.tier)]) * fire
}

/** Seconds between attacks (before wind auras). */
export function unitInterval(u: Unit): number {
  return INFO[u.type].interval / tierSpeed(u.tier)
}

export function unitRange(u: Unit, side?: Side): number {
  return INFO[u.type].range + 0.1 * u.tier + (side ? CARD_REACH * cardN(side, 'reach') : 0)
}

// ---------- 💰 passive income ----------

/** Coins per second before boosts: grows with the wave. */
export const PASSIVE_BASE = 1
export const PASSIVE_WAVE = 0.2
export const passiveBase = (wave: number) => PASSIVE_BASE + PASSIVE_WAVE * Math.max(0, wave)
/** 💹 each investment level adds this share of the base rate. */
export const INCOME_STEP = 0.4
export const MAX_INCOME = 10
export const investCost = (level: number) => Math.round((80 * Math.pow(1.6, level)) / 5) * 5
/** 🍀 luck spirits add this per ★ to passive income; the 🍀 황금손 card adds INCOME_GOLD per copy. */
export const INCOME_LUCK = 0.03
export const INCOME_GOLD = 0.1

/** Passive-income multiplier from investments, luck spirits and cards (before coinRate). */
export function incomeMult(side: Side, level = side.incomeLvl): number {
  let m = 1 + INCOME_STEP * level + CARD_COMPOUND * cardN(side, 'compound') + INCOME_GOLD * cardN(side, 'gold')
  for (const u of side.units) if (u && u.type === 'luck') m += INCOME_LUCK * u.tier
  return m
}

/** Coins per second this side earns on its own right now. */
export function passiveRate(side: Side, level = side.incomeLvl): number {
  return passiveBase(side.wave) * incomeMult(side, level) * side.coinRate
}

export function canInvest(side: Side): boolean {
  return !side.lost && side.incomeLvl < MAX_INCOME && side.coins >= investCost(side.incomeLvl)
}

/** Buys the next 💹 income level. */
export function invest(side: Side): boolean {
  if (!canInvest(side)) return false
  side.coins -= investCost(side.incomeLvl)
  side.incomeLvl++
  pushPop(side, `💹 수입 투자 Lv${side.incomeLvl}`, '#9ff0b5', 0.32)
  return true
}

/** Income gained per second by the next level (for the button and the AI). */
export const investGain = (side: Side) => passiveRate(side, side.incomeLvl + 1) - passiveRate(side)

function accrueIncome(side: Side, dt: number) {
  if (side.lost) return
  const c = passiveRate(side) * dt
  side.coins += c
  side.passiveEarned += c
  side.incomeT += dt
}

export function coinMult(side: Side): number {
  let m = 1 + CARD_GOLD * cardN(side, 'gold')
  for (const u of side.units) {
    if (u && u.type === 'luck') m += luckBonus(u.tier)
    else if (u && u.type === 'rainbow') m += rainbowBonus(u.tier)
  }
  return m
}

/**
 * Wind auras stack with diminishing returns: the strongest neighbouring wind counts in full,
 * the 2nd at 95%, the 3rd at 90% … capped at +AURA_CAP. Wind spirits buff each other too,
 * so a cluster of winds speeds itself up.
 */
export const AURA_STACK = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65]
export const AURA_CAP = 10

export interface AuraInfo {
  /** Attack-speed multiplier (1 = no buff). */
  mult: number
  /** Number of neighbouring wind spirits contributing. */
  count: number
}

/** Spirits whose aura speeds up their 8 neighbours: wind, and the blizzard born from it. */
export const isAuraSource = (t: UnitType) => t === 'wind' || t === 'blizzard'
/** A blizzard keeps the aura of the wind it was made from: one star below its own. */
export const auraTier = (u: Unit) => (u.type === 'blizzard' ? u.tier - 1 : u.tier)
/** Share of that wind aura a blizzard passes on (it also freezes and hits everything in range). */
export const BLIZZARD_AURA = 0.75

export function auraInfo(side: Side): AuraInfo[] {
  const bonuses: number[][] = Array.from({ length: SLOTS }, () => [])
  const gale = 1 + CARD_GALE * cardN(side, 'gale')
  side.units.forEach((u, i) => {
    if (!u || !isAuraSource(u.type)) return
    for (const n of neighbors(i)) bonuses[n].push(auraBonus(auraTier(u)) * gale * (u.type === 'blizzard' ? BLIZZARD_AURA : 1))
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

/** Rough worth of a hidden spirit's special attack (extra targets / amplification) for the AI. */
const HIDDEN_WORTH: Record<HiddenType, number> = { meteor: 2, blizzard: 3, curse: 1.6, rainbow: 2 }

/** Damage-per-second estimate (ignores most effects), used by the AI and the info panel. */
export function unitDps(u: Unit, side: Side): number {
  const extra = (isHidden(u.type) ? HIDDEN_WORTH[u.type] : 1) * (u.tier >= AWAKEN_TIER ? 2 : 1)
  return (unitDamage(u, side) / unitInterval(u)) * extra
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
    spawnS: 0,
    rev: false,
    helped: 0,
    wave: 0,
    cards: emptyCards(),
    offer: null,
    offerQueue: 0,
    found: [],
    gambles: 0,
    missions: [],
    missionsDone: 0,
    waveKills: 0,
    skillCd: SKILLS.map(() => SKILL_START_CD),
    freezeT: 0,
    skillUses: 0,
    incomeLvl: 0,
    passiveEarned: 0,
    killEarned: 0,
    incomeT: 0,
  }
}

export function newGame(players: number, mode: Mode = players > 1 ? 'versus' : 'solo'): Game {
  const coop = mode === 'coop' && players > 1
  const sides = Array.from({ length: players }, newSide)
  // Mirror images: the top board's monsters leave its top-left portal downwards (counter-clockwise),
  // the bottom board's leave its bottom-left portal upwards (clockwise). Both walk one side, then
  // the shared lane left to right, so neither partner gets the lane's monsters first.
  if (coop) {
    sides[0].rev = true
    sides[1].spawnS = 2 * PATH_W + PATH_H
  }
  return {
    sides,
    versus: players > 1 && !coop,
    coop,
    coopFail: null,
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
  return !side.lost && side.coins >= summonPrice(side) && side.units.some((u, i) => !u && side.open[i])
}

/** Summons into a random empty slot. Returns the slot or -1. */
export function summon(side: Side, rng: () => number): number {
  if (!canSummon(side)) return -1
  const empty = emptySlots(side)
  const slot = empty[Math.floor(rng() * empty.length)]
  const cost = summonPrice(side)
  side.coins -= cost
  side.summons++
  const { type, tier } = rollSummon(rng)
  side.units[slot] = { id: side.nextId++, type, tier, cd: 0.3, flash: 0.4, inv: cost }
  const p = slotPos(slot)
  if (tier > 1) pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.4, text: '행운!', color: '#ffe066', t: 0, life: 1, size: 0.34 })
  return slot
}

/** Two different spirits of a recipe pair with the same ★ (★3–★5) can merge into a hidden spirit. */
export function canMergeRecipe(a: Unit | null, b: Unit | null): boolean {
  return (
    !!a &&
    !!b &&
    a !== b &&
    a.type !== b.type &&
    a.tier === b.tier &&
    a.tier >= RECIPE_MIN_TIER &&
    a.tier < MAX_ROLL_TIER &&
    recipeOf(a.type, b.type) != null
  )
}

/** Same type and same ★ (★7 is the top), or a recipe pair. */
export function canMerge(a: Unit | null, b: Unit | null): boolean {
  if (!a || !b || a === b) return false
  if (a.type === b.type) return a.tier === b.tier && a.tier < MAX_TIER
  return canMergeRecipe(a, b)
}

/**
 * Merges `from` into `to`; both disappear and one spirit a ★ higher appears at `to`:
 * - recipe pair → that hidden spirit;
 * - two ★6 of one type → ★7 (각성) of the SAME type;
 * - two hidden spirits of one type → the same hidden type;
 * - otherwise a random (normal) type.
 * The 🎲 card may add one more ★, never past MAX_ROLL_TIER.
 */
export function merge(side: Side, from: number, to: number, rng: () => number): boolean {
  const a = side.units[from]
  const b = side.units[to]
  if (from === to || side.lost || !canMerge(a, b)) return false
  const recipe = a!.type !== b!.type ? recipeOf(a!.type, b!.type) : null
  let tier = b!.tier + 1
  let type: UnitType
  if (recipe) type = recipe
  else if (tier >= AWAKEN_TIER || isHidden(b!.type)) type = b!.type
  else type = TYPES[Math.floor(rng() * TYPES.length)]
  const dice = cardN(side, 'dice')
  let lucky = false
  if (dice > 0 && tier < MAX_ROLL_TIER && rng() < CARD_DICE * dice) {
    tier++
    lucky = true
  }
  side.units[from] = null
  side.units[to] = { id: side.nextId++, type, tier, cd: 0.3, flash: 0.7, inv: a!.inv + b!.inv }
  const p = slotPos(to)
  pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.9, color: TIER_COLORS[tier], t: 0, life: 0.5 })
  if (tier >= 5) missionEvent(side, 'star5')
  if (recipe) {
    missionEvent(side, 'hidden')
    if (!side.found.includes(recipe)) side.found.push(recipe)
    pushFx(side, { k: 'nova', x: p.x, y: p.y, r: 1.2, color: INFO[recipe].color, t: 0, life: 0.8 })
    pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.45, text: `${INFO[recipe].emoji} ${INFO[recipe].name}!`, color: '#fff3b0', t: 0, life: 1.4, size: 0.3 })
  } else if (tier >= AWAKEN_TIER) {
    pushFx(side, { k: 'nova', x: p.x, y: p.y, r: 1.4, color: TIER_COLORS[AWAKEN_TIER], t: 0, life: 1 })
    pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.45, text: '각성!', color: '#ffd6f5', t: 0, life: 1.4, size: 0.34 })
  }
  if (lucky) pushFx(side, { k: 'txt', x: p.x, y: p.y + 0.3, text: '🎲 ★+2!', color: '#ffe066', t: 0, life: 1.2, size: 0.26 })
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

/** Hidden and ★7 (각성) spirits can't be rerolled. */
export const transformable = (u: Unit | null) => !!u && !isHidden(u.type) && u.tier < AWAKEN_TIER

export function canTransform(side: Side, slot: number): boolean {
  const u = side.units[slot]
  return !side.lost && transformable(u) && side.coins >= transformPrice(side, u!.tier)
}

/** Rerolls the unit into a random different (normal) type with the same ★. */
export function transform(side: Side, slot: number, rng: () => number): boolean {
  const u = side.units[slot]
  if (!u || !canTransform(side, slot)) return false
  const cost = transformPrice(side, u.tier)
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

// ---------- augment card offers ----------

/** One-line description of a card for this side (💰 shows the actual coins). */
export function cardDesc(id: CardId, side: Side): string {
  return id === 'chest' ? `지금 바로 코인 +${chestCoins(side.wave)}` : CARDS[id].desc
}

/** Up to OFFER_SIZE distinct cards this side can still take, drawn with `rng`. */
export function rollOffer(side: Side, rng: () => number): CardId[] {
  const pool = CARD_IDS.filter((id) => cardN(side, id) < CARDS[id].max)
  const out: CardId[] = []
  while (out.length < OFFER_SIZE && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  return out
}

/** Earned an offer (elite / boss kill): opens it, or queues it behind the one already open. */
export function grantOffer(side: Side, rng: () => number) {
  if (side.lost) return
  if (side.offer) side.offerQueue++
  else {
    const offer = rollOffer(side, rng)
    side.offer = offer.length ? offer : null
  }
}

/** Takes card `id` from the open offer; the next queued offer (if any) opens right away. */
export function pickCard(side: Side, id: CardId, rng: () => number): boolean {
  if (!side.offer || !side.offer.includes(id) || side.lost) return false
  side.cards[id] = cardN(side, id) + 1
  if (id === 'chest') side.coins += Math.round(chestCoins(side.wave) * side.coinRate)
  if (id === 'time' && side.bossT != null) side.bossT += CARD_TIME
  side.offer = null
  if (side.offerQueue > 0) {
    side.offerQueue--
    const next = rollOffer(side, rng)
    side.offer = next.length ? next : null
  }
  pushPop(side, `${CARDS[id].emoji} ${CARDS[id].name}`, '#ffe066')
  return true
}

/** AI card choice: the card that helps its current board the most (easy: the first one offered). */
export function aiPickCard(side: Side, diff: Difficulty = 'hard'): CardId {
  const offer = side.offer ?? []
  if (diff === 'easy' || offer.length <= 1) return offer[0]
  let total = 0
  const by: Partial<Record<UnitType, number>> = {}
  let winds = 0
  side.units.forEach((u) => {
    if (!u) return
    const d = unitDps(u, side)
    total += d
    by[u.type] = (by[u.type] ?? 0) + d
    if (isAuraSource(u.type)) winds++
  })
  const share = (...ts: UnitType[]) => (total > 0 ? ts.reduce((a, t) => a + (by[t] ?? 0), 0) / total : 0)
  const value: Record<CardId, number> = {
    fire: CARD_FIRE * share('fire', 'meteor'),
    thunder: 0.25 * share('thunder', 'meteor'),
    frost: 0.4 * share('ice', 'blizzard') + (by.ice || by.blizzard ? 0.05 : 0),
    quake: 0.3 * share('rock'),
    venom: 0.9 * share('poison'),
    gold: 0.14,
    gale: winds ? 0.08 + 0.06 * winds : 0,
    dice: 0.18,
    discount: 0.12,
    time: side.wave >= 30 ? 0.12 : 0.06,
    reach: 0.12,
    chest: 0.1,
    slayer: 0.1 + 0.05 * Math.floor(side.wave / 20),
    swap: 0.04,
    compound: side.wave < 25 ? 0.14 : 0.08,
  }
  return offer.slice().sort((a, b) => value[b] - value[a])[0]
}

// ---------- 🎰 gamble summon ----------

/** Gamble price: this many normal summons (the 💸 discount applies through summonPrice). */
export const GAMBLE_MULT = 2.8
/** Chance of ★1, ★2, ★3, ★4. */
export const GAMBLE_ODDS = [0.4, 0.3, 0.2, 0.1]
export const gamblePrice = (side: Side) => Math.round(summonPrice(side) * GAMBLE_MULT)

export function canGamble(side: Side): boolean {
  return !side.lost && side.coins >= gamblePrice(side) && side.units.some((u, i) => !u && side.open[i])
}

export function rollGamble(rng: () => number): { type: UnitType; tier: number } {
  const type = TYPES[Math.floor(rng() * TYPES.length)]
  let r = rng()
  let tier = 1
  for (let k = 0; k < GAMBLE_ODDS.length; k++) {
    if (r < GAMBLE_ODDS[k]) {
      tier = k + 1
      break
    }
    r -= GAMBLE_ODDS[k]
  }
  return { type, tier }
}

/** Pays the gamble price for a random ★1–★4 in a random empty slot (counts as a summon). Returns the slot or -1. */
export function gamble(side: Side, rng: () => number): number {
  if (!canGamble(side)) return -1
  const empty = emptySlots(side)
  const slot = empty[Math.floor(rng() * empty.length)]
  const cost = gamblePrice(side)
  side.coins -= cost
  side.summons++
  side.gambles++
  const { type, tier } = rollGamble(rng)
  side.units[slot] = { id: side.nextId++, type, tier, cd: 0.3, flash: 0.7, inv: cost }
  const p = slotPos(slot)
  const text = tier >= 4 ? '초대박!' : tier >= 3 ? '대박!' : tier === 1 ? '꽝…' : '본전'
  const color = tier >= 3 ? '#ffe066' : tier === 1 ? '#b9c0cc' : '#ffffff'
  pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.42, text, color, t: 0, life: 1.1, size: tier >= 3 ? 0.34 : 0.26 })
  if (tier >= 3) {
    pushFx(side, { k: 'boom', x: p.x, y: p.y, r: 0.9, color: TIER_COLORS[tier], t: 0, life: 0.5 })
    missionEvent(side, 'gamble3')
  }
  return slot
}

// ---------- 🎯 missions ----------

export type MissionId =
  | 'star5'
  | 'hidden'
  | 'eliteFast'
  | 'bossFast'
  | 'waveKills'
  | 'sameType'
  | 'gamble3'
  | 'wind2'
  | 'calmStart'
  | 'upgrades'
  | 'invest'

export interface Mission {
  id: MissionId
  goal: number
  progress: number
}

export const MISSION_SLOTS = 3
export const ELITE_FAST = 20
export const BOSS_FAST = 30
export const CALM_LIMIT = 10
export const CALM_WAVES = 3
export const SAME_TYPE_GOAL = 4
export const UPGRADE_STEP = 3
/** Coins for a completed mission. */
export const missionReward = (wave: number) => 20 + 3 * Math.max(1, wave)

export const MISSIONS: Record<MissionId, { emoji: string; text: (goal: number) => string }> = {
  star5: { emoji: '⭐', text: () => '★5 이상 정령 만들기' },
  hidden: { emoji: '🔮', text: () => '숨겨진 정령 만들기' },
  eliteFast: { emoji: '👺', text: () => `정예를 나온 지 ${ELITE_FAST}초 안에 처치` },
  bossFast: { emoji: '👹', text: () => `보스를 나온 지 ${BOSS_FAST}초 안에 처치` },
  waveKills: { emoji: '⚔️', text: (n) => `한 웨이브 동안 ${n}마리 처치` },
  sameType: { emoji: '👯', text: (n) => `같은 종류 정령 ${n}마리 모으기` },
  gamble3: { emoji: '🎰', text: () => '도박 소환으로 ★3 이상 뽑기' },
  wind2: { emoji: '🌪️', text: () => '바람 2개가 겹친 정령 만들기' },
  calmStart: { emoji: '🧘', text: (n) => `몬스터 ${CALM_LIMIT}마리 이하로 웨이브 시작 ${n}번 연속` },
  upgrades: { emoji: '💪', text: (n) => `강화 레벨 합계 ${n} 달성` },
  invest: { emoji: '💹', text: (n) => `수입 투자 ${n}레벨 달성` },
}
export const MISSION_IDS = Object.keys(MISSIONS) as MissionId[]

const upgSum = (side: Side) => side.upg.reduce((a, b) => a + b, 0)

function missionGoal(id: MissionId, side: Side): number {
  switch (id) {
    case 'waveKills':
      return Math.max(10, Math.min(25, waveCount(side.wave + 1) - 2))
    case 'sameType':
      return SAME_TYPE_GOAL
    case 'wind2':
      return 2
    case 'calmStart':
      return CALM_WAVES
    case 'invest':
      return Math.min(MAX_INCOME, side.incomeLvl + 2)
    case 'upgrades':
      return Math.min(3 * MAX_UPGRADE, upgSum(side) + UPGRADE_STEP)
    default:
      return 1
  }
}

/** Fills the side's mission list up to MISSION_SLOTS with distinct random missions. */
export function refillMissions(side: Side, rng: () => number) {
  while (side.missions.length < MISSION_SLOTS) {
    const pool = MISSION_IDS.filter(
      (id) => !side.missions.some((m) => m.id === id) && !(id === 'upgrades' && upgSum(side) >= 3 * MAX_UPGRADE) &&
        !(id === 'invest' && side.incomeLvl >= MAX_INCOME - 1),
    )
    if (!pool.length) return
    const id = pool[Math.floor(rng() * pool.length)]
    side.missions.push({ id, goal: missionGoal(id, side), progress: 0 })
  }
}

/** An event happened (e.g. a ★5 was made): bumps every active mission of that kind. */
export function missionEvent(side: Side, id: MissionId, amount = 1) {
  for (const m of side.missions) if (m.id === id) m.progress = Math.min(m.goal, m.progress + amount)
}

/** Missions that track the board / counters rather than events. */
export function updateMissions(side: Side) {
  for (const m of side.missions) {
    if (m.id === 'waveKills') m.progress = Math.min(m.goal, side.waveKills)
    else if (m.id === 'upgrades') m.progress = Math.min(m.goal, upgSum(side))
    else if (m.id === 'invest') m.progress = Math.min(m.goal, side.incomeLvl)
    else if (m.id === 'sameType') {
      const n = new Map<UnitType, number>()
      for (const u of side.units) if (u) n.set(u.type, (n.get(u.type) ?? 0) + 1)
      m.progress = Math.min(m.goal, Math.max(m.progress, ...n.values(), 0))
    } else if (m.id === 'wind2') {
      const best = Math.max(0, ...auraInfo(side).map((a, i) => (side.units[i] ? a.count : 0)))
      m.progress = Math.min(m.goal, Math.max(m.progress, best))
    }
  }
}

/** Pays and replaces finished missions. Returns the coins paid. */
export function settleMissions(side: Side, rng: () => number): number {
  let paid = 0
  for (let k = 0; k < side.missions.length; k++) {
    const m = side.missions[k]
    if (m.progress < m.goal) continue
    const coins = Math.round(missionReward(side.wave) * side.coinRate)
    side.coins += coins
    paid += coins
    side.missionsDone++
    pushPop(side, `🎯 미션 완료! +${coins}`, '#9ff0b5', 0.32)
    side.missions.splice(k--, 1)
  }
  if (paid) refillMissions(side, rng)
  return paid
}

function missionsTick(g: Game, rng: () => number) {
  const r = g.streams?.mission ?? rng
  for (const side of g.sides) {
    if (side.lost) continue
    if (side.missions.length < MISSION_SLOTS) refillMissions(side, r)
    updateMissions(side)
    settleMissions(side, r)
  }
}

// ---------- ⚡ active skills ----------

export type SkillId = 'meteor' | 'freeze'
export const SKILLS: SkillId[] = ['meteor', 'freeze']
/** Every skill starts on this cooldown. */
export const SKILL_START_CD = 30
/** 💥 damage: METEOR_HP × the wave's monster HP to every non-boss, METEOR_BOSS of a boss's max HP. */
export const METEOR_HP = 1.5
export const METEOR_BOSS = 0.08
export const FREEZE_TIME = 4
export const SKILL_INFO: Record<SkillId, { name: string; emoji: string; cd: number; desc: string }> = {
  meteor: {
    name: '메테오',
    emoji: '💥',
    cd: 60,
    desc: `내 길의 모든 몬스터에게 큰 피해 (보스는 최대 체력의 ${METEOR_BOSS * 100}%)`,
  },
  freeze: { name: '시간 정지', emoji: '⏸️', cd: 90, desc: `내 길의 몬스터와 보스 시계를 ${FREEZE_TIME}초 멈춰요` },
}
export const skillIndex = (k: SkillId) => SKILLS.indexOf(k)

export function canSkill(side: Side, k: SkillId): boolean {
  return !side.lost && side.skillCd[skillIndex(k)] <= 0
}

/** Fires a skill on this side's own loop (co-op: the partner's monsters are not touched). */
export function castSkill(side: Side, k: SkillId): boolean {
  if (!canSkill(side, k)) return false
  side.skillCd[skillIndex(k)] = SKILL_INFO[k].cd
  side.skillUses++
  if (k === 'freeze') {
    side.freezeT = FREEZE_TIME
    pushPop(side, '⏸️ 시간 정지!', '#bfe9ff', 0.4)
    return true
  }
  const dmg = waveHp(Math.max(1, side.wave)) * METEOR_HP
  side.monsters.forEach((m, n) => {
    m.hp -= (m.kind === 'boss' ? m.maxHp * METEOR_BOSS : dmg) * (m.curseT && m.curseT > 0 ? 1 + (m.curseF ?? 0) : 1)
    m.hitT = 0.3
    if (n < 24) {
      const p = monsterLocal(m)
      pushFx(side, { k: 'meteor', x: p.x, y: p.y, r: 0.6, color: '#ff8a3d', t: -0.04 * n, life: 0.5 })
    }
  })
  side.shake = 0.5
  pushPop(side, '💥 메테오!', '#ffb36b', 0.42)
  return true
}

/**
 * A centre message (card pick, mission done, skill name). Pops queue one after another
 * instead of drawing on top of each other.
 */
export function pushPop(side: Side, text: string, color: string, size = 0.36) {
  const wait = Math.max(0, ...side.fx.filter((f) => f.tag === 'pop').map((f) => f.life - f.t))
  pushFx(side, { k: 'txt', x: FIELD_W / 2, y: FIELD_H / 2 - 0.4, text, color, t: -wait, life: 1.1, size, tag: 'pop' })
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
    s: side.spawnS,
    rev: side.rev || undefined,
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
    curseT: 0,
    curseF: 0,
    age: 0,
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
    side.wave = g.wave
    side.waveKills = 0
    for (const m of side.missions)
      if (m.id === 'calmStart') m.progress = side.monsters.length <= CALM_LIMIT ? Math.min(m.goal, m.progress + 1) : 0
    const list = waveSpawns(g.wave, rng)
    if (g.coop)
      for (const sp of list) {
        sp.hp = Math.round(sp.hp * COOP_HP)
        // warm monsters on the top loop, cool ones on the bottom loop: easy to tell apart on the shared lane
        if (sp.kind === 'normal') sp.hue = COOP_HUES[g.sides.indexOf(side)]
      }
    if (isBossWave(g.wave)) {
      // the boss cuts the line, and its clock starts when it actually appears (see tickSide)
      side.queue.unshift(...list)
      side.spawnT = Math.min(side.spawnT, 0.6)
      side.warn = 2.5
    } else {
      side.queue.push(...list)
      if (isEliteWave(g.wave)) side.warn = 1.6
    }
    if (UNLOCK_WAVES.includes(g.wave)) {
      const slot = nextLocked(side)
      if (slot >= 0) openSlot(side, slot, '무료 칸 열림!')
    }
  }
}

/** Damage multiplier on a monster from its curse (any attacker). */
const cursed = (m: Monster) => (m.curseT && m.curseT > 0 ? 1 + (m.curseF ?? 0) : 1)

function hit(side: Side, by: number, m: Monster, dmg: number, show: boolean, color: string, pos: { x: number; y: number }) {
  dmg *= cursed(m)
  if (m.kind === 'boss') dmg *= 1 + CARD_SLAYER * cardN(side, 'slayer')
  m.hp -= dmg
  m.hitT = 0.12
  m.by = by
  if (show) pushFx(side, { k: 'txt', x: pos.x, y: pos.y - 0.25, text: fmt(dmg), color, t: 0, life: 0.6, size: 0.26 })
}

/** A monster a spirit may shoot, with its position in the shared field coordinates. */
export interface Target {
  m: Monster
  x: number
  y: number
  owner: number
}

/** Every live monster the given sides own, positioned in the shared field. */
export function targetsOf(g: Game, idxs: number[]): Target[] {
  const out: Target[] = []
  for (const i of idxs)
    for (const m of g.sides[i].monsters) {
      const p = monsterPos(g, i, m)
      out.push({ m, x: p.x, y: p.y, owner: i })
    }
  return out
}

/** Effects, spawning, movement, poison and the boss clock. */
function tickSide(side: Side, dt: number) {
  for (const f of side.fx) f.t += dt
  // drop every finished effect, not only when the oldest one ends (long pops would keep dead ones alive)
  if (side.fx.some((f) => f.t >= f.life)) side.fx = side.fx.filter((f) => f.t < f.life)
  side.warn = Math.max(0, side.warn - dt)
  side.shake = Math.max(0, side.shake - dt)
  side.incoming = Math.max(0, side.incoming - dt)
  for (const u of side.units) if (u && u.flash > 0) u.flash = Math.max(0, u.flash - dt)
  for (let k = 0; k < side.skillCd.length; k++) side.skillCd[k] = Math.max(0, side.skillCd[k] - dt)
  const frozen = side.freezeT > 0
  if (frozen) side.freezeT = Math.max(0, side.freezeT - dt)

  // spawning
  side.spawnT -= dt
  if (side.queue.length && side.spawnT <= 0) {
    const sp = side.queue.shift()!
    spawnMonster(side, sp)
    if (sp.kind === 'boss') {
      side.shake = 0.5
      side.bossT = BOSS_TIME + CARD_TIME * cardN(side, 'time')
    }
    const gap = spawnGap(side.wave)
    side.spawnT = sp.kind === 'sent' ? gap * 0.5 : gap
  }

  // monster movement and damage over time
  for (const m of side.monsters) {
    m.hitT = Math.max(0, m.hitT - dt)
    m.age = (m.age ?? 0) + dt
    if (m.zapT && m.zapT > 0) m.zapT -= dt
    if (m.curseT && m.curseT > 0) m.curseT -= dt
    if (m.poisonT > 0) {
      m.hp -= m.poisonDps * Math.min(dt, m.poisonT) * cursed(m)
      m.poisonT -= dt
      if (m.hp <= 0 && m.poisonBy != null) m.by = m.poisonBy
    }
    if (frozen) continue
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
  if (side.bossT != null && !frozen) side.bossT -= dt
}

/** Spirits of side `idx` shoot at `targets` (shared coordinates; effects drawn in the side's own frame). */
function attackSide(g: Game, idx: number, targets: Target[], dt: number, rng: () => number) {
  const side = g.sides[idx]
  const off = boardOffset(g, idx)
  const aura = auraMults(side)
  for (let i = 0; i < SLOTS; i++) {
    const u = side.units[i]
    if (!u) continue
    u.cd -= dt * aura[i]
    if (u.cd > 0) continue
    const lp = slotPos(i)
    const p = { x: lp.x + off.x, y: lp.y + off.y }
    const r2 = unitRange(u, side) ** 2
    const hunter = BOSS_HUNTERS.includes(u.type)
    const better = (k: number, j: number) => {
      if (j < 0) return true
      const m = targets[k].m
      const b = targets[j].m
      const mb = hunter && m.kind === 'boss'
      const bb = hunter && b.kind === 'boss'
      return mb !== bb ? mb : m.dist > b.dist
    }
    let best = -1
    let second = -1
    for (let k = 0; k < targets.length; k++) {
      if (targets[k].m.hp <= 0) continue
      const dx = targets[k].x - p.x
      const dy = targets[k].y - p.y
      if (dx * dx + dy * dy > r2) continue
      if (better(k, best)) {
        second = best
        best = k
      } else if (better(k, second)) second = k
    }
    if (best < 0) {
      u.cd = 0
      continue
    }
    u.cd += unitInterval(u)
    const shot: Shot = { g, idx, u, lp, p, r2, rng }
    strike(shot, targets, best)
    // 각성 (★7): every attack strikes twice — another monster if there is one
    if (u.tier >= AWAKEN_TIER) {
      const k = second >= 0 ? second : best
      if (targets[k].m.hp > 0) strike(shot, targets, k)
    }
  }
}

interface Shot {
  g: Game
  idx: number
  u: Unit
  /** Spirit position, board-local and shared. */
  lp: { x: number; y: number }
  p: { x: number; y: number }
  r2: number
  rng: () => number
}

/** One attack of spirit `u` at targets[k], with its type's special effect. */
function strike({ g, idx, u, lp, p, r2, rng }: Shot, targets: Target[], k: number) {
  const side = g.sides[idx]
  const off = boardOffset(g, idx)
  const local = (t: { x: number; y: number }) => ({ x: t.x - off.x, y: t.y - off.y })
  const info = INFO[u.type]
  const m = targets[k].m
  const mp = local(targets[k])
  const dmg = unitDamage(u, side)
  const boss = m.kind === 'boss'
  const slow = (o: Monster) => {
    const frost = cardN(side, 'frost')
    const f = 1 - Math.min(0.75, slowAmount(u.tier) + CARD_FROST * frost) * (o.kind === 'boss' && !frost ? 0.5 : 1)
    o.slowF = o.slowT > 0 ? Math.min(o.slowF, f) : f
    o.slowT = 1.5
  }
  /** Everything within R of the centre target (thunder / meteor). */
  const splash = (R: number, mult: number) => {
    const c = targets[k]
    for (const o of targets) {
      if (o.m.hp <= 0) continue
      const dx = o.x - c.x
      const dy = o.y - c.y
      if (dx * dx + dy * dy > R * R) continue
      hit(side, idx, o.m, dmg * mult, o.m === m, info.color, local(o))
      if (u.type === 'thunder') o.m.zapT = 0.35
    }
  }
  m.lastHit = u.type
  if (u.type !== 'blizzard')
    pushFx(side, {
      k: 'shot',
      x: lp.x,
      y: lp.y,
      x2: mp.x,
      y2: mp.y,
      color: info.color,
      t: 0,
      life: SHOT_LIFE[u.type],
      src: u.type,
      tier: u.tier,
    })
  switch (u.type) {
    case 'thunder': {
      const R = thunderRadius(u.tier) * (1 + CARD_THUNDER * cardN(side, 'thunder'))
      pushFx(side, { k: 'boom', x: mp.x, y: mp.y, r: R, color: info.color, t: 0, life: 0.25 })
      splash(R, 1)
      break
    }
    case 'meteor': {
      const R = meteorRadius(u.tier) * (1 + CARD_THUNDER * cardN(side, 'thunder'))
      pushFx(side, { k: 'meteor', x: mp.x, y: mp.y, r: R, color: info.color, t: 0, life: 0.45 })
      splash(R, 1)
      break
    }
    case 'blizzard': {
      // a freezing wave: every monster in range is hit and slowed
      pushFx(side, { k: 'nova', x: lp.x, y: lp.y, r: Math.sqrt(r2), color: info.color, t: 0, life: 0.4, faint: true })
      for (const o of targets) {
        if (o.m.hp <= 0) continue
        const dx = o.x - p.x
        const dy = o.y - p.y
        if (dx * dx + dy * dy > r2) continue
        hit(side, idx, o.m, dmg, o.m === m, info.color, local(o))
        slow(o.m)
      }
      break
    }
    case 'curse': {
      hit(side, idx, m, dmg, true, info.color, mp)
      m.curseF = Math.max(m.curseT && m.curseT > 0 ? (m.curseF ?? 0) : 0, curseAmp(u.tier))
      m.curseT = CURSE_TIME
      break
    }
    case 'rainbow': {
      // chain lightning: jumps to the nearest un-hit monsters, a bit weaker each time
      const hitSet = new Set<Monster>([m])
      hit(side, idx, m, dmg, true, info.color, mp)
      let cur = targets[k]
      let mult = 1
      for (let j = 0; j < chainJumps(u.tier); j++) {
        let next: Target | null = null
        let bd = CHAIN_RANGE * CHAIN_RANGE
        for (const o of targets) {
          if (o.m.hp <= 0 || hitSet.has(o.m)) continue
          const d = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2
          if (d <= bd) {
            bd = d
            next = o
          }
        }
        if (!next) break
        mult *= CHAIN_FALLOFF
        hitSet.add(next.m)
        const a = local(cur)
        const b = local(next)
        pushFx(side, { k: 'chain', x: a.x, y: a.y, x2: b.x, y2: b.y, color: info.color, t: 0, life: 0.25 })
        hit(side, idx, next.m, dmg * mult, false, info.color, b)
        next.m.zapT = 0.35
        cur = next
      }
      break
    }
    case 'ice': {
      hit(side, idx, m, dmg, true, info.color, mp)
      slow(m)
      break
    }
    case 'rock': {
      hit(side, idx, m, dmg, true, info.color, mp)
      if (rng() < stunChance(u.tier) + CARD_QUAKE * cardN(side, 'quake')) {
        m.stunT = Math.max(m.stunT, (0.5 + 0.1 * u.tier) * (boss ? 0.5 : 1))
        pushFx(side, { k: 'txt', x: mp.x, y: mp.y - 0.5, text: '기절!', color: '#ffe066', t: 0, life: 0.7, size: 0.24 })
      }
      break
    }
    case 'poison': {
      hit(side, idx, m, dmg, true, info.color, mp)
      const dps = dmg * 1.5 * (cardN(side, 'venom') ? CARD_VENOM : 1)
      m.poisonDps = m.poisonT > 0 ? Math.max(m.poisonDps, dps) : dps
      m.poisonT = 3
      m.poisonBy = idx
      break
    }
    default:
      hit(side, idx, m, dmg, true, info.color, mp)
  }
}

/**
 * Coins for a kill. Solo / versus / own kills: the owner gets the full reward. A co-op kill of
 * the partner's monster is split: COOP_HELP_SHARE to the killer (with the killer's luck bonus),
 * the rest to the owner (with the owner's) — helping never costs anyone coins.
 */
export function killRewards(g: Game, owner: number, killer: number, reward: number): number[] {
  const out = g.sides.map(() => 0)
  const pay = (i: number, share: number) => (out[i] += reward * share * coinMult(g.sides[i]) * g.sides[i].coinRate)
  if (!g.coop || killer === owner || !g.sides[killer]) pay(owner, 1)
  else {
    pay(killer, COOP_HELP_SHARE)
    pay(owner, 1 - COOP_HELP_SHARE)
  }
  return out
}

/** Removes side `idx`'s dead monsters and pays out (elite / boss kills earn a card offer). */
function reapSide(g: Game, idx: number, rng: () => number) {
  const side = g.sides[idx]
  if (!side.monsters.some((m) => m.hp <= 0)) return
  const alive: Monster[] = []
  for (const m of side.monsters) {
    if (m.hp > 0) {
      alive.push(m)
      continue
    }
    const killer = g.coop && m.by != null && g.sides[m.by] ? m.by : idx
    const pay = killRewards(g, idx, killer, m.reward)
    pay.forEach((c, i) => {
      g.sides[i].coins += c
      g.sides[i].killEarned += c
    })
    if ((m.lastHit === 'luck' || m.lastHit === 'rainbow') && pay[killer] >= 1) {
      // lucky kills show their coins
      const lp = monsterLocal(m)
      pushFx(side, { k: 'txt', x: lp.x, y: lp.y - 0.35, text: `+${Math.floor(pay[killer])}🪙`, color: '#ffd23f', t: 0, life: 0.8, size: 0.24 })
    }
    g.sides[killer].kills++
    g.sides[killer].waveKills++
    if (m.kind === 'elite' && (m.age ?? 0) <= ELITE_FAST) missionEvent(side, 'eliteFast')
    if (m.kind === 'boss' && (m.age ?? 0) <= BOSS_FAST) missionEvent(side, 'bossFast')
    const p = monsterLocal(m)
    pushFx(side, { k: 'boom', x: p.x, y: p.y, r: m.kind === 'boss' ? 1.4 : 0.45, color: `hsl(${m.hue} 80% 65%)`, t: 0, life: 0.35 })
    if (killer !== idx) {
      g.sides[killer].helped++
      if (m.kind !== 'normal' || g.sides[killer].helped % 5 === 0)
        pushFx(side, { k: 'txt', x: p.x, y: p.y - 0.3, text: '🤝', color: '#ffe066', t: 0, life: 0.8, size: 0.3 })
    }
    if (m.kind === 'boss' || m.kind === 'elite') {
      // co-op: a boss or elite is a team kill, so both partners get a card pick, whoever landed the last hit
      const earners = g.coop ? g.sides.filter((s) => !s.lost) : [g.sides[killer]]
      for (const s of earners) grantOffer(s, g.streams?.card ?? rng)
    }
    if (m.kind === 'boss') {
      side.bossT = null
      pushFx(side, {
        k: 'txt',
        x: FIELD_W / 2,
        y: FIELD_H / 2,
        text: killer !== idx ? '함께 보스 처치!' : '보스 처치!',
        color: '#ffe066',
        t: 0,
        life: 1.6,
        size: 0.55,
      })
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
  }
  side.monsters = alive
}

function checkLose(side: Side) {
  if (side.monsters.length >= LIMIT) {
    side.lost = true
    side.loseReason = 'overflow'
  } else if (side.bossT != null && side.bossT <= 0) {
    side.lost = true
    side.loseReason = 'boss'
  }
}

/** Monsters alive across both co-op loops. */
export const coopCount = (g: Game) => g.sides.reduce((n, s) => n + s.monsters.length, 0)

function stepCoop(g: Game, dt: number, rng: () => number) {
  const idxs = g.sides.map((_, i) => i)
  for (const i of idxs) tickSide(g.sides[i], dt)
  const targets = targetsOf(g, idxs)
  for (const i of idxs) attackSide(g, i, targets, dt, rng)
  for (const i of idxs) reapSide(g, i, rng)
  let fail: Game['coopFail'] = null
  const late = g.sides.findIndex((s) => s.bossT != null && s.bossT <= 0)
  if (coopCount(g) >= COOP_LIMIT) {
    // blame the fuller loop
    const side = g.sides[0].monsters.length >= g.sides[1].monsters.length ? 0 : 1
    fail = { reason: 'overflow', side }
  } else if (late >= 0) fail = { reason: 'boss', side: late }
  if (fail) {
    g.coopFail = fail
    for (const s of g.sides) {
      s.lost = true
      s.loseReason = fail.reason
    }
  }
}

function stepSide(g: Game, idx: number, dt: number, rng: () => number) {
  const side = g.sides[idx]
  tickSide(side, dt)
  attackSide(g, idx, targetsOf(g, [idx]), dt, rng)
  reapSide(g, idx, rng)
  checkLose(side)
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
  for (const s of g.sides) accrueIncome(s, dt)
  if (g.coop) {
    stepCoop(g, dt, rng)
    missionsTick(g, rng)
    if (g.coopFail) g.over = true
    return g
  }
  g.sides.forEach((s, i) => {
    if (!s.lost) stepSide(g, i, dt, rng)
  })
  missionsTick(g, rng)
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
/** The AI only gambles once its board is up and running (this many summons). */
export const AI_GAMBLE_AFTER = 12
/** The AI invests when a level pays for itself within this many seconds (and the field is calm). */
export const AI_PAYBACK: Record<Difficulty, number> = { easy: 40, normal: 60, hard: 90 }

/** Whether the AI should buy the next income level now. */
export function aiWantsInvest(side: Side, diff: Difficulty, limit: number): boolean {
  if (!canInvest(side) || side.bossT != null || side.monsters.length > limit * 0.4) return false
  const gain = investGain(side)
  return gain > 0 && investCost(side.incomeLvl) / gain <= AI_PAYBACK[diff]
}
/** How eagerly the AI merges a recipe pair (in "tiers" of priority over normal merges). */
export const RECIPE_PRIORITY_HARD = 25
export const RECIPE_PRIORITY_NORMAL = 5

/** AI sides take an open card offer at once (the UI does the same for AI seats). */
export function aiPickOffers(g: Game, diffs: (Difficulty | null)[], rng: () => number) {
  g.sides.forEach((s, i) => {
    const d = diffs[i]
    if (d && s.offer && !s.lost) pickCard(s, aiPickCard(s, d), rng)
  })
}

export type AiAction =
  | 'summon'
  | 'gamble'
  | 'merge'
  | 'upgrade'
  | 'unlock'
  | 'transform'
  | 'sell'
  | 'move'
  | 'card'
  | 'skill'
  | 'invest'
  | null

/**
 * Which skill the AI should fire now, if any: 💥 when the loop is crowded or the boss clock is
 * running out, ⏸️ only in an emergency. `limit` is the monster count that loses.
 */
export function aiSkill(side: Side, diff: Difficulty, limit: number): SkillId | null {
  const crowd = side.monsters.length / limit
  const boss = side.bossT != null && side.monsters.some((m) => m.kind === 'boss')
  const t = side.bossT ?? Infinity
  // an easy AI only remembers its meteor when the loop is nearly full
  if (diff === 'easy') return canSkill(side, 'meteor') && crowd >= 0.85 ? 'meteor' : null
  if (canSkill(side, 'freeze') && side.freezeT <= 0 && (crowd >= 0.85 || (boss && t < 8))) return 'freeze'
  if (canSkill(side, 'meteor') && (crowd >= 0.6 || (boss && t < 15))) return 'meteor'
  return null
}

/** Chance that rerolling `slot` creates a merge pair (another unit with its ★ but a different type). */
export function pairChance(side: Side, slot: number): number {
  const u = side.units[slot]
  if (!u || !transformable(u)) return 0
  const types = new Set<UnitType>()
  side.units.forEach((o, i) => {
    if (o && i !== slot && o.tier === u.tier && o.type !== u.type && !isHidden(o.type)) types.add(o.type)
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
    if (p <= 0 || side.coins < transformPrice(side, u.tier)) return
    let score = diff === 'easy' ? rng() : p / transformPrice(side, u.tier)
    if (diff !== 'easy' && (isAuraSource(u.type) || u.type === 'luck')) score *= 0.6
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
  // classes already at the max level are skipped (a maxed class used to stall every upgrade)
  const open = [0, 1, 2].filter((c) => side.upg[c] < MAX_UPGRADE)
  if (!open.length) return null
  const cls =
    diff === 'easy'
      ? Math.floor(rng() * 3)
      : diff === 'normal'
        ? open.sort((a, b) => power[b] - power[a])[0]
        : open.sort((a, b) => power[b] / (side.upg[b] + 1) - power[a] / (side.upg[a] + 1))[0]
  if (power[cls] > 0 && canUpgrade(side, cls)) {
    upgrade(side, cls)
    return 'upgrade'
  }
  return null
}

/**
 * Co-op placement preference by grid row: the middle row reaches both of the board's long
 * lanes, the row next to the shared lane reaches the busiest lane (both players' monsters)
 * and the partner's side lanes, and the far row only covers this board's outer lane.
 */
export function coopRowPenalty(row: number, edgeRow: number): number {
  return row === edgeRow ? 0.5 : Math.abs(row - edgeRow) === 1 ? 0 : 1.5
}

/** Co-op board value the AI maximises: damage per second × wind aura, weighted by row reach. */
export function coopBoardScore(side: Side, edgeRow: number): number {
  const aura = auraMults(side)
  let total = 0
  side.units.forEach((u, i) => {
    if (!u) return
    const w = 1 - 0.1 * coopRowPenalty(Math.floor(i / COLS), edgeRow)
    total += unitDps(u, side) * aura[i] * w
  })
  return total
}

/**
 * Co-op: tries every move / swap and makes the one that raises coopBoardScore the most (at
 * least 3%): strong spirits drift to the rows touching the shared lane, winds gather around them.
 * One move per call; returns whether it moved.
 */
const settled = new WeakMap<Side, string>()

export function coopArrange(side: Side, edgeRow: number): boolean {
  if (side.lost) return false
  // nothing changed since the last search found no better layout
  const key = side.units.map((u) => (u ? u.id : 0)).join(',') + '|' + side.upg.join(',')
  if (settled.get(side) === key) return false
  const base = coopBoardScore(side, edgeRow)
  let best = base * 1.03
  let pick: [number, number] | null = null
  for (let a = 0; a < SLOTS; a++) {
    if (!side.units[a] || !side.open[a]) continue
    for (let b = 0; b < SLOTS; b++) {
      if (a === b || !side.open[b] || (side.units[b] && b < a)) continue
      const t = side.units[a]
      side.units[a] = side.units[b]
      side.units[b] = t
      const v = coopBoardScore(side, edgeRow)
      side.units[b] = side.units[a]
      side.units[a] = t
      if (v > best) {
        best = v
        pick = [a, b]
      }
    }
  }
  if (!pick) {
    settled.set(side, key)
    return false
  }
  return move(side, pick[0], pick[1])
}

/**
 * Performs at most one action for the AI-controlled side. Returns what it did.
 * `tools = false` gives the old behaviour (no selling / rerolling / buying slots) for comparisons.
 * `edgeRow` (co-op) is the grid row next to the shared lane, which the AI fills with its best spirits.
 */
export function aiAct(side: Side, diff: Difficulty, rng: () => number, tools = true, edgeRow = -1): AiAction {
  if (side.lost) return null
  if (side.offer) {
    pickCard(side, aiPickCard(side, diff), rng)
    return 'card'
  }
  if (diff === 'easy' && rng() < 0.3) return null
  if (tools) {
    const k = aiSkill(side, diff, edgeRow >= 0 ? COOP_LIMIT / 2 : LIMIT)
    if (k && castSkill(side, k)) return 'skill'
  }
  // a nearly full board is worth growing before it jams
  if (tools && diff !== 'easy' && canUnlock(side) && emptySlots(side).length <= 1) {
    unlock(side)
    return 'unlock'
  }
  // invest in income when it pays back soon and nothing is burning (easy only sometimes notices)
  if (tools && (diff !== 'easy' || rng() < 0.3) && aiWantsInvest(side, diff, edgeRow >= 0 ? COOP_LIMIT / 2 : LIMIT)) {
    invest(side)
    return 'invest'
  }
  // gamble only with coins to spare (it is a slightly worse deal than plain summons)
  if (
    tools &&
    canGamble(side) &&
    side.summons >= AI_GAMBLE_AFTER &&
    (diff === 'easy' ? rng() < 0.1 : side.coins >= gamblePrice(side) * (diff === 'hard' ? 3 : 4))
  ) {
    gamble(side, rng)
    return 'gamble'
  }
  if (canSummon(side)) {
    summon(side, rng)
    return 'summon'
  }
  let pairs = findPairs(side)
  // an easy AI only sometimes notices a recipe pair
  if (diff === 'easy' && rng() < 0.7) pairs = pairs.filter(([a, b]) => !canMergeRecipe(side.units[a], side.units[b]))
  if (pairs.length) {
    let pair: [number, number]
    if (diff === 'easy') pair = pairs[Math.floor(rng() * pairs.length)]
    else {
      // merge the lowest tier first; keep wind/luck spirits when possible; hard loves recipes
      const recipeBonus = diff === 'hard' ? RECIPE_PRIORITY_HARD : RECIPE_PRIORITY_NORMAL
      const score = ([a, b]: [number, number]) => {
        const u = side.units[a]!
        if (canMergeRecipe(u, side.units[b])) return u.tier * 10 - recipeBonus
        return u.tier * 10 + (isAuraSource(u.type) || u.type === 'luck' ? 3 : 0)
      }
      pair = pairs.slice().sort((p, q) => score(p) - score(q))[0]
    }
    // put the result in the more central slot (better reach)
    const mid = (COLS - 1) / 2
    const centrality = (i: number) =>
      edgeRow >= 0
        ? -Math.abs((i % COLS) - mid) - coopRowPenalty(Math.floor(i / COLS), edgeRow)
        : -Math.abs((i % COLS) - mid) - Math.abs(Math.floor(i / COLS) - 1)
    const [a, b] = diff !== 'easy' && centrality(pair[0]) > centrality(pair[1]) ? [pair[1], pair[0]] : pair
    merge(side, a, b, rng)
    return 'merge'
  }
  if (edgeRow >= 0 && diff !== 'easy' && coopArrange(side, edgeRow)) return 'move'
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
    const cost = transformPrice(side, side.units[t]!.tier)
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
    if (ones.size > 0 && side.coins + refund >= summonPrice(side)) {
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
    aiPickOffers(g, diffs, rng)
    step(g, dt, rng)
  }
  return g
}

/** Headless co-op game with two AI partners (tests, balancing). */
export function simulateCoop(diffs: Difficulty[], rng: () => number, maxTime = 3000, dt = 1 / 20, aware = true): Game {
  const g = newGame(2, 'coop')
  const timers = diffs.map(() => 0)
  while (!g.over && g.time < maxTime) {
    diffs.forEach((d, i) => {
      timers[i] += dt
      if (timers[i] >= AI_INTERVAL[d]) {
        timers[i] = 0
        aiAct(g.sides[i], d, rng, true, aware ? COOP_EDGE_ROW[i] : -1)
      }
    })
    aiPickOffers(g, diffs, rng)
    step(g, dt, rng)
  }
  return g
}
