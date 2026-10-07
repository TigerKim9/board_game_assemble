import type { Difficulty, PlayerConfig } from '../../lib/types'

export const TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** All subsets of the open tiles that add up exactly to the roll. */
export function combos(open: number[], total: number): number[][] {
  const out: number[][] = []
  const n = open.length
  for (let m = 1; m < 1 << n; m++) {
    let s = 0
    const pick: number[] = []
    for (let i = 0; i < n; i++)
      if ((m >> i) & 1) {
        s += open[i]
        pick.push(open[i])
      }
    if (s === total) out.push(pick)
  }
  return out
}

/** One die may be used once 7, 8 and 9 are all shut (when the option is on). */
export function oneDieAllowed(open: number[], option: boolean): boolean {
  return option && !open.some((t) => t >= 7)
}

// ---------- exact expected-score solver (used by the hard AI) ----------

const maskOf = (tiles: number[]) => tiles.reduce((m, t) => m | (1 << (t - 1)), 0)
const tilesOf = (mask: number) => TILES.filter((t) => mask & (1 << (t - 1)))

const memo = new Map<string, number>()

function bestAfter(mask: number, total: number, option: boolean): number {
  const open = tilesOf(mask)
  const cs = combos(open, total)
  if (cs.length === 0) return sumOf(open)
  let best = Infinity
  for (const c of cs) best = Math.min(best, expectedScore(mask & ~maskOf(c), option))
  return best
}

function expectedWithDice(mask: number, dice: 1 | 2, option: boolean): number {
  let acc = 0
  if (dice === 1) {
    for (let a = 1; a <= 6; a++) acc += bestAfter(mask, a, option)
    return acc / 6
  }
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) acc += bestAfter(mask, a + b, option)
  return acc / 36
}

/** Expected final score (lower is better) from a box state with optimal play. */
export function expectedScore(mask: number, option: boolean): number {
  if (mask === 0) return 0
  const key = `${mask}:${option ? 1 : 0}`
  const hit = memo.get(key)
  if (hit != null) return hit
  let v = expectedWithDice(mask, 2, option)
  if (oneDieAllowed(tilesOf(mask), option)) v = Math.min(v, expectedWithDice(mask, 1, option))
  memo.set(key, v)
  return v
}

/** How many dice the AI wants to roll. */
export function aiDiceCount(open: number[], option: boolean, difficulty: Difficulty): 1 | 2 {
  if (!oneDieAllowed(open, option)) return 2
  if (difficulty === 'easy') return 2
  if (difficulty === 'normal') return sumOf(open) <= 6 ? 1 : 2
  const m = maskOf(open)
  return expectedWithDice(m, 1, option) < expectedWithDice(m, 2, option) ? 1 : 2
}

/** Which tiles the AI shuts for a roll (assumes at least one combo exists). */
export function aiChooseTiles(
  open: number[],
  total: number,
  option: boolean,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number[] {
  const cs = combos(open, total)
  if (cs.length === 0) return []
  if (difficulty === 'easy') return cs[Math.floor(rng() * cs.length)]
  if (difficulty === 'normal') {
    // Fewest tiles, then the highest tile.
    return cs.slice().sort((a, b) => a.length - b.length || Math.max(...b) - Math.max(...a))[0]
  }
  const m = maskOf(open)
  let best = cs[0]
  let bestV = Infinity
  for (const c of cs) {
    const v = expectedScore(m & ~maskOf(c), option)
    if (v < bestV - 1e-9) {
      bestV = v
      best = c
    }
  }
  return best
}

// ---------- game state ----------

export type Phase = 'roll' | 'rolling' | 'pick' | 'stuck' | 'shut' | 'over'

export interface BoxState {
  players: PlayerConfig[]
  oneDieOption: boolean
  turn: number
  open: number[]
  dice: number[]
  picked: number[]
  phase: Phase
  /** Final score of each player once their turn is done. */
  results: (number | null)[]
}

export function newBox(players: PlayerConfig[], oneDieOption: boolean): BoxState {
  return {
    players,
    oneDieOption,
    turn: 0,
    open: TILES.slice(),
    dice: [3, 4],
    picked: [],
    phase: 'roll',
    results: players.map(() => null),
  }
}

export function startRoll(s: BoxState, count: 1 | 2): BoxState {
  if (s.phase !== 'roll') return s
  if (count === 1 && !oneDieAllowed(s.open, s.oneDieOption)) return s
  return { ...s, phase: 'rolling', dice: s.dice.slice(0, 1).concat(count === 2 ? [s.dice[1] ?? 1] : []), picked: [] }
}

export function resolveRoll(s: BoxState, values: number[]): BoxState {
  if (s.phase !== 'rolling') return s
  const stuck = combos(s.open, sumOf(values)).length === 0
  return { ...s, dice: values, phase: stuck ? 'stuck' : 'pick', picked: [] }
}

export function togglePick(s: BoxState, tile: number): BoxState {
  if (s.phase !== 'pick' || !s.open.includes(tile)) return s
  const picked = s.picked.includes(tile) ? s.picked.filter((t) => t !== tile) : [...s.picked, tile]
  return { ...s, picked }
}

export const pickValid = (s: BoxState) => s.phase === 'pick' && s.picked.length > 0 && sumOf(s.picked) === sumOf(s.dice)

export function confirmPick(s: BoxState): BoxState {
  if (!pickValid(s)) return s
  const open = s.open.filter((t) => !s.picked.includes(t))
  return { ...s, open, picked: [], phase: open.length === 0 ? 'shut' : 'roll' }
}

/** Records the current player's score and moves on (after 'stuck' or 'shut'). */
export function finishTurn(s: BoxState): BoxState {
  const results = s.results.map((r, i) => (i === s.turn ? sumOf(s.open) : r))
  const next = s.turn + 1
  if (next >= s.players.length) return { ...s, results, phase: 'over' }
  return { ...s, results, turn: next, open: TILES.slice(), picked: [], phase: 'roll', dice: [3, 4] }
}
