import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  BOSS_HUNTERS,
  HP_SOFT_WAVE,
  SUMMON_COST_CAP,
  COOP_EDGE_ROW,
  COOP_H,
  COOP_HELP_SHARE,
  COOP_LIMIT,
  COOP_OFFSET,
  PATH_H,
  PATH_W,
  SHARED_LANE_Y,
  boardOffset,
  coopArrange,
  coopBoardScore,
  coopCount,
  killRewards,
  monsterPos,
  simulateCoop,
  COLS,
  AI_INTERVAL,
  BASE_SLOTS,
  BOSS_TIME,
  EXTRA_SLOTS,
  MAX_UPGRADE,
  PATH_LEN,
  UNLOCK_COSTS,
  UNLOCK_WAVES,
  canUnlock,
  isStuck,
  nextLocked,
  pairChance,
  refundOf,
  sell,
  startWave,
  transform,
  transformCost,
  unlock,
  unlockCost,
  LIMIT,
  LUCKY_CHANCE,
  MAX_TIER,
  SLOTS,
  START_COINS,
  TYPES,
  act,
  aiAct,
  AURA_CAP,
  auraBonus,
  auraInfo,
  isAuraSource,
  BLIZZARD_AURA,
  auraMults,
  canMerge,
  coinMult,
  findPairs,
  isBossWave,
  merge,
  newGame,
  pathPos,
  rollSummon,
  sentSpawns,
  simulate,
  slotAt,
  slotPos,
  step,
  spawnGap,
  SPAWN_WINDOW,
  SPAWN_GAP,
  pushFx,
  summon,
  summonCost,
  tieBreak,
  unitDamage,
  unitDps,
  upgrade,
  upgradeCost,
  waveCount,
  waveHp,
  waveSpawns,
  AWAKEN_TIER,
  CARDS,
  CARD_DISCOUNT,
  CARD_FIRE,
  CARD_FROST,
  CARD_GALE,
  CARD_GOLD,
  CARD_IDS,
  CARD_QUAKE,
  CARD_REACH,
  CARD_SLAYER,
  CARD_SWAP,
  CARD_THUNDER,
  CARD_TIME,
  CARD_VENOM,
  CURSE_TIME,
  HIDDEN_TYPES,
  MAX_ROLL_TIER,
  OFFER_SIZE,
  RECIPES,
  TIER_COLORS,
  aiPickCard,
  canMergeRecipe,
  canTransform,
  chainJumps,
  chestCoins,
  classOf,
  curseAmp,
  isHidden,
  meteorRadius,
  newDiscoveries,
  pickCard,
  rainbowBonus,
  recipeOf,
  rollOffer,
  slowAmount,
  stunChance,
  summonPrice,
  thunderRadius,
  tierMult,
  transformPrice,
  unitRange,
  BOSS_FAST,
  CALM_LIMIT,
  CALM_WAVES,
  ELITE_FAST,
  GAMBLE_MULT,
  GAMBLE_ODDS,
  METEOR_BOSS,
  METEOR_HP,
  MISSION_IDS,
  MISSION_SLOTS,
  SAME_TYPE_GOAL,
  SKILL_INFO,
  SKILL_START_CD,
  UPGRADE_STEP,
  aiSkill,
  canGamble,
  canSkill,
  castSkill,
  dailyStreams,
  dateKey,
  gamble,
  gamblePrice,
  hashSeed,
  missionReward,
  refillMissions,
  rollGamble,
  skillIndex,
  SHOT_LIFE,
  AI_PAYBACK,
  CARD_COMPOUND,
  INCOME_GOLD,
  INCOME_LUCK,
  INCOME_STEP,
  MAX_INCOME,
  PASSIVE_BASE,
  PASSIVE_WAVE,
  aiWantsInvest,
  canInvest,
  incomeMult,
  invest,
  investCost,
  investGain,
  passiveBase,
  passiveRate,
  type MissionId,
  type CardId,
  type Monster,
  type Side,
  type Unit,
  type UnitType,
} from './logic'

const unit = (type: UnitType, tier = 1, id = 0, inv = 10): Unit => ({ id, type, tier, cd: 0, flash: 0, inv })
const monster = (s: number, hp = 1000, kind: Monster['kind'] = 'normal'): Monster => ({
  id: Math.random(),
  kind,
  s,
  dist: s,
  hp,
  maxHp: hp,
  speed: 0,
  reward: 2,
  slowT: 0,
  slowF: 1,
  stunT: 0,
  poisonDps: 0,
  poisonT: 0,
  hitT: 0,
  hue: 0,
})
/** Solo game with the wave clock frozen far in the future. */
function quiet(): { g: ReturnType<typeof newGame>; s: Side } {
  const g = newGame(1)
  g.waveTimer = 1e9
  return { g, s: g.sides[0] }
}

describe('geometry', () => {
  it('path is a closed loop around the grid', () => {
    expect(PATH_LEN).toBe(22)
    expect(pathPos(0)).toEqual({ x: 0.5, y: 0.5 })
    expect(pathPos(7)).toEqual({ x: 7.5, y: 0.5 })
    expect(pathPos(11)).toEqual({ x: 7.5, y: 4.5 })
    expect(pathPos(18)).toEqual({ x: 0.5, y: 4.5 })
    expect(pathPos(22)).toEqual({ x: 0.5, y: 0.5 })
  })
  it('maps points to slots', () => {
    for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(i)
      expect(slotAt(p.x, p.y)).toBe(i)
    }
    expect(slotAt(0.5, 0.5)).toBe(-1)
    expect(slotAt(7.2, 2)).toBe(-1)
    // every slot is next to the loop path (grid is 3 rows tall)
    for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(i)
      const d = Math.min(...Array.from({ length: 220 }, (_, k) => Math.hypot(pathPos(k / 10).x - p.x, pathPos(k / 10).y - p.y)))
      expect(d).toBeLessThanOrEqual(2.01)
    }
  })
})

describe('summon', () => {
  it('rolls every type roughly uniformly with a small lucky ★2 chance', () => {
    const rng = mulberry32(7)
    const counts = new Map<string, number>()
    let lucky = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const r = rollSummon(rng)
      counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
      if (r.tier === 2) lucky++
      else expect(r.tier).toBe(1)
    }
    expect(counts.size).toBe(TYPES.length)
    for (const c of counts.values()) expect(Math.abs(c / N - 1 / TYPES.length)).toBeLessThan(0.015)
    expect(Math.abs(lucky / N - LUCKY_CHANCE)).toBeLessThan(0.01)
  })
  it('costs coins, raises the price and needs an empty slot', () => {
    const { s } = quiet()
    const rng = mulberry32(1)
    expect(summon(s, rng)).toBeGreaterThanOrEqual(0)
    expect(s.coins).toBe(START_COINS - summonCost(0))
    expect(summonCost(1)).toBeGreaterThan(summonCost(0))
    s.coins = 1e9
    for (let i = 1; i < BASE_SLOTS; i++) expect(summon(s, rng)).toBeGreaterThanOrEqual(0)
    expect(summon(s, rng)).toBe(-1) // locked slots stay empty
    for (const i of EXTRA_SLOTS) expect(s.units[i]).toBeNull()
    s.units[3] = null
    s.coins = 0
    expect(summon(s, rng)).toBe(-1)
  })
  it('stops getting pricier at the cap so late games can still grow', () => {
    expect(summonCost(500)).toBe(SUMMON_COST_CAP)
    expect(summonCost(10)).toBeLessThan(SUMMON_COST_CAP)
  })
})

describe('merge', () => {
  it('needs same type and same tier', () => {
    expect(canMerge(unit('fire', 2), unit('fire', 2))).toBe(true)
    expect(canMerge(unit('fire', 2), unit('fire', 3))).toBe(false)
    expect(canMerge(unit('fire', 2), unit('ice', 2))).toBe(false)
    expect(canMerge(unit('fire', MAX_TIER), unit('fire', MAX_TIER))).toBe(false)
    expect(canMerge(unit('fire'), null)).toBe(false)
  })
  it('turns two units into one random unit of the next tier', () => {
    const { s } = quiet()
    s.units[0] = unit('wind', 3, 1)
    s.units[7] = unit('wind', 3, 2)
    expect(merge(s, 0, 7, mulberry32(3))).toBe(true)
    expect(s.units[0]).toBeNull()
    expect(s.units[7]!.tier).toBe(4)
    expect(TYPES).toContain(s.units[7]!.type)
    expect(s.units.filter(Boolean)).toHaveLength(1)
  })
  it('act moves or swaps when a merge is impossible', () => {
    const { s } = quiet()
    const rng = mulberry32(1)
    s.units[0] = unit('fire', 1, 1)
    s.units[1] = unit('ice', 1, 2)
    expect(act(s, 0, 1, rng)).toBe('move')
    expect(s.units[0]!.type).toBe('ice')
    expect(s.units[1]!.type).toBe('fire')
    expect(act(s, 1, 9, rng)).toBe('move')
    expect(s.units[1]).toBeNull()
    expect(s.units[9]!.type).toBe('fire')
    expect(act(s, 4, 9, rng)).toBeNull()
    expect(act(s, 9, EXTRA_SLOTS[0], rng)).toBeNull() // can't move onto a locked slot
  })
  it('finds merge pairs', () => {
    const { s } = quiet()
    s.units[0] = unit('rock', 1)
    s.units[5] = unit('rock', 1)
    s.units[6] = unit('rock', 2)
    expect(findPairs(s)).toEqual([[0, 5]])
  })
})

