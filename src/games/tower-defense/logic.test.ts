import { describe, expect, it } from 'vitest'
import {
  DIFFS,
  DT,
  MAPS,
  TOTAL_WAVES,
  TOWERS,
  applySlow,
  armorDamage,
  build,
  callWave,
  canBuild,
  chainTargets,
  continueEndless,
  earlyBonus,
  grantShared,
  hpScale,
  isBuildable,
  newGame,
  pathGeom,
  pickTarget,
  posAt,
  sell,
  sellValue,
  spawnEnemy,
  starsFor,
  step,
  transferGold,
  upgrade,
  upgradeCost,
  waveGroups,
  type State,
} from './logic'
import { PLANS, simulate } from './sim'

function run(s: State, seconds: number) {
  for (let t = 0; t < seconds; t += DT) step(s, DT)
}

/** Places an enemy at a given distance along the path. */
function placeAt(s: State, kind: Parameters<typeof spawnEnemy>[1], dist: number, wave = 1) {
  const e = spawnEnemy(s, kind, wave)
  e.dist = dist
  const p = posAt(s.geom, dist)
  e.x = p.x
  e.y = p.y
  return e
}

describe('path', () => {
  it('measures the meadow path and walks along it', () => {
    const g = pathGeom(MAPS[0])
    expect(g.length).toBeCloseTo(33)
    expect(posAt(g, 0)).toEqual({ x: 1.5, y: -0.5 })
    expect(posAt(g, 4)).toEqual({ x: 1.5, y: 3.5 }) // first corner
    expect(posAt(g, 7)).toEqual({ x: 4.5, y: 3.5 })
    expect(posAt(g, 999)).toEqual({ x: 7.5, y: 14.5 })
  })

  it('path tiles and decorations are not buildable', () => {
    for (const m of MAPS) {
      const g = pathGeom(m)
      for (const key of g.tiles) {
        const [c, r] = key.split(',').map(Number)
        expect(isBuildable(m, c, r)).toBe(false)
      }
      for (const b of m.blocked) expect(isBuildable(m, b.c, b.r)).toBe(false)
    }
    expect(isBuildable(MAPS[0], 0, 0)).toBe(true)
    expect(isBuildable(MAPS[0], -1, 0)).toBe(false)
  })

  it('enemies follow the path at their speed', () => {
    const s = newGame(0, 'easy')
    const e = spawnEnemy(s, 'normal', 1)
    run(s, 2)
    expect(e.dist).toBeCloseTo(2 * e.speed, 1)
    expect(e.x).toBeCloseTo(1.5)
    run(s, 4)
    expect(e.y).toBeCloseTo(3.5, 1)
    expect(e.x).toBeGreaterThan(1.5) // turned the corner
  })

  it('leaking enemies cost lives and can end the game', () => {
    const s = newGame(0, 'hard')
    s.status = 'playing'
    const lives = s.lives
    placeAt(s, 'tank', s.geom.length - 0.01)
    step(s)
    expect(s.lives).toBe(lives - 2)
    expect(s.enemies.length).toBe(0)
    s.lives = 1
    placeAt(s, 'normal', s.geom.length - 0.01)
    step(s)
    expect(s.status).toBe('lost')
  })
})

describe('targeting', () => {
  it('picks first / strongest / closest', () => {
    const s = newGame(0, 'easy')
    const t = build(s, 'arrow', 2, 4)!
    // path passes (1.5, 3.5)…(7.5,3.5) right above the tower at (2.5, 4.5)
    const a = placeAt(s, 'normal', 4.2) // near corner, closest
    const b = placeAt(s, 'normal', 6) // further along → first
    const c = placeAt(s, 'tank', 3) // strongest, behind
    c.hp = 500
    expect(pickTarget(s, t)?.id).toBe(b.id)
    t.targeting = 'strongest'
    expect(pickTarget(s, t)?.id).toBe(c.id)
    t.targeting = 'closest'
    expect(pickTarget(s, t)?.id).toBe(a.id)
  })

  it('ignores enemies out of range and cannons cannot hit flyers', () => {
    const s = newGame(0, 'easy')
    const cannon = build(s, 'cannon', 2, 4)!
    placeAt(s, 'flying', 5)
    expect(pickTarget(s, cannon)).toBeNull()
    const ground = placeAt(s, 'normal', 5)
    expect(pickTarget(s, cannon)?.id).toBe(ground.id)
    s.enemies = []
    placeAt(s, 'normal', 30) // far away
    expect(pickTarget(s, cannon)).toBeNull()
  })
})

