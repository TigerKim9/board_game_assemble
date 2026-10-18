import { describe, expect, it } from 'vitest'
import {
  BOOST_MAX,
  COMBO_WINDOW,
  MAX_SHIPS,
  MAX_SPEED_LV,
  OFFLINE_CAP,
  OFFLINE_RATE,
  PRESTIGE_MIN,
  SHAPES,
  applyOffline,
  buy,
  bulkCost,
  canSupernova,
  formatDuration,
  formatKo,
  globalMult,
  incomePerSec,
  jitter,
  lapBonus,
  maxAffordable,
  milestoneMult,
  newGame,
  normalize,
  offlineEarnings,
  quote,
  serialize,
  shapeIncome,
  stardustGain,
  step,
  supernova,
  tapBoost,
  unlock,
  vertexValue,
  type OrbitEvent,
  type OrbitState,
  type UpgradeKind,
} from './logic'

const clone = (s: OrbitState) => normalize(JSON.parse(JSON.stringify(serialize(s))))

describe('formatKo', () => {
  it('formats small numbers with commas', () => {
    expect(formatKo(0)).toBe('0')
    expect(formatKo(7.9)).toBe('7')
    expect(formatKo(9999)).toBe('9,999')
  })
  it('uses Korean myriad units', () => {
    expect(formatKo(12345)).toBe('1.23만')
    expect(formatKo(10000)).toBe('1만')
    expect(formatKo(123456)).toBe('12.3만')
    expect(formatKo(1234567)).toBe('123만')
    expect(formatKo(12345678)).toBe('1,234만')
    expect(formatKo(99999999)).toBe('9,999만')
    expect(formatKo(1.23e8)).toBe('1.23억')
    expect(formatKo(4.5e12)).toBe('4.5조')
    expect(formatKo(7e16)).toBe('7경')
    expect(formatKo(3.21e20)).toBe('3.21해')
    expect(formatKo(-12345)).toBe('-1.23만')
    expect(formatKo(Infinity)).toBe('∞')
  })
  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42초')
    expect(formatDuration(600)).toBe('10분')
    expect(formatDuration(3 * 3600 + 120)).toBe('3시간 2분')
  })
})

describe('costs', () => {
  it('grows geometrically and bulk cost equals the sum of single costs', () => {
    let sum = 0
    for (let n = 0; n < 10; n++) sum += 10 * Math.pow(1.15, 3 + n)
    expect(bulkCost(10, 1.15, 3, 10)).toBeCloseTo(sum, 6)
    expect(bulkCost(10, 1.15, 3, 0)).toBe(0)
  })
  it('maxAffordable finds the largest count that fits', () => {
    const n = maxAffordable(10, 1.15, 0, 1000)
    expect(bulkCost(10, 1.15, 0, n)).toBeLessThanOrEqual(1000)
    expect(bulkCost(10, 1.15, 0, n + 1)).toBeGreaterThan(1000)
    expect(maxAffordable(10, 1.15, 0, 5)).toBe(0)
    expect(maxAffordable(10, 1.15, 0, 1e30, 7)).toBe(7)
  })
  it('ship purchases get more expensive and respect x10 / max', () => {
    const s = newGame()
    s.coins = 1e6
    const q1 = quote(s, 0, 'ships', 1)
    expect(q1.cost).toBe(SHAPES[0].shipCost)
    expect(buy(s, 0, 'ships', 1)).toBe(1)
    expect(quote(s, 0, 'ships', 1).cost).toBeGreaterThan(q1.cost)
    expect(buy(s, 0, 'ships', 10)).toBe(10)
    expect(s.shapes[0].ships).toBe(12)
    expect(s.shapes[0].phases).toHaveLength(12)
    const before = s.coins
    const m = buy(s, 0, 'ships', 'max')
    expect(m).toBeGreaterThan(0)
    expect(s.coins).toBeGreaterThanOrEqual(0)
    expect(s.coins).toBeLessThan(before)
    expect(quote(s, 0, 'ships', 1).affordable).toBe(false)
  })
  it('refuses unaffordable purchases and caps levels', () => {
    const s = newGame()
    expect(buy(s, 0, 'speed')).toBe(0)
    s.coins = 1e40
    expect(buy(s, 0, 'speed', 'max')).toBe(MAX_SPEED_LV)
    expect(quote(s, 0, 'speed', 1).count).toBe(0)
    expect(buy(s, 0, 'ships', 'max')).toBe(MAX_SHIPS - 1)
    expect(buy(s, 0, 'ships', 1)).toBe(0)
  })
  it('milestones double income', () => {
    expect(milestoneMult(24)).toBe(1)
    expect(milestoneMult(25)).toBe(2)
    expect(milestoneMult(50)).toBe(4)
    expect(milestoneMult(200)).toBe(32)
  })
  it('unlocks shapes in order', () => {
    const s = newGame()
    expect(unlock(s)).toBe(false)
    s.coins = SHAPES[1].unlock
    expect(unlock(s)).toBe(true)
    expect(s.coins).toBe(0)
    expect(s.shapes).toHaveLength(2)
    s.coins = 1e30
    while (unlock(s));
    expect(s.shapes).toHaveLength(SHAPES.length)
  })
})