describe('combat', () => {
  it('tier and upgrades raise damage', () => {
    const { s } = quiet()
    const a = unitDamage(unit('fire', 1), s)
    const b = unitDamage(unit('fire', 2), s)
    expect(b / a).toBeGreaterThan(2) // merging two units is always a power gain
    s.coins = 1e6
    expect(upgrade(s, 0)).toBe(true)
    expect(unitDamage(unit('fire', 1), s)).toBeCloseTo(a * 1.2)
    expect(unitDamage(unit('fire', 3), s)).toBeCloseTo(unitDamage(unit('fire', 3), quiet().s))
    expect(s.coins).toBe(1e6 - upgradeCost(0))
    expect(upgradeCost(1)).toBeGreaterThan(upgradeCost(0))
  })
  it('a unit only hits monsters in range and kills give coins', () => {
    const { g, s } = quiet()
    s.units[0] = unit('fire', 1) // slot (1.5,1.5)
    s.monsters.push(monster(1, 10)) // (1.5,0.5) — close
    s.monsters.push(monster(10, 10)) // (6.5,4.5) — far away
    step(g, 0.05, mulberry32(1))
    expect(s.monsters).toHaveLength(1)
    expect(s.monsters[0].s).toBe(10)
    expect(s.kills).toBe(1)
    expect(s.coins - s.passiveEarned).toBeCloseTo(START_COINS + 2) // (passive income ticks too)
  })
  it('thunder splashes, ice slows, poison ticks, rock can stun', () => {
    const { g, s } = quiet()
    s.units[0] = unit('thunder', 1)
    s.monsters.push(monster(1), monster(1.3), monster(5))
    step(g, 0.01, mulberry32(1))
    expect(s.monsters.map((m) => m.hp < m.maxHp)).toEqual([true, true, false])

    const q = quiet()
    q.s.units[0] = unit('ice', 2)
    q.s.units[1] = unit('poison', 1)
    q.s.monsters.push(monster(1.5))
    step(q.g, 0.01, mulberry32(1))
    const m = q.s.monsters[0]
    expect(m.slowT).toBeGreaterThan(0)
    expect(m.slowF).toBeLessThan(1)
    expect(m.poisonT).toBeGreaterThan(0)
    const hp = m.hp
    q.s.units = q.s.units.map(() => null)
    step(q.g, 1, mulberry32(1))
    expect(m.hp).toBeLessThan(hp)

    const r = quiet()
    r.s.units[0] = unit('rock', 6)
    let stunned = false
    for (let i = 0; i < 60 && !stunned; i++) {
      r.s.monsters = [monster(1, 1e12)]
      r.s.units[0]!.cd = 0
      step(r.g, 0.01, Math.random)
      stunned = r.s.monsters[0].stunT > 0
    }
    expect(stunned).toBe(true)
  })
  it('wind boosts neighbours and luck boosts coins', () => {
    const { s } = quiet()
    s.units[6] = unit('wind', 2)
    const a = auraMults(s)
    expect(a[0]).toBeGreaterThan(1)
    expect(a[12]).toBeGreaterThan(1)
    expect(a[6]).toBe(1)
    expect(a[4]).toBe(1)
    expect(coinMult(s)).toBe(1)
    s.units[0] = unit('luck', 3)
    expect(coinMult(s)).toBeCloseTo(1.36)
  })
  it('wind auras stack with diminishing returns', () => {
    const { s } = quiet()
    s.units[7] = unit('fire', 1)
    s.units[1] = unit('wind', 2) // above slot 7
    const one = auraMults(s)[7]
    expect(one).toBeCloseTo(1 + auraBonus(2))
    s.units[13] = unit('wind', 2) // below slot 7
    const two = auraMults(s)[7]
    expect(two).toBeCloseTo(1 + auraBonus(2) * (1 + 0.95))
    s.units[6] = unit('wind', 2) // left of slot 7
    const three = auraMults(s)[7]
    expect(three).toBeGreaterThan(two)
    expect(three - two).toBeLessThan(two - one) // diminishing
    expect(auraInfo(s)[7].count).toBe(3)
    // winds buff each other
    expect(auraMults(s)[1]).toBeGreaterThan(1)
    // cap
    for (let i = 0; i < 15; i++) if (i !== 7 && !s.units[i]) s.units[i] = unit('wind', 6)
    expect(auraMults(s)[7]).toBeLessThanOrEqual(1 + AURA_CAP + 1e-9)
  })
})

describe('waves', () => {
  it('get harder over time', () => {
    for (let w = 1; w < 40; w++) {
      expect(waveHp(w + 1)).toBeGreaterThan(waveHp(w))
      expect(waveCount(w + 1)).toBeGreaterThanOrEqual(waveCount(w))
    }
  })
  it('has a lone boss every 10 waves and an elite every 5', () => {
    const rng = mulberry32(1)
    expect(isBossWave(10)).toBe(true)
    expect(isBossWave(5)).toBe(false)
    const boss = waveSpawns(10, rng)
    expect(boss).toHaveLength(1)
    expect(boss[0].kind).toBe('boss')
    expect(boss[0].hp).toBeGreaterThan(waveHp(10) * 10)
    expect(waveSpawns(5, rng).filter((s) => s.kind === 'elite')).toHaveLength(1)
    expect(waveSpawns(4, rng).every((s) => s.kind === 'normal')).toBe(true)
  })
  it('grows more slowly after the soft wave', () => {
    const early = waveHp(HP_SOFT_WAVE) / waveHp(HP_SOFT_WAVE - 1)
    const late = waveHp(HP_SOFT_WAVE + 6) / waveHp(HP_SOFT_WAVE + 5)
    expect(late).toBeLessThan(early)
    expect(late).toBeGreaterThan(1)
  })
  it('single-target spirits aim at the boss first, splash spirits at the front monster', () => {
    const { g, s } = quiet()
    s.units[1] = unit('fire', 1)
    const boss = monster(1, 1e6, 'boss')
    const front = monster(2, 1e6)
    s.monsters.push(boss, front)
    step(g, 0.01, mulberry32(1))
    expect(boss.hp).toBeLessThan(1e6)
    expect(front.hp).toBe(1e6)
    expect(BOSS_HUNTERS).not.toContain('ice')
    const q = quiet()
    q.s.units[1] = unit('ice', 1)
    const b2 = monster(1, 1e6, 'boss')
    const f2 = monster(2, 1e6)
    q.s.monsters.push(b2, f2)
    step(q.g, 0.01, mulberry32(1))
    expect(f2.hp).toBeLessThan(1e6)
    expect(b2.hp).toBe(1e6)
  })
  it('spawns a wave when the timer runs out', () => {
    const g = newGame(1)
    const rng = mulberry32(1)
    for (let i = 0; i < 20 * 14; i++) step(g, 0.05, rng)
    expect(g.wave).toBe(1)
    expect(g.sides[0].monsters.length).toBe(waveCount(1))
  })
})

describe('lose conditions', () => {
  it('overflowing the field loses', () => {
    const { g, s } = quiet()
    for (let i = 0; i < LIMIT - 1; i++) s.monsters.push(monster(i % 20))
    step(g, 0.01, mulberry32(1))
    expect(g.over).toBe(false)
    s.monsters.push(monster(3))
    step(g, 0.01, mulberry32(1))
    expect(g.over).toBe(true)
    expect(s.loseReason).toBe('overflow')
  })
  it('failing the boss timer loses', () => {
    const { g, s } = quiet()
    s.bossT = BOSS_TIME
    s.monsters.push(monster(1, 1e12, 'boss'))
    for (let t = 0; t < BOSS_TIME - 1; t++) step(g, 1, mulberry32(1))
    expect(g.over).toBe(false)
    step(g, 1.5, mulberry32(1))
    expect(g.over).toBe(true)
    expect(s.loseReason).toBe('boss')
  })
  it('killing the boss clears the timer', () => {
    const { g, s } = quiet()
    s.bossT = 30
    s.units[0] = unit('fire', 6)
    s.monsters.push(monster(1, 100, 'boss'))
    step(g, 0.05, mulberry32(1))
    expect(s.bossT).toBeNull()
  })
})

describe('versus', () => {
  it('killing a boss sends monsters to the opponent', () => {
    const g = newGame(2)
    g.waveTimer = 1e9
    g.wave = 10
    g.sides[0].units[0] = unit('fire', 6)
    g.sides[0].monsters.push(monster(1, 100, 'boss'))
    g.sides[0].bossT = 30
    step(g, 0.05, mulberry32(1))
    expect(g.sides[1].queue.length).toBeGreaterThan(0)
    expect(g.sides[1].queue.every((q) => q.kind === 'sent')).toBe(true)
    expect(g.sides[0].queue).toHaveLength(0)
  })
  it('the first side to overflow loses', () => {
    const g = newGame(2)
    g.waveTimer = 1e9
    g.sides[1].queue.push(...sentSpawns(LIMIT, 1))
    for (let i = 0; i < 2000 && !g.over; i++) step(g, 0.05, mulberry32(1))
    expect(g.over).toBe(true)
    expect(g.winner).toBe(0)
  })
  it('tie-break prefers the side that hurt its boss more', () => {
    const g = newGame(2)
    const b0 = monster(1, 100, 'boss')
    b0.hp = 30
    const b1 = monster(1, 100, 'boss')
    b1.hp = 60
    g.sides[0].monsters.push(b0)
    g.sides[1].monsters.push(b1)
    expect(tieBreak(g.sides)).toBe(0)
  })
})

describe('AI', () => {
  it('summons, then merges when the board is full', () => {
    const { s } = quiet()
    const rng = mulberry32(5)
    expect(aiAct(s, 'normal', rng)).toBe('summon')
    s.coins = 0
    s.units[0] = unit('fire', 1)
    s.units[1] = unit('fire', 1)
    expect(aiAct(s, 'normal', rng)).toBe('merge')
  })
  it('survives the early game on every difficulty', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = simulate(1, [d], mulberry32(seed), 1500)
        expect(g.wave, `${d} seed ${seed}`).toBeGreaterThanOrEqual(15)
      }
    }
  })
  it('a hard AI usually beats an easy AI in versus', () => {
    let wins = 0
    for (let seed = 1; seed <= 6; seed++) if (simulate(2, ['hard', 'easy'], mulberry32(seed), 1500).winner === 0) wins++
    expect(wins).toBeGreaterThanOrEqual(4)
  })
})

/** Fills every open slot with units that can never pair (distinct type per tier). */
function jam(s: Side) {
  let k = 0
  s.units.forEach((_, i) => {
    if (!s.open[i]) return
    s.units[i] = unit(TYPES[k % TYPES.length], 1 + Math.floor(k / TYPES.length), 100 + k, 20)
    k++
  })
}

