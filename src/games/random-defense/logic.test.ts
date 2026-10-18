import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
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
    expect(s.coins).toBe(START_COINS + 2)
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
    expect(two).toBeCloseTo(1 + auraBonus(2) * (1 + 0.85))
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
  })
  it('full AI games never end on a stuck board without having tried the tools', () => {
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const g = simulate(1, [d], mulberry32(seed * 11), 3000)
        const s = g.sides[0]
        if (isStuck(s)) expect(s.transforms + s.sold + s.unlocks, `${d} ${seed}`).toBeGreaterThan(0)
        expect(s.upg.every((l) => l <= MAX_UPGRADE)).toBe(true)
      }
  })
})
