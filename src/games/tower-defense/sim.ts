// Headless auto-player used by tests and balance tuning (not used by the UI).
import type { Difficulty } from '../../lib/types'
import {
  COLS,
  DT,
  ROWS,
  TOWERS,
  build,
  callWave,
  isBuildable,
  newGame,
  posAt,
  step,
  towerAt,
  upgrade,
  upgradeCost,
  type State,
  type TowerKind,
} from './logic'

export type PlanStep = TowerKind | 'up'

/** Build spots ranked by how much of the path lies within `range`. */
export function rankSpots(s: State, range: number): { c: number; r: number; cover: number }[] {
  const samples: { x: number; y: number }[] = []
  for (let d = 0; d <= s.geom.length; d += 0.25) samples.push(posAt(s.geom, d))
  const out: { c: number; r: number; cover: number }[] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!isBuildable(s.map, c, r)) continue
      const x = c + 0.5
      const y = r + 0.5
      let cover = 0
      for (const p of samples) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= range * range) cover++
      out.push({ c, r, cover })
    }
  return out.sort((a, b) => b.cover - a.cover)
}

export const PLANS: Record<string, PlanStep[]> = {
  balanced: ['arrow', 'arrow', 'cannon', 'ice', 'up', 'lightning', 'up', 'sniper', 'poison', 'up', 'up', 'cannon', 'up', 'up', 'arrow', 'up', 'up', 'lightning', 'up', 'up', 'sniper', 'up', 'up', 'ice', 'up', 'up', 'cannon', 'up', 'up', 'poison', 'up', 'up', 'sniper', 'up', 'up', 'lightning', 'up', 'up', 'arrow', 'up', 'up'],
  arrowsOnly: ['arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow'],
  sparse: ['arrow', 'cannon', 'up', 'arrow', 'up', 'sniper', 'up', 'up', 'ice', 'up', 'up', 'lightning', 'up', 'up'],
  strong: ['arrow', 'cannon', 'up', 'sniper', 'up', 'ice', 'lightning', 'up', 'up', 'up', 'cannon', 'up', 'up', 'sniper', 'up', 'up', 'poison', 'up', 'up', 'lightning', 'up', 'up', 'cannon', 'up', 'up', 'sniper', 'up', 'up', 'ice', 'up', 'up', 'arrow', 'up', 'up'],
  airAware: ['arrow', 'arrow', 'ice', 'up', 'up', 'lightning', 'sniper', 'up', 'up', 'cannon', 'up', 'up', 'poison', 'up', 'up', 'lightning', 'up', 'up', 'sniper', 'up', 'up', 'arrow', 'up', 'up', 'cannon', 'up', 'up', 'ice', 'up', 'up', 'sniper', 'up', 'up'],
  none: [],
}

export interface SimResult {
  won: boolean
  wave: number
  lives: number
  towers: number
  time: number
}

/** Runs a full game with a scripted build order. `extra` towers repeat after the plan. */
export function simulate(
  mapIndex: number,
  diff: Difficulty,
  plan: PlanStep[],
  opts: { maxWave?: number; repeat?: boolean; earlyCall?: boolean; onWave?: (s: State) => void; onStep?: (s: State) => void } = {},
): SimResult {
  const s = newGame(mapIndex, diff, 1)
  const maxWave = opts.maxWave ?? 30
  const spots: Record<string, { c: number; r: number }[]> = {}
  const spotsFor = (k: TowerKind) => (spots[k] ??= rankSpots(s, TOWERS[k].levels[0].range))
  let i = 0
  const tryStep = (): boolean => {
    if (i >= plan.length) {
      if (!opts.repeat || plan.length === 0) return false
      i = 0
    }
    const st = plan[i]
    if (st === 'up') {
      const cand = s.towers
        .filter((t) => upgradeCost(t) != null)
        .sort((a, b) => a.level - b.level || (upgradeCost(a) ?? 0) - (upgradeCost(b) ?? 0))[0]
      if (!cand) {
        i++
        return false
      }
      if (upgrade(s, cand.id)) {
        i++
        return true
      }
      return false
    }
    if (s.gold[0] < TOWERS[st].costs[0]) return false
    const spot = spotsFor(st).find((p) => !towerAt(s, p.c, p.r))
    if (!spot) {
      i++
      return false
    }
    build(s, st, spot.c, spot.r)
    i++
    return true
  }
  callWave(s)
  let guard = 0
  while (s.status === 'playing' && guard++ < 60 * 60 * 120) {
    if (guard % 15 === 0) while (tryStep());
    if (opts.earlyCall && s.nextWaveIn != null && s.enemies.length === 0) callWave(s)
    const w = s.wave
    step(s, DT)
    if (s.wave !== w) opts.onWave?.(s)
    opts.onStep?.(s)
    if (s.wave > maxWave || (s.wave === maxWave && s.spawns.length === 0 && s.enemies.length === 0)) break
  }
  return {
    won: s.status === 'won' || (s.status === 'playing' && s.wave >= maxWave),
    wave: s.wave,
    lives: s.lives,
    towers: s.towers.length,
    time: Math.round(s.time),
  }
}