describe('sell', () => {
  it('refunds half of what went in, merges included', () => {
    const { s } = quiet()
    const rng = mulberry32(2)
    s.coins = 1e6
    const a = summon(s, rng)
    const paid = summonCost(0)
    expect(s.units[a]!.inv).toBe(paid)
    expect(refundOf(s.units[a]!)).toBe(Math.floor(paid / 2))
    // invested value adds up through merges: ★3 from four ★1s refunds half of all four
    s.units = s.units.map(() => null)
    s.units[0] = unit('fire', 1, 1, 10)
    s.units[1] = unit('fire', 1, 2, 12)
    s.units[2] = unit('ice', 1, 3, 14)
    s.units[3] = unit('ice', 1, 4, 16)
    merge(s, 0, 1, rng)
    merge(s, 2, 3, rng)
    expect(s.units[1]!.inv).toBe(22)
    expect(s.units[3]!.inv).toBe(30)
    s.units[1] = { ...s.units[1]!, type: 'rock' }
    s.units[3] = { ...s.units[3]!, type: 'rock' }
    merge(s, 1, 3, rng)
    const top = s.units[3]!
    expect(top.tier).toBe(3)
    expect(top.inv).toBe(52)
    expect(refundOf(top)).toBe(26)
    // higher ★ refunds more
    expect(refundOf(unit('fire', 4, 0, 200))).toBeGreaterThan(refundOf(top))
  })
  it('frees the slot and pays out', () => {
    const { s } = quiet()
    s.units[4] = unit('rock', 2, 1, 40)
    const before = s.coins
    expect(sell(s, 4)).toBe(20)
    expect(s.units[4]).toBeNull()
    expect(s.coins).toBe(before + 20)
    expect(s.sold).toBe(1)
    expect(sell(s, 4)).toBe(-1)
  })
  it('sell → resummon (and transform → sell) always loses coins', () => {
    const { s } = quiet()
    const rng = mulberry32(9)
    s.coins = 10000
    let last = s.coins
    for (let i = 0; i < 60; i++) {
      const slot = summon(s, rng)
      if (i % 3 === 0) transform(s, slot, rng)
      sell(s, slot)
      expect(s.coins).toBeLessThan(last)
      last = s.coins
    }
  })
})

describe('transform', () => {
  it('keeps ★, changes type and costs coins', () => {
    const { s } = quiet()
    const rng = mulberry32(4)
    s.coins = 1e6
    for (let i = 0; i < 40; i++) {
      s.units[0] = unit('fire', 3, 1, 50)
      const before = s.coins
      const cost = transformCost(3, s.transforms)
      expect(transform(s, 0, rng)).toBe(true)
      expect(s.units[0]!.tier).toBe(3)
      expect(s.units[0]!.type).not.toBe('fire')
      expect(s.coins).toBe(before - cost)
      expect(s.units[0]!.inv).toBe(50 + cost)
    }
  })
  it('costs more for higher ★ and rises with use', () => {
    expect(transformCost(1, 0)).toBe(15)
    for (let t = 1; t < MAX_TIER; t++) expect(transformCost(t + 1, 0)).toBe(2 * transformCost(t, 0))
    expect(transformCost(1, 5)).toBeGreaterThan(transformCost(1, 0))
    const { s } = quiet()
    s.units[0] = unit('fire', 2)
    s.coins = transformCost(2, 0) - 1
    expect(transform(s, 0, mulberry32(1))).toBe(false)
    expect(transform(s, 3, mulberry32(1))).toBe(false) // empty slot
  })
})

describe('slot expansion', () => {
  it('starts with the extra column locked', () => {
    const { s } = quiet()
    expect(s.open.filter(Boolean)).toHaveLength(BASE_SLOTS)
    for (const i of EXTRA_SLOTS) expect(s.open[i]).toBe(false)
  })
  it('opens one slot at each milestone wave', () => {
    const g = newGame(1)
    const rng = mulberry32(1)
    const s = g.sides[0]
    while (g.wave < UNLOCK_WAVES[UNLOCK_WAVES.length - 1] + 5) {
      startWave(g, rng)
      const expected = UNLOCK_WAVES.filter((w) => w <= g.wave).length
      expect(s.unlocks, `wave ${g.wave}`).toBe(Math.min(EXTRA_SLOTS.length, expected))
      s.queue = []
    }
    expect(s.open.every(Boolean)).toBe(true)
  })
  it('can be bought early at a rising price, never past the max', () => {
    const { s } = quiet()
    s.coins = unlockCost(0) - 1
    expect(canUnlock(s)).toBe(false)
    expect(unlock(s)).toBe(-1)
    s.coins = 1e6
    const prices: number[] = []
    for (let k = 0; k < EXTRA_SLOTS.length; k++) {
      const before = s.coins
      expect(unlock(s)).toBe(EXTRA_SLOTS[k])
      prices.push(before - s.coins)
    }
    expect(prices).toEqual(UNLOCK_COSTS)
    for (let k = 1; k < prices.length; k++) expect(prices[k]).toBeGreaterThan(prices[k - 1])
    expect(nextLocked(s)).toBe(-1)
    expect(unlock(s)).toBe(-1)
    expect(s.open.every(Boolean)).toBe(true)
    // a bought slot accepts summons
    s.coins = 1e6
    for (let i = 0; i < SLOTS; i++) summon(s, mulberry32(i))
    expect(s.units.every(Boolean)).toBe(true)
  })
  it('buying a specific locked slot and the wave milestone together still cap at the max', () => {
    const g = newGame(1)
    const s = g.sides[0]
    s.coins = 1e6
    expect(unlock(s, EXTRA_SLOTS[2])).toBe(EXTRA_SLOTS[2])
    expect(unlock(s, 0)).toBe(-1) // not a locked slot
    for (let w = 0; w < 40; w++) {
      startWave(g, mulberry32(w))
      s.queue = []
    }
    expect(s.unlocks).toBe(EXTRA_SLOTS.length)
  })
})

describe('stuck board', () => {
  it('is detected only when full with no pairs', () => {
    const { s } = quiet()
    expect(isStuck(s)).toBe(false)
    jam(s)
    expect(findPairs(s)).toHaveLength(0)
    expect(isStuck(s)).toBe(true)
    s.units[0] = null
    expect(isStuck(s)).toBe(false)
    jam(s)
    s.units[1] = { ...s.units[0]! }
    expect(isStuck(s)).toBe(false)
  })
  it('the AI rerolls, sells or opens a slot instead of only upgrading', () => {
    const { s } = quiet()
    const rng = mulberry32(3)
    jam(s)
    s.coins = 40
    expect(pairChance(s, 0)).toBeGreaterThan(0)
    const act1 = aiAct(s, 'normal', rng)
    expect(['transform', 'sell']).toContain(act1)
    // with enough coins it grows the board first
    jam(s)
    s.coins = unlockCost(s.unlocks)
    expect(aiAct(s, 'normal', rng)).toBe('unlock')
    // the old behaviour (no tools) just waits / upgrades
    const q = quiet()
    jam(q.s)
    q.s.coins = 40
    expect(aiAct(q.s, 'normal', rng, false)).toBeNull()
  })
  it('a jammed AI gets stronger and survives longer with sell / transform / slots than without', () => {
    const run = (diff: 'easy' | 'normal' | 'hard', tools: boolean, seed: number) => {
      const g = newGame(1)
      jam(g.sides[0])
      g.sides[0].coins = 60
      const rng = mulberry32(seed)
      let t = 0
      let dps = 0
      while (!g.over && g.time < 3000) {
        t += 0.05
        if (t >= AI_INTERVAL[diff]) {
          t = 0
          aiAct(g.sides[0], diff, rng, tools)
        }
        step(g, 0.05, rng)
        if (g.wave === 9 && !dps) dps = g.sides[0].units.reduce((a, u) => a + (u ? unitDps(u, g.sides[0]) : 0), 0)
      }
      return { g, dps }
    }
    let waves = [0, 0]
    let dps = [0, 0]
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (let seed = 1; seed <= 5; seed++) {
        const a = run(d, true, seed)
        const b = run(d, false, seed)
        expect(a.g.sides[0].transforms + a.g.sides[0].sold, `${d} seed ${seed}`).toBeGreaterThan(0)
        waves = [waves[0] + a.g.wave, waves[1] + b.g.wave]
        dps = [dps[0] + a.dps, dps[1] + b.dps]
      }
    expect(dps[0]).toBeGreaterThan(dps[1] * 1.15)
    expect(waves[0]).toBeGreaterThan(waves[1])
  }, 30000)
  it('full AI games never end on a stuck board without having tried the tools', () => {
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const g = simulate(1, [d], mulberry32(seed * 11), 3000)
        const s = g.sides[0]
        if (isStuck(s)) expect(s.transforms + s.sold + s.unlocks, `${d} ${seed}`).toBeGreaterThan(0)
        expect(s.upg.every((l) => l <= MAX_UPGRADE)).toBe(true)
      }
  }, 30000)
})

/** Co-op game with the wave clock frozen. */
function quietCoop() {
  const g = newGame(2, 'coop')
  g.waveTimer = 1e9
  return g
}

describe('co-op loop directions', () => {
  it('both boards reach the shared lane after one side, then walk it left to right', () => {
    const g = newGame(2, 'coop')
    const top = (s: number) => monsterPos(g, 0, { s: g.sides[0].spawnS + s, rev: g.sides[0].rev } as Monster)
    const bot = (s: number) => monsterPos(g, 1, { s: g.sides[1].spawnS + s, rev: g.sides[1].rev } as Monster)
    // start at the left edge, top going down, bottom going up
    expect(top(1).x).toBeCloseTo(0.5)
    expect(top(1).y).toBeGreaterThan(top(0).y)
    expect(bot(1).x).toBeCloseTo(0.5)
    expect(bot(1).y).toBeLessThan(bot(0).y)
    // after one side (PATH_H) both are on the shared lane, moving right in step
    for (const d of [PATH_H, PATH_H + 2, PATH_H + PATH_W]) {
      expect(top(d).y).toBeCloseTo(SHARED_LANE_Y)
      expect(bot(d).y).toBeCloseTo(SHARED_LANE_Y)
      expect(top(d).x).toBeCloseTo(bot(d).x)
    }
    expect(top(PATH_H + 2).x).toBeGreaterThan(top(PATH_H).x)
  })
})

describe('boss arrival', () => {
  it('jumps a long queue and starts its clock only when it appears', () => {
    const { g, s } = quiet()
    s.queue = Array.from({ length: 80 }, () => ({ kind: 'normal' as const, hp: 1e9, speed: 0, reward: 1, hue: 0 }))
    g.wave = 9
    startWave(g, mulberry32(1))
    expect(s.queue[0].kind).toBe('boss')
    expect(s.bossT).toBeNull()
    for (let i = 0; i < 20; i++) step(g, 0.05, mulberry32(1))
    expect(s.monsters.some((m) => m.kind === 'boss')).toBe(true)
    expect(s.bossT!).toBeGreaterThan(BOSS_TIME - 1)
  })
  it('spawns every late wave within the spawn window', () => {
    for (const w of [1, 30, 60, 100]) expect(spawnGap(w) * waveCount(w)).toBeLessThanOrEqual(Math.max(SPAWN_WINDOW, SPAWN_GAP * waveCount(w)) + 1e-9)
    expect(spawnGap(100) * waveCount(100)).toBeLessThanOrEqual(SPAWN_WINDOW + 1e-9)
  })
})

