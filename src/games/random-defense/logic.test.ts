import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  BOSS_TIME,
  LIMIT,
  LUCKY_CHANCE,
  MAX_TIER,
  SLOTS,
  START_COINS,
  TYPES,
  act,
  aiAct,
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

const unit = (type: UnitType, tier = 1, id = 0): Unit => ({ id, type, tier, cd: 0, flash: 0 })
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
    expect(pathPos(0)).toEqual({ x: 0.5, y: 0.5 })
    expect(pathPos(6)).toEqual({ x: 6.5, y: 0.5 })
    expect(pathPos(10)).toEqual({ x: 6.5, y: 4.5 })
    expect(pathPos(16)).toEqual({ x: 0.5, y: 4.5 })
    expect(pathPos(20)).toEqual({ x: 0.5, y: 0.5 })
  })
  it('maps points to slots', () => {
    for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(i)
      expect(slotAt(p.x, p.y)).toBe(i)
    }
    expect(slotAt(0.5, 0.5)).toBe(-1)
    expect(slotAt(6.2, 2)).toBe(-1)
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
    for (let i = 1; i < SLOTS; i++) expect(summon(s, rng)).toBeGreaterThanOrEqual(0)
    expect(summon(s, rng)).toBe(-1)
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