describe('step', () => {
  it('pays for each vertex passed and the lap bonus', () => {
    const s = newGame()
    s.shapes[0].phases[0] = 0.3 // just before vertex 1 of a triangle (at 1/3)
    const ev: OrbitEvent[] = []
    step(s, 0.2, ev)
    expect(ev).toHaveLength(1)
    expect(ev[0].vertex).toBe(1)
    expect(ev[0].lap).toBe(false)
    expect(s.coins).toBeCloseTo(vertexValue(s, 0))
    s.shapes[0].phases[0] = 0.99
    ev.length = 0
    step(s, 0.1, ev)
    expect(ev[0].vertex).toBe(0)
    expect(ev[0].lap).toBe(true)
    expect(s.coins).toBeCloseTo(2 * vertexValue(s, 0) + lapBonus(s, 0))
  })
  it('handles many passes in one large dt exactly', () => {
    const s = newGame()
    s.shapes[0].phases[0] = 0
    const speed = (1 / SHAPES[0].lap) * jitter(0)
    const t = SHAPES[0].lap * 10 // ~9.5 laps
    step(s, t)
    const travelled = speed * t
    const passes = Math.floor(travelled * 3)
    const laps = Math.floor(travelled)
    expect(s.coins).toBeCloseTo(passes * vertexValue(s, 0) + laps * lapBonus(s, 0), 6)
    expect(s.shapes[0].phases[0]).toBeCloseTo(travelled - laps, 6)
  })
  it('large dt matches many small steps (no combos)', () => {
    const a = newGame()
    a.coins = 1e9
    buy(a, 0, 'speed', 3)
    buy(a, 0, 'value', 2)
    const b = clone(a)
    step(a, 50)
    // small steps on a single ship to avoid combo bonuses
    for (let i = 0; i < 5000; i++) step(b, 0.01)
    expect(b.coins).toBeCloseTo(a.coins, 3)
  })
  it('long-run average matches incomePerSec', () => {
    const s = newGame()
    s.coins = 1e9
    buy(s, 0, 'ships', 4)
    unlock(s)
    const startCoins = s.coins
    const rate = incomePerSec(s)
    step(s, 1000)
    expect((s.coins - startCoins) / 1000).toBeCloseTo(rate, -1)
    expect(Math.abs((s.coins - startCoins) / 1000 / rate - 1)).toBeLessThan(0.02)
  })
  it('gives a combo when two ships cross the same vertex together', () => {
    const s = newGame()
    s.coins = 1e6
    buy(s, 0, 'ships', 1)
    s.coins = 0
    s.shapes[0].phases = [0.32, 0.325]
    const ev: OrbitEvent[] = []
    step(s, 0.1, ev)
    expect(ev).toHaveLength(2)
    expect(ev[0].combo).toBe(1)
    expect(ev[1].combo).toBe(2)
    expect(s.coins).toBeCloseTo(3 * vertexValue(s, 0))
    // far apart → no combo
    s.shapes[0].phases = [0.32, 0.2]
    ev.length = 0
    step(s, COMBO_WINDOW + 0.05, ev)
    for (let i = 0; i < 60; i++) step(s, 0.05, ev)
    expect(ev.every((e) => e.combo === 1)).toBe(true)
  })
  it('tap boost doubles speed and is capped', () => {
    const a = newGame()
    const b = newGame()
    tapBoost(b)
    tapBoost(b)
    expect(b.boost).toBeCloseTo(1)
    for (let i = 0; i < 100; i++) tapBoost(b)
    expect(b.boost).toBe(BOOST_MAX)
    b.boost = 1
    step(a, 1)
    step(b, 1)
    expect(b.shapes[0].phases[0] - b.shapes[0].phases[0]).toBe(0)
    const da = a.shapes[0].phases[0] - 0.0001
    const db = b.shapes[0].phases[0] - 0.0001
    expect(db).toBeCloseTo(da * 2, 6)
    expect(b.boost).toBe(0)
  })
})