describe('effects', () => {
  it('drops a finished effect even while an older one is still showing', () => {
    const { g, s } = quiet()
    s.fx = []
    pushFx(s, { k: 'txt', x: 1, y: 1, text: 'long', color: '#fff', t: 0, life: 5 })
    pushFx(s, { k: 'boom', x: 1, y: 1, r: 1, color: '#fff', t: 0, life: 0.2 })
    step(g, 0.5, mulberry32(1))
    expect(s.fx.map((f) => f.k)).toEqual(['txt'])
  })
})

describe('blizzard aura', () => {
  it('a blizzard passes on part of the aura of the wind it was made from (one star lower)', () => {
    const a = quiet()
    a.s.units[7] = unit('blizzard', 5, 1)
    a.s.units[8] = unit('fire', 3, 2)
    const b = quiet()
    b.s.units[7] = unit('wind', 4, 1)
    b.s.units[8] = unit('fire', 3, 2)
    const boost = auraInfo(a.s)[8].mult - 1
    expect(boost).toBeGreaterThan(0)
    expect(boost).toBeCloseTo((auraInfo(b.s)[8].mult - 1) * BLIZZARD_AURA)
    expect(auraInfo(a.s)[8].count).toBe(1)
    expect(isAuraSource('blizzard')).toBe(true)
    expect(isAuraSource('ice')).toBe(false)
  })
})

describe('co-op', () => {
  it('stacks the boards so both loops share one lane', () => {
    const g = quietCoop()
    expect(g.coop).toBe(true)
    expect(g.versus).toBe(false)
    expect(boardOffset(g, 1).y).toBe(COOP_OFFSET)
    expect(COOP_H).toBe(9)
    // top board's bottom edge runs right→left, bottom board's top edge left→right: same physical points
    for (let d = 0; d <= PATH_W; d += 0.5) {
      const top = monsterPos(g, 0, monster(PATH_W + PATH_H + d))
      const bottom = monsterPos(g, 1, monster(PATH_W - d))
      expect(top.y).toBeCloseTo(SHARED_LANE_Y)
      expect(bottom.x).toBeCloseTo(top.x)
      expect(bottom.y).toBeCloseTo(top.y)
    }
    // the other edges stay apart
    expect(monsterPos(g, 0, monster(1)).y).toBeCloseTo(0.5)
    expect(monsterPos(g, 1, monster(PATH_W + PATH_H + 1)).y).toBeCloseTo(COOP_H - 0.5)
    // the bottom board spawns at its bottom-left corner, mirroring the top one
    g.sides[1].queue.push(...sentSpawns(1, 1))
    g.sides[0].queue.push(...sentSpawns(1, 1))
    step(g, 0.001, mulberry32(1))
    const t = monsterPos(g, 0, g.sides[0].monsters[0])
    expect(t.x).toBeCloseTo(0.5)
    expect(t.y).toBeCloseTo(0.5)
    const b = monsterPos(g, 1, g.sides[1].monsters[0])
    expect(b.x).toBeCloseTo(0.5)
    expect(b.y).toBeCloseTo(COOP_H - 0.5)
  })

  it("a spirit next to the shared lane hits the partner's monster there, but not far ones", () => {
    const g = quietCoop()
    const [top, bottom] = g.sides
    top.units[2 * COLS + 1] = unit('fire', 1) // top board, edge row → (2.5, 3.5)
    const near = monster(2, 1e6) // bottom board, shared lane at x = 2.5
    const far = monster(PATH_W + PATH_H + PATH_W - 2, 1e6) // bottom board, its bottom lane
    bottom.monsters.push(near, far)
    for (let i = 0; i < 20; i++) step(g, 0.05, mulberry32(1))
    expect(near.hp).toBeLessThan(1e6)
    expect(far.hp).toBe(1e6)
    // without co-op the same unit never sees the other board
    const v = newGame(2)
    v.waveTimer = 1e9
    v.sides[0].units[2 * COLS + 1] = unit('fire', 1)
    const other = monster(2, 1e6)
    v.sides[1].monsters.push(other)
    for (let i = 0; i < 20; i++) step(v, 0.05, mulberry32(1))
    expect(other.hp).toBe(1e6)
  })

  it('splits the reward of a partner-monster kill and credits the helper', () => {
    const g = quietCoop()
    expect(killRewards(g, 1, 1, 10)).toEqual([0, 10])
    expect(killRewards(g, 1, 0, 10)).toEqual([10 * COOP_HELP_SHARE, 10 * (1 - COOP_HELP_SHARE)])
    // the helper's luck boosts only the helper's share
    g.sides[0].units[0] = unit('luck', 3)
    const r = killRewards(g, 1, 0, 10)
    expect(r[0]).toBeGreaterThan(5)
    expect(r[1]).toBe(5)
    g.sides[0].units[0] = null

    const [top, bottom] = g.sides
    top.units[2 * COLS + 1] = unit('fire', 6)
    const m = monster(2, 50)
    m.reward = 10
    bottom.monsters.push(m)
    const c0 = top.coins - top.passiveEarned
    const c1 = bottom.coins - bottom.passiveEarned
    step(g, 0.05, mulberry32(1))
    expect(bottom.monsters).toHaveLength(0)
    expect(top.kills).toBe(1)
    expect(top.helped).toBe(1)
    expect(bottom.kills).toBe(0)
    expect(top.coins - top.passiveEarned - c0).toBeCloseTo(5)
    expect(bottom.coins - bottom.passiveEarned - c1).toBeCloseTo(5)
  })

  it('a partner can finish your boss and clear its timer', () => {
    const g = quietCoop()
    g.sides[1].bossT = 30
    g.sides[1].monsters.push(monster(3, 100, 'boss'))
    g.sides[0].units[2 * COLS + 2] = unit('fire', 6)
    step(g, 0.05, mulberry32(1))
    expect(g.sides[1].bossT).toBeNull()
    expect(g.sides[0].helped).toBe(1)
  })

  it('loses together on the shared monster limit', () => {
    const g = quietCoop()
    // one loop alone may go past the solo limit as long as the total is below the shared one
    for (let i = 0; i < LIMIT + 10; i++) g.sides[0].monsters.push(monster(1 + (i % 5)))
    for (let i = 0; i < COOP_LIMIT - LIMIT - 11; i++) g.sides[1].monsters.push(monster(1 + (i % 5)))
    step(g, 0.01, mulberry32(1))
    expect(coopCount(g)).toBe(COOP_LIMIT - 1)
    expect(g.over).toBe(false)
    g.sides[1].monsters.push(monster(2))
    step(g, 0.01, mulberry32(1))
    expect(g.over).toBe(true)
    expect(g.coopFail).toEqual({ reason: 'overflow', side: 0 })
    expect(g.sides.every((s) => s.lost)).toBe(true)
  })

  it("either player's boss timer running out ends it for both", () => {
    const g = quietCoop()
    g.sides[1].bossT = 1
    g.sides[1].monsters.push(monster(PATH_W + PATH_H + PATH_W, 1e12, 'boss'))
    step(g, 0.5, mulberry32(1))
    expect(g.over).toBe(false)
    step(g, 0.6, mulberry32(1))
    expect(g.over).toBe(true)
    expect(g.coopFail).toEqual({ reason: 'boss', side: 1 })
    expect(g.sides[0].lost).toBe(true)
  })

  it('makes co-op waves a bit tougher and keeps them in sync', () => {
    const g = newGame(2, 'coop')
    const solo = newGame(1)
    startWave(g, mulberry32(3))
    startWave(solo, mulberry32(3))
    expect(g.sides[0].queue.length).toBe(solo.sides[0].queue.length)
    expect(g.sides[1].queue.length).toBe(solo.sides[0].queue.length)
    expect(g.sides[0].queue[0].hp).toBeGreaterThan(solo.sides[0].queue[0].hp)
  })

  it('the co-op AI moves its strongest spirits next to the shared lane and winds beside them', () => {
    const g = quietCoop()
    const s = g.sides[0] // top board: edge row = 2
    expect(COOP_EDGE_ROW).toEqual([2, 0])
    s.units[1] = unit('fire', 4, 1) // far row
    s.units[12] = unit('ice', 1, 2) // edge row
    s.units[7] = unit('wind', 3, 3)
    const before = coopBoardScore(s, 2)
    let moves = 0
    while (coopArrange(s, 2) && moves < 20) moves++
    expect(moves).toBeGreaterThan(0)
    expect(coopBoardScore(s, 2)).toBeGreaterThan(before)
    const fire = s.units.findIndex((u) => u?.type === 'fire')
    const wind = s.units.findIndex((u) => u?.type === 'wind')
    expect(Math.floor(fire / COLS)).not.toBe(0)
    // the wind ends up touching the fire spirit
    expect(Math.abs((fire % COLS) - (wind % COLS))).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.floor(fire / COLS) - Math.floor(wind / COLS))).toBeLessThanOrEqual(1)
    // settled: no more moves
    expect(coopArrange(s, 2)).toBe(false)
  })

  it('AI partners play a full co-op game, help each other and reach a fair wave', () => {
    const waves: number[] = []
    const helped = [0, 0]
    for (let seed = 1; seed <= 6; seed++) {
      const g = simulateCoop(['hard', 'hard'], mulberry32(seed), 8000)
      expect(g.over, `seed ${seed}`).toBe(true)
      expect(g.coopFail).not.toBeNull()
      expect(g.sides[0].helped + g.sides[1].helped).toBeGreaterThan(20)
      g.sides.forEach((s, i) => (helped[i] += s.helped))
      waves.push(g.wave)
    }
    // both partners help (a strong top board can finish nearly everything in a single game)
    expect(helped.every((h) => h > 0)).toBe(true)
    const avg = waves.reduce((a, b) => a + b, 0) / waves.length
    console.log(`co-op AI+AI waves: ${waves.join(', ')} (avg ${avg.toFixed(1)})`)
    expect(avg).toBeGreaterThanOrEqual(40)
    expect(avg).toBeLessThanOrEqual(90)
  }, 60000)
})

// ---------------------------------------------------------------------------
// augment cards, hidden spirits, ★7 awakening
// ---------------------------------------------------------------------------

/** rng that always returns `v`. */
const fixed = (v: number) => () => v