describe('combat', () => {
  it('armor reduces damage but never below 25%; piercing ignores it', () => {
    expect(armorDamage(10, 4)).toBe(6)
    expect(armorDamage(4, 10)).toBe(1)
    expect(armorDamage(10, 4, true)).toBe(10)
    expect(armorDamage(10, 0)).toBe(10)
  })

  it('arrow towers shoot and kill, giving bounty to the owner', () => {
    const s = newGame(0, 'easy')
    build(s, 'arrow', 2, 4)
    const gold = s.gold[0]
    const e = placeAt(s, 'normal', 5)
    e.speed = 0
    run(s, 4)
    expect(e.dead).toBe(true)
    expect(s.kills).toBe(1)
    expect(s.gold[0]).toBe(gold + e.bounty)
    expect(s.towers[0].kills).toBe(1)
  })

  it('cannon splash hits a group but not distant enemies', () => {
    const s = newGame(0, 'easy')
    build(s, 'cannon', 2, 4)
    const group = [placeAt(s, 'normal', 5), placeAt(s, 'normal', 5.3), placeAt(s, 'normal', 4.8)]
    const far = placeAt(s, 'normal', 8.5)
    for (const e of [...group, far]) e.speed = 0
    run(s, 0.8)
    for (const e of group) expect(e.hp).toBeLessThan(e.maxHp)
    expect(far.hp).toBe(far.maxHp)
  })

  it('ice slows enemies (bosses resist half)', () => {
    const s = newGame(0, 'easy')
    build(s, 'ice', 2, 4)
    const e = placeAt(s, 'tank', 5)
    run(s, 0.7)
    expect(e.slowT).toBeGreaterThan(0)
    expect(e.slowF).toBeCloseTo(TOWERS.ice.levels[0].slow!)
    const d0 = e.dist
    step(s)
    expect(e.dist - d0).toBeCloseTo(e.speed * e.slowF * DT)
    const boss = placeAt(s, 'boss', 1)
    applySlow(boss, 0.4, 2)
    expect(boss.slowF).toBeCloseTo(0.7)
  })

  it('lightning chains between nearby enemies', () => {
    const s = newGame(0, 'easy')
    const es = [5, 5.8, 6.6, 7.4, 12].map((d) => placeAt(s, 'normal', d))
    const hit = chainTargets(s, es[0], 3)
    expect(hit.map((e) => e.id)).toEqual([es[0].id, es[1].id, es[2].id])
    expect(chainTargets(s, es[0], 10).length).toBe(4) // the one at 12 is too far to jump to
    build(s, 'lightning', 2, 4)
    for (const e of es) e.speed = 0
    run(s, 0.4)
    expect(es.slice(0, 3).every((e) => e.hp < e.maxHp)).toBe(true)
  })

  it('poison deals damage over time, ignoring armor', () => {
    const s = newGame(0, 'easy')
    build(s, 'poison', 2, 4)
    const e = placeAt(s, 'tank', 5)
    e.speed = 0
    e.armor = 100
    e.hp = e.maxHp = 1000
    run(s, 0.6)
    expect(e.poisonT).toBeGreaterThan(0)
    const hp = e.hp
    // move the tower away so only the DoT ticks
    s.towers = []
    run(s, 1)
    expect(hp - e.hp).toBeCloseTo(TOWERS.poison.levels[0].dot!, 0)
  })

  it('sniper reaches far and pierces armor', () => {
    const s = newGame(0, 'easy')
    const t = build(s, 'sniper', 4, 6)!
    const e = placeAt(s, 'tank', 5) // (2.5, 3.5): ~3.6 tiles away, beyond arrow range
    expect(Math.hypot(e.x - t.x, e.y - t.y)).toBeGreaterThan(TOWERS.arrow.levels[0].range)
    expect(pickTarget(s, t)?.id).toBe(e.id)
    e.speed = 0
    e.hp = e.maxHp = 500
    run(s, 0.3)
    expect(500 - e.hp).toBe(TOWERS.sniper.levels[0].dmg)
  })

  it('healers heal nearby allies, but heals do not stack', () => {
    const s = newGame(0, 'easy')
    const h1 = placeAt(s, 'healer', 5)
    const h2 = placeAt(s, 'healer', 5.2)
    const e = placeAt(s, 'normal', 5.1)
    for (const x of [h1, h2, e]) x.speed = 0
    e.maxHp = 1000
    e.hp = 100
    run(s, 1.1)
    expect(e.hp).toBeCloseTo(180) // one heal of 8%, not two
  })
})