describe('offline earnings', () => {
  it('pays a reduced rate and caps at 8 hours', () => {
    const s = newGame()
    const r = incomePerSec(s)
    expect(offlineEarnings(s, 100).coins).toBeCloseTo(r * OFFLINE_RATE * 100)
    expect(offlineEarnings(s, OFFLINE_CAP * 3).coins).toBeCloseTo(r * OFFLINE_RATE * OFFLINE_CAP)
    expect(offlineEarnings(s, OFFLINE_CAP * 3).seconds).toBe(OFFLINE_CAP)
    expect(offlineEarnings(s, -5).coins).toBe(0)
    const got = applyOffline(s, 3600)
    expect(s.coins).toBeCloseTo(got)
    expect(s.runEarned).toBeCloseTo(got)
  })
})

describe('supernova', () => {
  it('needs the threshold and grows with the cube root of earnings', () => {
    expect(stardustGain(PRESTIGE_MIN - 1)).toBe(0)
    expect(stardustGain(PRESTIGE_MIN)).toBe(5)
    expect(stardustGain(PRESTIGE_MIN * 8)).toBe(10)
    expect(stardustGain(PRESTIGE_MIN * 1000)).toBe(50)
  })
  it('resets the run but keeps stardust, which multiplies income', () => {
    const s = newGame()
    expect(canSupernova(s)).toBe(false)
    expect(supernova(s)).toBe(s)
    s.coins = 1e12
    unlock(s)
    buy(s, 0, 'ships', 10)
    s.runEarned = PRESTIGE_MIN * 8
    s.totalEarned = PRESTIGE_MIN * 5
    const n = supernova(s)
    expect(n.stardust).toBe(10)
    expect(n.supernovas).toBe(1)
    expect(n.coins).toBe(0)
    expect(n.runEarned).toBe(0)
    expect(n.totalEarned).toBe(PRESTIGE_MIN * 5)
    expect(n.shapes).toHaveLength(1)
    expect(n.shapes[0].ships).toBe(1)
    expect(globalMult(n)).toBeCloseTo(2)
    expect(incomePerSec(n)).toBeCloseTo(incomePerSec(newGame()) * 2)
  })
})