describe('augment cards', () => {
  it('every card has a name, emoji, description and a stack limit', () => {
    expect(CARD_IDS.length).toBeGreaterThanOrEqual(12)
    for (const id of CARD_IDS) {
      const c = CARDS[id]
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.desc.length).toBeGreaterThan(0)
      expect(c.max).toBeGreaterThanOrEqual(1)
    }
  })
  it('offers 3 distinct cards and never a maxed one', () => {
    const { s } = quiet()
    const rng = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const o = rollOffer(s, rng)
      expect(o).toHaveLength(OFFER_SIZE)
      expect(new Set(o).size).toBe(OFFER_SIZE)
    }
    for (const id of CARD_IDS) if (id !== 'chest' && id !== 'fire') s.cards[id] = CARDS[id].max
    for (let i = 0; i < 20; i++) expect(rollOffer(s, rng).sort()).toEqual(['chest', 'fire'])
  })
  it('killing an elite or a boss opens an offer; extra offers queue up', () => {
    const { g, s } = quiet()
    s.units[0] = unit('fire', 6)
    s.monsters.push(monster(1, 10, 'elite'))
    step(g, 0.05, mulberry32(1))
    expect(s.offer).toHaveLength(3)
    expect(s.offerQueue).toBe(0)
    s.units[0]!.cd = 0
    s.bossT = 30
    s.monsters.push(monster(1, 10, 'boss'))
    step(g, 0.05, mulberry32(2))
    expect(s.bossT).toBeNull()
    expect(s.offerQueue).toBe(1)
    const first = s.offer!
    expect(pickCard(s, 'nope' as CardId, mulberry32(1))).toBe(false)
    expect(pickCard(s, first[1], mulberry32(1))).toBe(true)
    expect(s.cards[first[1]]).toBe(1)
    expect(s.offer).toHaveLength(3) // the queued one opened
    expect(s.offerQueue).toBe(0)
    expect(pickCard(s, s.offer![0], mulberry32(1))).toBe(true)
    expect(s.offer).toBeNull()
    expect(pickCard(s, 'fire', mulberry32(1))).toBe(false)
    // normal kills give no offer
    s.monsters.push(monster(1, 10))
    s.units[0]!.cd = 0
    step(g, 0.05, mulberry32(1))
    expect(s.offer).toBeNull()
  })
  it('the side that lands the kill gets the offer in co-op', () => {
    const g = quietCoop()
    g.sides[1].bossT = 30
    g.sides[1].monsters.push(monster(3, 100, 'boss'))
    g.sides[0].units[2 * COLS + 2] = unit('fire', 6)
    step(g, 0.05, mulberry32(1))
    expect(g.sides[0].offer).not.toBeNull()
    expect(g.sides[1].offer).toBeNull()
  })
  it('🔥 fire and 🏹 slayer raise damage', () => {
    const { s } = quiet()
    const base = unitDamage(unit('fire', 3), s)
    const thunder = unitDamage(unit('thunder', 3), s)
    s.cards.fire = 2
    expect(unitDamage(unit('fire', 3), s)).toBeCloseTo(base * (1 + 2 * CARD_FIRE))
    expect(unitDamage(unit('meteor', 4), s)).toBeGreaterThan(unitDamage(unit('meteor', 4), quiet().s))
    expect(unitDamage(unit('thunder', 3), s)).toBeCloseTo(thunder)
    const hitBoss = (slayer: number) => {
      const q = quiet()
      q.s.cards.slayer = slayer
      q.s.units[0] = unit('ice', 2)
      const b = monster(1, 1e6, 'boss')
      q.s.monsters.push(b)
      step(q.g, 0.01, mulberry32(1))
      return 1e6 - b.hp
    }
    expect(hitBoss(1) / hitBoss(0)).toBeCloseTo(1 + CARD_SLAYER)
  })
  it('⚡ thunder card widens the blast', () => {
    const run = (n: number) => {
      const { g, s } = quiet()
      s.cards.thunder = n
      s.units[0] = unit('thunder', 1)
      const near = monster(1) // 1.0 away from the front monster
      s.monsters.push(near, monster(2))
      step(g, 0.01, mulberry32(1))
      return near.hp < near.maxHp
    }
    expect(thunderRadius(1)).toBeLessThan(1)
    expect(thunderRadius(1) * (1 + CARD_THUNDER)).toBeGreaterThan(1)
    expect(run(0)).toBe(false)
    expect(run(1)).toBe(true)
  })
  it('❄️ frost slows harder and bosses fully', () => {
    const slowOf = (frost: number, kind: Monster['kind']) => {
      const { g, s } = quiet()
      s.cards.frost = frost
      s.units[0] = unit('ice', 2)
      const m = monster(1, 1e9, kind)
      s.monsters.push(m)
      step(g, 0.01, mulberry32(1))
      return 1 - m.slowF
    }
    expect(slowOf(0, 'boss')).toBeCloseTo(slowAmount(2) * 0.5)
    expect(slowOf(1, 'boss')).toBeCloseTo(slowAmount(2) + CARD_FROST)
    expect(slowOf(1, 'normal')).toBeGreaterThan(slowOf(0, 'normal'))
  })
  it('🪨 quake raises the stun chance', () => {
    const stuns = (quake: number) => {
      const { g, s } = quiet()
      s.cards.quake = quake
      s.units[0] = unit('rock', 1)
      const m = monster(1, 1e9)
      s.monsters.push(m)
      step(g, 0.01, fixed(stunChance(1) + CARD_QUAKE / 2))
      return m.stunT > 0
    }
    expect(stuns(0)).toBe(false)
    expect(stuns(1)).toBe(true)
  })
  it('🍄 venom doubles poison', () => {
    const dot = (venom: number) => {
      const { g, s } = quiet()
      s.cards.venom = venom
      s.units[0] = unit('poison', 2)
      const m = monster(1, 1e9)
      s.monsters.push(m)
      step(g, 0.01, mulberry32(1))
      return m.poisonDps
    }
    expect(dot(1)).toBeCloseTo(dot(0) * CARD_VENOM)
  })
  it('🍀 gold, 🌪️ gale, 🎯 reach, 💸 discount and 🔁 swap', () => {
    const { s } = quiet()
    s.units[6] = unit('wind', 2)
    s.units[0] = unit('fire', 1)
    const aura = auraMults(s)[0]
    const coins = coinMult(s)
    const range = unitRange(s.units[0]!, s)
    const price = summonPrice(s)
    const tPrice = transformPrice(s, 3)
    s.cards.gold = 1
    s.cards.gale = 2
    s.cards.reach = 1
    s.cards.discount = 1
    s.cards.swap = 1
    expect(coinMult(s)).toBeCloseTo(coins + CARD_GOLD)
    expect(auraMults(s)[0] - 1).toBeCloseTo((aura - 1) * (1 + 2 * CARD_GALE))
    expect(unitRange(s.units[0]!, s)).toBeCloseTo(range + CARD_REACH)
    expect(summonPrice(s)).toBe(Math.round(price * (1 - CARD_DISCOUNT)))
    expect(transformPrice(s, 3)).toBe(Math.round(tPrice * (1 - CARD_SWAP)))
    // the discounts are what you actually pay
    s.coins = 1000
    summon(s, mulberry32(1))
    expect(s.coins).toBe(1000 - Math.round(summonCost(0) * (1 - CARD_DISCOUNT)))
    s.coins = 1000
    s.units[1] = unit('fire', 3)
    const cost = transformPrice(s, 3)
    expect(transform(s, 1, mulberry32(1))).toBe(true)
    expect(s.coins).toBe(1000 - cost)
  })
  it('⏳ time extends the boss clock (also the running one) and 💰 chest pays at once', () => {
    const g = newGame(1)
    const s = g.sides[0]
    s.cards.time = 1
    g.wave = 9
    g.waveTimer = 1e9
    startWave(g, mulberry32(1))
    while (s.bossT == null) step(g, 0.05, mulberry32(1))
    expect(s.bossT).toBeCloseTo(BOSS_TIME + CARD_TIME, 0)
    s.bossT = BOSS_TIME + CARD_TIME
    s.offer = ['time', 'chest', 'fire']
    pickCard(s, 'time', mulberry32(1))
    expect(s.bossT).toBe(BOSS_TIME + 2 * CARD_TIME)
    const before = s.coins
    s.offer = ['chest', 'fire', 'dice']
    pickCard(s, 'chest', mulberry32(1))
    expect(s.coins).toBe(before + chestCoins(10))
    expect(chestCoins(30)).toBeGreaterThan(chestCoins(10))
  })
  it('🎲 dice can add one more ★ to a merge, but never past ★6', () => {
    const { s } = quiet()
    s.cards.dice = 1
    s.units[0] = unit('fire', 2, 1)
    s.units[1] = unit('fire', 2, 2)
    merge(s, 0, 1, fixed(0))
    expect(s.units[1]!.tier).toBe(4)
    s.units[0] = unit('ice', 4, 3)
    s.units[1] = unit('ice', 4, 4)
    merge(s, 0, 1, fixed(0))
    expect(s.units[1]!.tier).toBe(MAX_ROLL_TIER)
    s.units[0] = unit('ice', 5, 3)
    s.units[1] = unit('ice', 5, 4)
    merge(s, 0, 1, fixed(0))
    expect(s.units[1]!.tier).toBe(MAX_ROLL_TIER)
    // without the luck it is a normal +1
    s.units[0] = unit('rock', 2, 5)
    s.units[2] = unit('rock', 2, 6)
    merge(s, 0, 2, fixed(0.99))
    expect(s.units[2]!.tier).toBe(3)
  })
  it('the AI takes offers with a sensible pick', () => {
    const { s } = quiet()
    for (let i = 0; i < 6; i++) s.units[i] = unit('fire', 3, i + 1)
    s.offer = ['swap', 'fire', 'quake']
    expect(aiPickCard(s, 'hard')).toBe('fire')
    expect(aiAct(s, 'hard', mulberry32(1))).toBe('card')
    expect(s.cards.fire).toBe(1)
    expect(s.offer).toBeNull()
    s.units = s.units.map(() => null)
    for (let i = 0; i < 6; i++) s.units[i] = unit('poison', 3, i + 1)
    s.offer = ['gold', 'venom', 'quake']
    expect(aiPickCard(s, 'normal')).toBe('venom')
  })
})