describe('economy', () => {
  it('builds, upgrades to level 3 and sells for 70%', () => {
    const s = newGame(0, 'normal')
    s.gold[0] = 1000
    expect(canBuild(s, 'arrow', 1, 1)).toBe(false) // path tile
    const t = build(s, 'arrow', 2, 4)!
    expect(s.gold[0]).toBe(950)
    expect(build(s, 'cannon', 2, 4)).toBeNull() // occupied
    expect(upgradeCost(t)).toBe(45)
    expect(upgrade(s, t.id)).toBe(true)
    expect(upgrade(s, t.id)).toBe(true)
    expect(t.level).toBe(3)
    expect(upgrade(s, t.id)).toBe(false)
    expect(t.invested).toBe(50 + 45 + 90)
    const before = s.gold[0]
    expect(sell(s, t.id)).toBe(sellValue(t))
    expect(sellValue(t)).toBe(Math.floor(185 * 0.7))
    expect(s.gold[0]).toBe(before + 129)
    expect(s.towers.length).toBe(0)
  })

  it('cannot build without gold', () => {
    const s = newGame(0, 'normal')
    s.gold[0] = 40
    expect(build(s, 'arrow', 2, 4)).toBeNull()
    expect(s.gold[0]).toBe(40)
  })

  it('early wave calls pay a bonus; launching waves pays income', () => {
    const s = newGame(0, 'normal')
    expect(earlyBonus(s)).toBe(0)
    expect(callWave(s)).toBe(true)
    expect(s.wave).toBe(1)
    expect(callWave(s)).toBe(false) // still spawning
    while (s.nextWaveIn == null) step(s)
    expect(s.nextWaveIn).toBeCloseTo(DIFFS.normal.breakTime)
    const bonus = earlyBonus(s)
    expect(bonus).toBeGreaterThan(0)
    const gold = s.gold[0]
    expect(callWave(s)).toBe(true)
    expect(s.wave).toBe(2)
    expect(s.gold[0]).toBeGreaterThan(gold + bonus) // bonus + wave income
  })

  it('the countdown launches the next wave automatically', () => {
    const s = newGame(0, 'easy')
    callWave(s)
    while (s.nextWaveIn == null) step(s)
    run(s, DIFFS.easy.breakTime + 0.1)
    expect(s.wave).toBe(2)
  })

  it('co-op splits shared income and allows gifts', () => {
    const s = newGame(0, 'easy', 2)
    expect(s.gold).toEqual([110, 110])
    grantShared(s, 15)
    grantShared(s, 15)
    expect(s.gold[0] + s.gold[1]).toBe(250)
    expect(transferGold(s, 0, 1, 25)).toBe(true)
    expect(s.gold[1] - s.gold[0]).toBe(50)
    expect(transferGold(s, 0, 0, 25)).toBe(false)
    expect(transferGold(s, 0, 1, 9999)).toBe(false)
    const t = build(s, 'arrow', 2, 4, 1)!
    expect(t.owner).toBe(1)
    const g0 = s.gold[0]
    sell(s, t.id)
    expect(s.gold[0]).toBe(g0) // refund goes to the owner
  })
})

describe('waves', () => {
  it('every wave has enemies; bosses every 10 waves', () => {
    for (let w = 1; w <= 40; w++) {
      const g = waveGroups(w)
      expect(g.reduce((a, x) => a + x.count, 0)).toBeGreaterThan(0)
      expect(g.some((x) => x.kind === 'boss')).toBe(w % 10 === 0)
    }
  })

  it('introduces all enemy types by wave 10 and grows', () => {
    const kinds = new Set<string>()
    for (let w = 1; w <= 10; w++) for (const g of waveGroups(w)) kinds.add(g.kind)
    expect([...kinds].sort()).toEqual(['boss', 'fast', 'flying', 'healer', 'normal', 'swarm', 'tank'])
    for (let w = 2; w <= 50; w++) expect(hpScale(w)).toBeGreaterThan(hpScale(w - 1))
  })

  it('harder difficulties spawn tougher enemies', () => {
    const hp = (d: 'easy' | 'normal' | 'hard') => spawnEnemy(newGame(0, d), 'normal', 15).maxHp
    expect(hp('easy')).toBeLessThan(hp('normal'))
    expect(hp('normal')).toBeLessThan(hp('hard'))
  })

  it('stars depend on lives left', () => {
    expect(starsFor(30, 30)).toBe(3)
    expect(starsFor(24, 30)).toBe(3)
    expect(starsFor(12, 30)).toBe(2)
    expect(starsFor(1, 30)).toBe(1)
    expect(starsFor(0, 30)).toBe(0)
  })
})

describe('simulation', () => {
  it('a sensible build clears wave 10 on easy on every map', () => {
    for (let m = 0; m < MAPS.length; m++) {
      const r = simulate(m, 'easy', PLANS.balanced, { repeat: true, maxWave: 10 })
      expect(r.won).toBe(true)
      expect(r.lives).toBe(DIFFS.easy.lives)
    }
  })

  it('no defense loses', () => {
    const r = simulate(0, 'easy', PLANS.none, { maxWave: 30 })
    expect(r.won).toBe(false)
    expect(r.lives).toBe(0)
    expect(r.wave).toBeLessThan(10)
  })

  it('the balanced build wins all 30 waves on easy, then endless continues', () => {
    const r = simulate(0, 'easy', PLANS.balanced, { repeat: true })
    expect(r.won).toBe(true)
    expect(r.wave).toBe(TOTAL_WAVES)
    expect(starsFor(r.lives, DIFFS.easy.lives)).toBe(3)

    const s = newGame(0, 'easy')
    s.status = 'won'
    s.wave = TOTAL_WAVES
    continueEndless(s)
    expect(s.status).toBe('playing')
    while (s.wave === TOTAL_WAVES) step(s)
    expect(s.wave).toBe(TOTAL_WAVES + 1)
  })

  it('hard is harder than easy for the same plan', () => {
    const easy = simulate(1, 'easy', PLANS.sparse, {})
    const hard = simulate(1, 'hard', PLANS.sparse, {})
    expect(hard.wave).toBeLessThanOrEqual(easy.wave)
    expect(hard.won).toBe(false)
  })
})