describe('save / load', () => {
  it('round-trips and repairs bad data', () => {
    const s = newGame()
    s.coins = 1e6
    buy(s, 0, 'ships', 5)
    unlock(s)
    const r = clone(s)
    expect(r.shapes).toHaveLength(2)
    expect(r.shapes[0].ships).toBe(6)
    expect(r.coins).toBe(s.coins)
    const bad = normalize({ coins: -3, shapes: [{ ships: 'x', phases: [NaN] }], stardust: NaN })
    expect(bad.coins).toBe(0)
    expect(bad.stardust).toBe(0)
    expect(bad.shapes[0].ships).toBe(1)
    expect(Number.isFinite(bad.shapes[0].phases[0])).toBe(true)
    expect(normalize(null).shapes).toHaveLength(1)
  })
})

describe('pacing', () => {
  /** Greedy "reasonable player": buys whatever pays back fastest, checking every 0.5s. */
  function simulate(minutes: number, log = false) {
    const s = newGame()
    const marks: Record<string, number> = {}
    const kinds: UpgradeKind[] = ['ships', 'speed', 'value']
    let firstBuy: number | null = null
    const dt = 0.05
    let check = 0
    for (let t = 0; t < minutes * 60; t += dt) {
      step(s, dt)
      check -= dt
      if (check > 0) continue
      check = 0.5
      // real players unlock a new shape as soon as they can
      const n0 = s.shapes.length
      if (unlock(s)) marks[SHAPES[n0].name] = t
      for (let guard = 0; guard < 50; guard++) {
        const base = incomePerSec(s)
        let best: { score: number; cost: number; run: (x: OrbitState) => void } | null = null
        const consider = (cost: number, run: (x: OrbitState) => void) => {
          const c = clone(s)
          c.coins = Infinity
          run(c)
          const gain = incomePerSec(c) - base
          if (gain <= 0) return
          // payback time + time to save up
          const score = cost / gain + Math.max(0, cost - s.coins) / base
          if (!best || score < best.score) best = { score, cost, run }
        }
        for (let i = 0; i < s.shapes.length; i++)
          for (const k of kinds) {
            const q = quote(s, i, k, 1)
            if (q.count) consider(q.cost, (x) => buy(x, i, k, 1))
          }
        const nx = SHAPES[s.shapes.length]
        if (nx) consider(nx.unlock, (x) => unlock(x))
        const b = best as { score: number; cost: number; run: (x: OrbitState) => void } | null
        if (!b || b.cost > s.coins) break
        const n = s.shapes.length
        b.run(s)
        if (firstBuy == null) firstBuy = t
        if (s.shapes.length > n) marks[SHAPES[n].name] = t
      }
    }
    if (log) {
      console.log(`첫 구매: ${firstBuy?.toFixed(1)}초`)
      for (const [k, v] of Object.entries(marks)) console.log(`${k} 해금: ${(v / 60).toFixed(1)}분`)
      console.log(
        `${minutes}분 후: 코인 ${formatKo(s.coins)}, 초당 ${formatKo(incomePerSec(s))}, 누적 ${formatKo(s.runEarned)}, 별가루 예상 ${stardustGain(s.runEarned)}`,
      )
      console.log(s.shapes.map((p, i) => `${SHAPES[i].name}: ${p.ships}척 속도${p.speedLv} 가치${p.valueLv} (${formatKo(shapeIncome(s, i))}/s)`).join('\n'))
    }
    return { s, firstBuy, marks }
  }

  it('30-minute play script hits the pacing targets', () => {
    const { s, firstBuy, marks } = simulate(30, true)
    expect(firstBuy).not.toBeNull()
    expect(firstBuy!).toBeLessThan(12)
    expect(marks['네모']).toBeGreaterThan(45)
    expect(marks['네모']).toBeLessThan(3 * 60)
    expect(marks['오각형']).toBeLessThan(8 * 60)
    expect(s.shapes.length).toBeGreaterThanOrEqual(5)
    // a first supernova should be reachable within the first half hour
    expect(stardustGain(s.runEarned)).toBeGreaterThan(0)
    expect(s.shapes.length).toBeLessThan(SHAPES.length)
  }, 30000)
})