describe('hidden spirits', () => {
  it('have four recipes of two different normal spirits', () => {
    expect(RECIPES).toHaveLength(4)
    expect(HIDDEN_TYPES).toHaveLength(4)
    for (const r of RECIPES) {
      expect(r.a).not.toBe(r.b)
      expect(TYPES).toContain(r.a)
      expect(TYPES).toContain(r.b)
      expect(recipeOf(r.a, r.b)).toBe(r.out)
      expect(recipeOf(r.b, r.a)).toBe(r.out)
      expect(isHidden(r.out)).toBe(true)
    }
    expect(recipeOf('fire', 'ice')).toBeNull()
    expect(recipeOf('fire', 'fire')).toBeNull()
    for (const t of HIDDEN_TYPES) expect(TYPES).not.toContain(t)
  })
  it('a recipe pair merges at the same ★ from ★3 to ★5 into the hidden spirit one ★ higher', () => {
    expect(canMergeRecipe(unit('fire', 3), unit('thunder', 3))).toBe(true)
    expect(canMerge(unit('thunder', 4), unit('fire', 4))).toBe(true)
    expect(canMergeRecipe(unit('fire', 2), unit('thunder', 2))).toBe(false)
    expect(canMergeRecipe(unit('fire', 3), unit('thunder', 4))).toBe(false)
    expect(canMergeRecipe(unit('fire', 6), unit('thunder', 6))).toBe(false)
    expect(canMergeRecipe(unit('fire', 3), unit('ice', 3))).toBe(false)
    for (const r of RECIPES) {
      const { s } = quiet()
      s.units[0] = unit(r.a, 3, 1, 40)
      s.units[1] = unit(r.b, 3, 2, 50)
      expect(act(s, 0, 1, mulberry32(1))).toBe('merge')
      expect(s.units[0]).toBeNull()
      expect(s.units[1]).toMatchObject({ type: r.out, tier: 4, inv: 90 })
      expect(s.found).toEqual([r.out])
      expect(findPairs(s)).toHaveLength(0)
    }
  })
  it('two identical hidden spirits merge into the same hidden type; a hidden + an ingredient only swaps', () => {
    const { s } = quiet()
    s.units[0] = unit('curse', 4, 1)
    s.units[1] = unit('curse', 4, 2)
    for (let seed = 0; seed < 10; seed++) {
      s.units[0] = unit('curse', 4, 1)
      s.units[1] = unit('curse', 4, 2)
      expect(merge(s, 0, 1, mulberry32(seed))).toBe(true)
      expect(s.units[1]).toMatchObject({ type: 'curse', tier: 5 })
    }
    s.units[0] = unit('rock', 5, 3)
    expect(canMerge(s.units[0], s.units[1])).toBe(false)
    expect(act(s, 0, 1, mulberry32(1))).toBe('move')
    expect(s.units[0]!.type).toBe('curse')
  })
  it('summons and transforms never make hidden spirits; hidden spirits cannot be transformed', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 2000; i++) expect(isHidden(rollSummon(rng).type)).toBe(false)
    const { s } = quiet()
    s.coins = 1e6
    s.units[0] = unit('fire', 3)
    for (let i = 0; i < 100; i++) {
      transform(s, 0, rng)
      expect(isHidden(s.units[0]!.type)).toBe(false)
    }
    s.units[1] = unit('meteor', 4)
    expect(canTransform(s, 1)).toBe(false)
    expect(transform(s, 1, rng)).toBe(false)
    expect(pairChance(s, 1)).toBe(0)
  })
  it('the codex helper lists only first-time hidden discoveries', () => {
    expect(newDiscoveries([], ['meteor', 'meteor'])).toEqual(['meteor'])
    expect(newDiscoveries(['meteor'], ['meteor', 'curse'])).toEqual(['curse'])
    expect(newDiscoveries(['meteor', 'curse'], ['fire', 'curse'])).toEqual([])
  })
  it('☄️ meteor blasts a wide area and beats a fire spirit of the same ★ on a crowd', () => {
    const crowdDamage = (type: UnitType) => {
      const { g, s } = quiet()
      s.units[1] = unit(type, 4)
      for (let k = 0; k < 6; k++) s.monsters.push(monster(1 + k * 0.4, 1e12))
      for (let i = 0; i < 100; i++) step(g, 0.05, mulberry32(i))
      return s.monsters.reduce((a, m) => a + (m.maxHp - m.hp), 0)
    }
    expect(crowdDamage('meteor')).toBeGreaterThan(1.5 * crowdDamage('fire'))
    expect(meteorRadius(4)).toBeGreaterThan(thunderRadius(4))
  })
  it('🌀 blizzard hits and slows every monster in range at once', () => {
    const { g, s } = quiet()
    s.units[1] = unit('blizzard', 4) // (2.5, 1.5)
    const ms = [monster(0.5), monster(2), monster(3.5), monster(11)]
    s.monsters.push(...ms)
    step(g, 0.01, mulberry32(1))
    expect(ms.slice(0, 3).every((m) => m.hp < m.maxHp && m.slowT > 0)).toBe(true)
    expect(ms[3].hp).toBe(ms[3].maxHp)
    // stronger than the ice spirit of the same ★ against a crowd
    const total = (type: UnitType) => {
      const q = quiet()
      q.s.units[1] = unit(type, 4)
      for (let k = 0; k < 6; k++) q.s.monsters.push(monster(1 + k * 0.5, 1e12))
      for (let i = 0; i < 100; i++) step(q.g, 0.05, mulberry32(i))
      return q.s.monsters.reduce((a, m) => a + (m.maxHp - m.hp), 0)
    }
    expect(total('blizzard')).toBeGreaterThan(1.5 * total('ice'))
  })
  it('💀 curse makes the monster take more damage from everyone', () => {
    const { g, s } = quiet()
    s.units[0] = unit('curse', 4)
    const m = monster(1, 1e9)
    s.monsters.push(m)
    step(g, 0.01, mulberry32(1))
    expect(m.curseT).toBeGreaterThan(0)
    expect(m.curseF).toBeCloseTo(curseAmp(4))
    // a fire spirit now hits harder
    s.units[0] = null
    s.units[1] = unit('fire', 1)
    const hp = m.hp
    step(g, 0.01, mulberry32(1))
    expect(hp - m.hp).toBeCloseTo(unitDamage(unit('fire', 1), s) * (1 + curseAmp(4)))
    // and it wears off
    s.units[1] = null
    step(g, CURSE_TIME + 0.1, mulberry32(1))
    expect(m.curseT).toBeLessThanOrEqual(0)
  })
  it('🌈 rainbow chains to nearby monsters and raises kill coins', () => {
    const { g, s } = quiet()
    s.units[0] = unit('rainbow', 4)
    const ms = [monster(1), monster(2), monster(3), monster(14)]
    s.monsters.push(...ms)
    step(g, 0.01, mulberry32(1))
    expect(ms.filter((m) => m.hp < m.maxHp)).toHaveLength(1 + chainJumps(4))
    expect(ms[3].hp).toBe(ms[3].maxHp)
    expect(coinMult(s)).toBeCloseTo(1 + rainbowBonus(4))
  })
  it('the AI knows recipes: hard merges a recipe pair before plain pairs', () => {
    const { s } = quiet()
    s.coins = 0
    s.units[0] = unit('fire', 3, 1)
    s.units[1] = unit('thunder', 3, 2)
    s.units[2] = unit('ice', 1, 3)
    s.units[3] = unit('ice', 1, 4)
    expect(aiAct(s, 'hard', mulberry32(1))).toBe('merge')
    expect(s.units.some((u) => u?.type === 'meteor')).toBe(true)
    expect(s.units.filter((u) => u?.type === 'ice')).toHaveLength(2)
  })
})

describe('★7 awakening', () => {
  it('only two ★6 spirits of the same type make a ★7, and it keeps the type', () => {
    expect(MAX_TIER).toBe(7)
    expect(AWAKEN_TIER).toBe(7)
    for (const t of [...TYPES, ...HIDDEN_TYPES]) {
      for (let seed = 0; seed < 5; seed++) {
        const { s } = quiet()
        s.units[0] = unit(t, 6, 1, 500)
        s.units[1] = unit(t, 6, 2, 500)
        expect(merge(s, 0, 1, mulberry32(seed))).toBe(true)
        expect(s.units[1]).toMatchObject({ type: t, tier: 7, inv: 1000 })
      }
    }
    expect(canMerge(unit('fire', 7), unit('fire', 7))).toBe(false)
    expect(canMerge(unit('fire', 6), unit('ice', 6))).toBe(false)
    expect(canMerge(unit('fire', 6), unit('thunder', 6))).toBe(false)
  })
  it('random results never reach ★7', () => {
    const { s } = quiet()
    s.cards.dice = CARDS.dice.max
    for (let seed = 0; seed < 50; seed++) {
      s.units[0] = unit('fire', 5, 1)
      s.units[1] = unit('fire', 5, 2)
      merge(s, 0, 1, mulberry32(seed))
      expect(s.units[1]!.tier).toBeLessThanOrEqual(MAX_ROLL_TIER)
      s.units[0] = unit('fire', 4, 1)
      s.units[1] = unit('thunder', 4, 2)
      merge(s, 0, 1, mulberry32(seed))
      expect(s.units[1]!.tier).toBeLessThanOrEqual(MAX_ROLL_TIER)
    }
    const rng = mulberry32(2)
    for (let i = 0; i < 1000; i++) expect(rollSummon(rng).tier).toBeLessThanOrEqual(2)
  })
  it('★7 numbers: class, aura, colour, sell; no transform', () => {
    expect(classOf(7)).toBe(2)
    expect(auraBonus(7)).toBeCloseTo(6)
    expect(auraBonus(7)).toBeGreaterThan(auraBonus(6))
    expect(TIER_COLORS[7]).toMatch(/^#/)
    expect(tierMult(7)).toBeCloseTo(2.1 * tierMult(6))
    const { s } = quiet()
    s.coins = 1e6
    s.units[0] = unit('fire', 7, 1, 1000)
    expect(canTransform(s, 0)).toBe(false)
    expect(sell(s, 0)).toBe(500)
  })
  it('an awakened spirit strikes twice: a second monster, or the same one again', () => {
    const { g, s } = quiet()
    s.units[0] = unit('fire', 7)
    const a = monster(1, 1e12)
    const b = monster(1.5, 1e12)
    s.monsters.push(a, b)
    step(g, 0.01, mulberry32(1))
    const dmg = unitDamage(s.units[0]!, s)
    expect(a.maxHp - a.hp).toBeCloseTo(dmg)
    expect(b.maxHp - b.hp).toBeCloseTo(dmg)
    const q = quiet()
    q.s.units[0] = unit('fire', 7)
    const solo = monster(1, 1e12)
    q.s.monsters.push(solo)
    step(q.g, 0.01, mulberry32(1))
    expect(solo.maxHp - solo.hp).toBeCloseTo(2 * dmg)
    // a ★6 strikes once
    const r = quiet()
    r.s.units[0] = unit('fire', 6)
    const one = monster(1, 1e12)
    r.s.monsters.push(one)
    step(r.g, 0.01, mulberry32(1))
    expect(one.maxHp - one.hp).toBeCloseTo(unitDamage(unit('fire', 6), r.s))
  })
})

// ---------------------------------------------------------------------------
// phase 2: gamble summon, missions, active skills, daily challenge
// ---------------------------------------------------------------------------

describe('🎰 gamble summon', () => {
  it('costs GAMBLE_MULT summons (with the 💸 discount) and counts as one summon', () => {
    const { s } = quiet()
    expect(gamblePrice(s)).toBe(Math.round(summonCost(0) * GAMBLE_MULT))
    s.cards.discount = 1
    expect(gamblePrice(s)).toBe(Math.round(summonPrice(s) * GAMBLE_MULT))
    s.coins = 500
    const before = s.coins
    const price = gamblePrice(s)
    const slot = gamble(s, mulberry32(4))
    expect(slot).toBeGreaterThanOrEqual(0)
    expect(s.coins).toBe(before - price)
    expect(s.summons).toBe(1)
    expect(s.gambles).toBe(1)
    expect(s.units[slot]!.inv).toBe(price)
    s.coins = gamblePrice(s) - 1
    expect(canGamble(s)).toBe(false)
    expect(gamble(s, mulberry32(1))).toBe(-1)
  })
  it('rolls ★1 40% · ★2 30% · ★3 20% · ★4 10% of normal types, a bit worse than plain summons on average', () => {
    const rng = mulberry32(11)
    const n = [0, 0, 0, 0, 0]
    const N = 20000
    for (let i = 0; i < N; i++) {
      const r = rollGamble(rng)
      expect(isHidden(r.type)).toBe(false)
      n[r.tier]++
    }
    GAMBLE_ODDS.forEach((p, k) => expect(Math.abs(n[k + 1] / N - p)).toBeLessThan(0.015))
    // value in ★1 summons (a ★t is worth 2^(t-1) of them) per summon-price paid
    const ev = GAMBLE_ODDS.reduce((a, p, k) => a + p * 2 ** k, 0) / GAMBLE_MULT
    expect(ev).toBeLessThan(1)
    expect(ev).toBeGreaterThan(0.85)
  })
  it('shows 대박 / 꽝 and a ★3+ completes the gamble mission', () => {
    const { s } = quiet()
    s.coins = 1000
    s.missions = [{ id: 'gamble3', goal: 1, progress: 0 }]
    // rng: slot, type, then tier roll 0.95 → ★4
    const seq = [0, 0, 0.95]
    gamble(s, () => seq.shift() ?? 0)
    expect(s.units.find(Boolean)!.tier).toBe(4)
    expect(s.fx.some((f) => f.text === '초대박!')).toBe(true)
    expect(s.missions[0].progress).toBe(1)
    const seq2 = [0, 0, 0.1]
    gamble(s, () => seq2.shift() ?? 0)
    expect(s.fx.some((f) => f.text === '꽝…')).toBe(true)
  })
})

describe('🎯 missions', () => {
  it('a side always has 3 distinct missions after the first step, drawn deterministically', () => {
    const a = quiet()
    const b = quiet()
    step(a.g, 0.01, mulberry32(9))
    step(b.g, 0.01, mulberry32(9))
    expect(a.s.missions).toHaveLength(MISSION_SLOTS)
    expect(new Set(a.s.missions.map((m) => m.id)).size).toBe(MISSION_SLOTS)
    expect(a.s.missions).toEqual(b.s.missions)
    expect(MISSION_IDS.length).toBeGreaterThanOrEqual(10)
  })
  it('completing a mission pays wave-scaled coins and draws a new one', () => {
    const { g, s } = quiet()
    s.wave = 12
    s.missions = [
      { id: 'hidden', goal: 1, progress: 0 },
      { id: 'star5', goal: 1, progress: 0 },
      { id: 'gamble3', goal: 1, progress: 0 },
    ]
    s.units[0] = unit('fire', 3, 1)
    s.units[1] = unit('thunder', 3, 2)
    merge(s, 0, 1, mulberry32(1))
    const before = s.coins - s.passiveEarned
    step(g, 0.01, mulberry32(2))
    expect(s.coins - s.passiveEarned).toBeCloseTo(before + missionReward(12))
    expect(s.missionsDone).toBe(1)
    expect(s.missions).toHaveLength(MISSION_SLOTS)
    expect(s.missions.filter((m) => m.id === 'hidden')).toHaveLength(0)
    expect(missionReward(30)).toBeGreaterThan(missionReward(10))
  })
  const run = (id: MissionId, setup: (q: ReturnType<typeof quiet>) => void, goal = 1) => {
    const q = quiet()
    q.s.missions = [{ id, goal, progress: 0 }]
    setup(q)
    step(q.g, 0.01, mulberry32(1))
    return q.s.missionsDone
  }
  it('★5, fast elite / boss kills', () => {
    expect(
      run('star5', ({ s }) => {
        s.units[0] = unit('ice', 4, 1)
        s.units[1] = unit('ice', 4, 2)
        merge(s, 0, 1, mulberry32(1))
      }),
    ).toBe(1)
    const killFast = (kind: 'elite' | 'boss', age: number) =>
      run(kind === 'elite' ? 'eliteFast' : 'bossFast', ({ s }) => {
        s.units[0] = unit('fire', 7)
        const m = monster(1, 10, kind)
        m.age = age
        s.monsters.push(m)
        if (kind === 'boss') s.bossT = 10
      })
    expect(killFast('elite', ELITE_FAST - 5)).toBe(1)
    expect(killFast('elite', ELITE_FAST + 5)).toBe(0)
    expect(killFast('boss', BOSS_FAST - 5)).toBe(1)
    expect(killFast('boss', BOSS_FAST + 5)).toBe(0)
  })
  it('wave kills, same type, stacked winds, upgrades', () => {
    expect(run('waveKills', ({ s }) => (s.waveKills = 12), 12)).toBe(1)
    expect(run('waveKills', ({ s }) => (s.waveKills = 11), 12)).toBe(0)
    expect(
      run('sameType', ({ s }) => [0, 3, 8, 12].forEach((i, k) => (s.units[i] = unit('rock', 1 + (k % 3), k + 1))), SAME_TYPE_GOAL),
    ).toBe(1)
    expect(
      run(
        'wind2',
        ({ s }) => {
          s.units[7] = unit('fire', 1)
          s.units[1] = unit('wind', 1)
          s.units[13] = unit('wind', 1)
        },
        2,
      ),
    ).toBe(1)
    expect(run('upgrades', ({ s }) => (s.upg = [2, 1, 0]), 3)).toBe(1)
    expect(run('upgrades', ({ s }) => (s.upg = [1, 1, 0]), 3)).toBe(0)
    // a fresh upgrades mission asks for a few more levels than you have
    const { s } = quiet()
    s.upg = [4, 2, 0]
    s.missions = []
    while (s.missions.every((m) => m.id !== 'upgrades')) {
      s.missions = []
      refillMissions(s, Math.random)
    }
    expect(s.missions.find((m) => m.id === 'upgrades')!.goal).toBe(6 + UPGRADE_STEP)
  })
  it('calm starts count consecutive waves begun with few monsters', () => {
    const g = newGame(1)
    const s = g.sides[0]
    s.missions = [{ id: 'calmStart', goal: CALM_WAVES, progress: 0 }]
    const rng = mulberry32(1)
    startWave(g, rng)
    s.queue = []
    expect(s.missions[0].progress).toBe(1)
    for (let i = 0; i <= CALM_LIMIT; i++) s.monsters.push(monster(i % 20))
    startWave(g, rng)
    s.queue = []
    expect(s.missions[0].progress).toBe(0)
    s.monsters = []
    for (let k = 0; k < CALM_WAVES; k++) {
      startWave(g, rng)
      s.queue = []
    }
    expect(s.missions[0].progress).toBe(CALM_WAVES)
  })
})

describe('⚡ skills', () => {
  it('start on cooldown, then are free to use and go on their own cooldown', () => {
    const { g, s } = quiet()
    expect(canSkill(s, 'meteor')).toBe(false)
    expect(castSkill(s, 'meteor')).toBe(false)
    for (let t = 0; t < SKILL_START_CD; t += 1) step(g, 1, mulberry32(1))
    step(g, 0.1, mulberry32(1))
    expect(canSkill(s, 'meteor')).toBe(true)
    expect(canSkill(s, 'freeze')).toBe(true)
    const coins = s.coins
    expect(castSkill(s, 'meteor')).toBe(true)
    expect(s.coins).toBe(coins)
    expect(s.skillCd[skillIndex('meteor')]).toBe(SKILL_INFO.meteor.cd)
    expect(canSkill(s, 'meteor')).toBe(false)
    expect(SKILL_INFO.freeze.cd).toBeGreaterThan(SKILL_INFO.meteor.cd)
  })
  it('💥 meteor hits every monster on the own loop (bosses a share of max HP)', () => {
    const g = quietCoop()
    const [a, b] = g.sides
    a.skillCd = [0, 0]
    a.wave = 20
    const ms = [monster(1, 1e9), monster(9, 1e9, 'elite'), monster(15, 1e9)]
    const boss = monster(5, 1e6, 'boss')
    a.monsters.push(...ms, boss)
    const other = monster(PATH_W + PATH_H + 2, 1e9) // a's shared lane, but b's monster
    b.monsters.push(other)
    expect(castSkill(a, 'meteor')).toBe(true)
    for (const m of ms) expect(m.maxHp - m.hp).toBeCloseTo(waveHp(20) * METEOR_HP)
    expect(boss.maxHp - boss.hp).toBeCloseTo(1e6 * METEOR_BOSS)
    expect(other.hp).toBe(other.maxHp)
    // it kills weak monsters and pays for them
    const { g: g2, s } = quiet()
    s.skillCd = [0, 0]
    s.wave = 5
    s.monsters.push(monster(3, waveHp(5)), monster(6, waveHp(5)))
    castSkill(s, 'meteor')
    step(g2, 0.01, mulberry32(1))
    expect(s.monsters).toHaveLength(0)
    expect(s.kills).toBe(2)
  })
  it('⏸️ freeze stops the own monsters and the boss clock for a few seconds', () => {
    const { g, s } = quiet()
    s.skillCd = [0, 0]
    const m = monster(3, 1e9)
    m.speed = 2
    s.monsters.push(m)
    s.bossT = 30
    castSkill(s, 'freeze')
    for (let i = 0; i < 30; i++) step(g, 0.1, mulberry32(1))
    expect(m.s).toBe(3)
    expect(s.bossT).toBe(30)
    for (let i = 0; i < 20; i++) step(g, 0.1, mulberry32(1))
    expect(m.s).toBeGreaterThan(3)
    expect(s.bossT).toBeLessThan(30)
    expect(s.freezeT).toBe(0)
  })
  it('the AI fires meteor on a crowded loop and freeze when the boss clock is nearly out', () => {
    const { s } = quiet()
    s.skillCd = [0, 0]
    for (let i = 0; i < 0.65 * LIMIT; i++) s.monsters.push(monster(i % 20, 1e9))
    expect(aiSkill(s, 'hard', LIMIT)).toBe('meteor')
    expect(aiAct(s, 'hard', mulberry32(1))).toBe('skill')
    expect(canSkill(s, 'meteor')).toBe(false)
    const q = quiet()
    q.s.skillCd = [0, 0]
    q.s.bossT = 5
    q.s.monsters.push(monster(2, 1e12, 'boss'))
    expect(aiSkill(q.s, 'hard', LIMIT)).toBe('freeze')
    const r = quiet()
    r.s.skillCd = [0, 0]
    r.s.monsters.push(monster(2, 1e9))
    expect(aiSkill(r.s, 'hard', LIMIT)).toBeNull()
  })
})

describe('🌅 daily challenge', () => {
  it('dates map to stable seeds and streams', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(hashSeed('a')).toBe(hashSeed('a'))
    expect(hashSeed('2026-10-19')).not.toBe(hashSeed('2026-10-20'))
    const a = dailyStreams('2026-10-19')
    const b = dailyStreams('2026-10-19')
    const c = dailyStreams('2026-10-20')
    const seq = (r: () => number) => Array.from({ length: 5 }, r)
    expect(seq(a.summon)).toEqual(seq(b.summon))
    expect(seq(a.card)).not.toEqual(seq(c.card))
    expect(seq(a.card)).not.toEqual(seq(a.mission))
  })
  it('the n-th summon, card offer and mission are the same however the game is played', () => {
    const play = (combatSeed: number, waitBefore: number) => {
      const g = newGame(1)
      g.streams = dailyStreams('2026-10-19')
      g.waveTimer = 1e9
      const s = g.sides[0]
      const combat = mulberry32(combatSeed)
      for (let i = 0; i < waitBefore; i++) step(g, 0.05, combat)
      s.coins = 1e6
      const summons = Array.from({ length: 6 }, () => {
        const slot = summon(s, g.streams!.summon)
        return `${s.units[slot]!.type}${s.units[slot]!.tier}`
      })
      s.units = s.units.map(() => null)
      s.units[0] = unit('fire', 7)
      s.monsters.push(monster(1, 10, 'elite'))
      step(g, 0.05, combat)
      return { summons, offer: s.offer, missions: s.missions.map((m) => m.id) }
    }
    const a = play(1, 3)
    const b = play(99, 40)
    expect(a.summons).toEqual(b.summons)
    expect(a.offer).toEqual(b.offer)
    expect(a.missions).toEqual(b.missions)
  })
})

describe('pop-ups', () => {
  it('back-to-back card picks queue their names instead of overlapping', () => {
    const { s } = quiet()
    s.offer = ['fire', 'dice', 'gold']
    s.offerQueue = 1
    pickCard(s, 'fire', mulberry32(1))
    pickCard(s, s.offer![0], mulberry32(1))
    const pops = s.fx.filter((f) => f.tag === 'pop')
    expect(pops).toHaveLength(2)
    expect(pops[0].t).toBeCloseTo(0)
    expect(pops[1].t).toBeCloseTo(-pops[0].life)
  })
})

describe('attack visuals data', () => {
  it('every attack fx names its spirit type and ★ with a per-type lifetime', () => {
    for (const t of [...TYPES, 'meteor', 'curse', 'rainbow'] as UnitType[]) {
      const { g, s } = quiet()
      s.units[0] = unit(t, 4)
      s.monsters.push(monster(1, 1e9))
      step(g, 0.01, mulberry32(1))
      const shot = s.fx.find((f) => f.k === 'shot')!
      expect(shot, t).toBeDefined()
      expect(shot.src).toBe(t)
      expect(shot.tier).toBe(4)
      expect(shot.life).toBe(SHOT_LIFE[t])
      expect(s.monsters[0].lastHit).toBe(t)
    }
  })
  it('thunder hits crackle and lucky kills show their coins', () => {
    const { g, s } = quiet()
    s.units[0] = unit('thunder', 1)
    const m = monster(1, 1e9)
    s.monsters.push(m)
    step(g, 0.01, mulberry32(1))
    expect(m.zapT).toBeGreaterThan(0)
    const q = quiet()
    q.s.units[0] = unit('luck', 3)
    const weak = monster(1, 1)
    weak.reward = 10
    q.s.monsters.push(weak)
    step(q.g, 0.01, mulberry32(1))
    expect(q.s.fx.some((f) => f.k === 'txt' && f.text === `+${Math.floor(10 * coinMult(q.s))}🪙`)).toBe(true)
  })
})

describe('💰 passive income and 💹 investment', () => {
  it('coins tick up every step, scaled by dt, the wave and coinRate', () => {
    const { g, s } = quiet()
    const c0 = s.coins
    step(g, 1, mulberry32(1))
    expect(s.coins - c0).toBeCloseTo(passiveBase(0))
    const a = quiet()
    step(a.g, 0.5, mulberry32(1))
    step(a.g, 0.5, mulberry32(1))
    expect(a.s.coins - c0).toBeCloseTo(passiveBase(0))
    s.wave = 20
    expect(passiveRate(s)).toBeCloseTo(PASSIVE_BASE + PASSIVE_WAVE * 20)
    s.coinRate = 1.25
    expect(passiveRate(s)).toBeCloseTo(1.25 * passiveBase(20))
    expect(s.passiveEarned).toBeCloseTo(passiveBase(0))
    // no step (paused, or the solo card picker holding the game) → no income
    const before = s.coins
    s.offer = ['fire', 'gold', 'dice']
    expect(s.coins).toBe(before)
    // a fallen side earns nothing
    s.lost = true
    const lostCoins = s.coins
    step(g, 1, mulberry32(1))
    expect(s.coins).toBe(lostCoins)
  })
  it('kill coins are counted apart from passive coins', () => {
    const { g, s } = quiet()
    s.units[0] = unit('fire', 6)
    s.monsters.push(monster(1, 10))
    step(g, 0.05, mulberry32(1))
    expect(s.killEarned).toBe(2)
  })
  it('each investment level adds INCOME_STEP of the base rate, costs more each time and stops at the max', () => {
    const { s } = quiet()
    s.wave = 10
    expect(investCost(1)).toBeGreaterThan(investCost(0))
    expect(canInvest(s)).toBe(investCost(0) <= s.coins)
    s.coins = investCost(0) - 1
    expect(invest(s)).toBe(false)
    s.coins = 1e7
    const r0 = passiveRate(s)
    const gain = investGain(s)
    expect(invest(s)).toBe(true)
    expect(s.incomeLvl).toBe(1)
    expect(passiveRate(s) - r0).toBeCloseTo(gain)
    expect(gain).toBeCloseTo(INCOME_STEP * passiveBase(10))
    let paid = 0
    while (canInvest(s)) {
      paid += investCost(s.incomeLvl)
      invest(s)
    }
    expect(s.incomeLvl).toBe(MAX_INCOME)
    expect(invest(s)).toBe(false)
    expect(paid).toBeGreaterThan(0)
  })
  it('🍀 luck spirits, 🍀 황금손 and 💹 복리 boost passive income', () => {
    const { s } = quiet()
    const base = incomeMult(s)
    s.units[0] = unit('luck', 3)
    expect(incomeMult(s)).toBeCloseTo(base + INCOME_LUCK * 3)
    s.cards.gold = 1
    s.cards.compound = 2
    expect(incomeMult(s)).toBeCloseTo(base + INCOME_LUCK * 3 + INCOME_GOLD + 2 * CARD_COMPOUND)
    expect(CARDS.compound.max).toBe(2)
  })
  it('the AI invests when a level pays back soon and the field is calm', () => {
    const { s } = quiet()
    s.wave = 20
    s.coins = investCost(0)
    s.units[0] = unit('fire', 1) // no summon slot issue: keep coins below a summon after investing
    expect(aiWantsInvest(s, 'hard', LIMIT)).toBe(investCost(0) / investGain(s) <= AI_PAYBACK.hard)
    expect(aiWantsInvest(s, 'hard', LIMIT)).toBe(true)
    expect(aiAct(s, 'hard', mulberry32(1))).toBe('invest')
    expect(s.incomeLvl).toBe(1)
    // not while crowded or during a boss
    const q = quiet()
    q.s.wave = 20
    q.s.coins = 1e6
    for (let i = 0; i < 0.5 * LIMIT; i++) q.s.monsters.push(monster(i % 20, 1e9))
    expect(aiWantsInvest(q.s, 'hard', LIMIT)).toBe(false)
    q.s.monsters = []
    q.s.bossT = 30
    expect(aiWantsInvest(q.s, 'hard', LIMIT)).toBe(false)
    // early on (low base rate) a level does not pay back yet
    const e = quiet()
    e.s.coins = investCost(0)
    expect(aiWantsInvest(e.s, 'hard', LIMIT)).toBe(false)
  })
  it('the 💹 invest mission asks for two more levels', () => {
    const { g, s } = quiet()
    s.incomeLvl = 3
    s.missions = []
    while (s.missions.every((m) => m.id !== 'invest')) {
      s.missions = []
      refillMissions(s, Math.random)
    }
    const m = s.missions.find((x) => x.id === 'invest')!
    expect(m.goal).toBe(5)
    s.missions = [m]
    s.incomeLvl = 5
    step(g, 0.01, mulberry32(1))
    expect(s.missionsDone).toBe(1)
  })
})
